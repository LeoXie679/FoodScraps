
import os
import logging
import tempfile
from datetime import datetime, date, time
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

import boto3
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from rapidfuzz import fuzz, process

from api.db import get_conn
from pipeline.vision import extract_event
from pipeline.schemas import EventExtraction
from pipeline.scoring import calculate_confidence
from pipeline.dedup import are_duplicates

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Free Food Radar AI Pipeline")

TIMEZONE = ZoneInfo("America/Los_Angeles")


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT", "").rstrip("/"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
    )


def _load_buildings(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT name, aliases, lat, lng FROM buildings")
        return cur.fetchall()


def match_building(conn, location, buildings=None):
    if not location:
        return None

    buildings = buildings if buildings is not None else _load_buildings(conn)
    choices = {}

    for building in buildings:
        choices[building["name"]] = building
        for alias in building["aliases"] or []:
            choices[alias] = building

    if not choices:
        return None

    match = process.extractOne(
        location,
        list(choices.keys()),
        scorer=fuzz.WRatio,
    )

    if match and match[1] >= 85:
        return choices[match[0]]

    return None


def _split_location_parts(text: str) -> list[str]:
    """Split flyer multi-venue lists like '64 Degrees • Pines • Ventanas'."""
    if not text:
        return []
    # Normalize common separators, then comma-split.
    normalized = text
    for sep in ("•", "·", "|", "/", ";", "\n"):
        normalized = normalized.replace(sep, ",")
    normalized = normalized.replace(" and ", ",")
    return [part.strip() for part in normalized.split(",") if part.strip()]


def match_buildings_in_text(conn, text, buildings=None, *, bullet_lines_only=False):
    """
    Find all known buildings mentioned in a location string or caption.
    Splits multi-venue lists (• / , / and) and fuzzy-matches each segment.
    """
    if not text or not text.strip():
        return []

    buildings = buildings if buildings is not None else _load_buildings(conn)
    found: dict[str, dict] = {}

    if bullet_lines_only:
        lines = [
            line for line in text.splitlines()
            if "•" in line or "·" in line
        ]
        if not lines:
            return []
        parts = []
        for line in lines:
            parts.extend(_split_location_parts(line))
    else:
        stripped = text.strip()
        # Single short location from the model — match as a whole first.
        if len(stripped) <= 60 and "•" not in stripped and "·" not in stripped:
            matched = match_building(conn, stripped, buildings=buildings)
            return [matched] if matched else []
        parts = _split_location_parts(stripped)

    for part in parts:
        if len(part) > 60:
            continue
        matched = match_building(conn, part, buildings=buildings)
        if not matched:
            continue
        # Reject weak fuzzy hits on short/noisy fragments (menus, etc.).
        labels = [matched["name"], *(matched.get("aliases") or [])]
        part_l = part.lower()
        if not any(label.lower() in part_l or part_l in label.lower() for label in labels):
            continue
        found[matched["name"]] = matched

    return list(found.values())


def resolve_event_buildings(conn, location, caption=""):
    """
    Resolve one or more map pins for an extracted event.
    Multi-venue HDH flyers (e.g. Friendsgiving) list several dining halls.
    """
    buildings = _load_buildings(conn)
    from_location = match_buildings_in_text(
        conn, location or "", buildings=buildings
    )
    if len(from_location) >= 2:
        return from_location

    # Captions often list venues on a single bulleted line; ignore menu prose.
    from_caption = match_buildings_in_text(
        conn,
        caption or "",
        buildings=buildings,
        bullet_lines_only=True,
    )
    if len(from_caption) >= 2:
        return from_caption

    if from_location:
        return from_location

    single = match_building(conn, location, buildings=buildings)
    return [single] if single else []


def make_timestamp(event_date, event_time):
    if not event_date or not event_time:
        return None

    return datetime.combine(
        date.fromisoformat(event_date),
        time.fromisoformat(event_time),
        tzinfo=TIMEZONE,
    )


def process_post(conn, s3, post):
    post_id = post["id"]

    try:
        if not post["image_key"]:
            raise ValueError("Post has no image_key")

        bucket = os.getenv("S3_BUCKET", "radar-raw")

        image = s3.get_object(
            Bucket=bucket,
            Key=post["image_key"],
        )

        image_bytes = image["Body"].read()

        with tempfile.NamedTemporaryFile(suffix=".jpg") as temp:
            temp.write(image_bytes)
            temp.flush()

            result = None
            last_error = None

            # Validate the model response; retry once if invalid.
            for attempt in range(2):
                try:
                    raw_result = extract_event(
                        temp.name,
                        post["caption"] or "",
                    )
                    result = EventExtraction(**raw_result)
                    break
                except Exception as error:
                    last_error = error
                    logger.warning(
                        "Post %s extraction attempt %s failed: %s",
                        post_id,
                        attempt + 1,
                        error,
                    )

            if result is None:
                raise ValueError(
                    f"Extraction failed after retry: {last_error}"
                )

        if not result.is_event or not result.has_food:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE raw_posts SET status = 'not_food' WHERE id = %s",
                    (post_id,),
                )
            conn.commit()
            return "not_food"
        if not result.date:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE raw_posts SET status = 'no_date' WHERE id = %s",
                    (post_id,),
                )
            conn.commit()
            return "no_date"

        if not result.title:
            raise ValueError("Event has no title")

        matched_buildings = resolve_event_buildings(
            conn,
            result.location,
            caption=post.get("caption") or "",
        )
        logger.info(
            "Post %s: AI location=%r, matched buildings=%r",
            post_id,
            result.location,
            [b["name"] for b in matched_buildings] if matched_buildings else None,
        )

        # One pin per matched venue; fall back to a single unmatched location row.
        venue_rows = matched_buildings or [
            {
                "name": result.location,
                "lat": None,
                "lng": None,
            }
        ]

        start_time = make_timestamp(result.date, result.start)
        end_time = make_timestamp(result.date, result.end)

        confidence = calculate_confidence(
            result.extraction_confidence,
            result.date,
            result.start,
        )

        existing_events = []
        if result.date:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        title,
                        org,
                        location_name,
                        (start_time AT TIME ZONE 'America/Los_Angeles')::date AS date
                    FROM events
                    WHERE (start_time AT TIME ZONE 'America/Los_Angeles')::date = %s::date
                    """,
                    (result.date,),
                )
                existing_events = cur.fetchall()

        inserted = 0
        skipped_dup = 0
        with conn.cursor() as cur:
            for building in venue_rows:
                location_name = building.get("name") or result.location
                candidate = {
                    "title": result.title,
                    "org": result.org,
                    "location_name": location_name,
                    "date": result.date,
                }
                if result.date and any(
                    are_duplicates(candidate, dict(event))
                    for event in existing_events
                ):
                    skipped_dup += 1
                    continue

                cur.execute(
                    """
                    INSERT INTO events (
                        raw_post_id,
                        title,
                        org,
                        start_time,
                        end_time,
                        location_name,
                        lat,
                        lng,
                        has_food,
                        food_desc,
                        dietary,
                        confidence
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s
                    )
                    """,
                    (
                        post_id,
                        result.title,
                        result.org,
                        start_time,
                        end_time,
                        location_name,
                        building.get("lat"),
                        building.get("lng"),
                        result.has_food,
                        result.food,
                        result.dietary,
                        confidence,
                    ),
                )
                inserted += 1
                existing_events.append(candidate)

            cur.execute(
                "UPDATE raw_posts SET status = 'processed' WHERE id = %s",
                (post_id,),
            )

        conn.commit()

        if inserted == 0 and skipped_dup:
            logger.info("Duplicate event skipped for post %s", post_id)
            return "duplicate"

        logger.info(
            "Successfully processed post %s (%d event row(s))",
            post_id,
            inserted,
        )
        return "processed"

    except Exception:
        conn.rollback()
        logger.exception("Failed to process post %s", post_id)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE raw_posts SET status = 'failed' WHERE id = %s",
                (post_id,),
            )

        conn.commit()
        return "failed"


def process_new_posts():
    required = [
        "DATABASE_URL",
        "S3_ENDPOINT",
        "S3_ACCESS_KEY",
        "S3_SECRET_KEY",
        "VULTR_INFERENCE_API_KEY",
    ]

    missing = [key for key in required if not os.getenv(key)]

    if missing:
        raise RuntimeError(
            "Missing environment variables: " + ", ".join(missing)
        )

    s3 = get_s3_client()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, caption, image_key
                FROM raw_posts
                WHERE status IN ('new', 'no_date')
                ORDER BY created_at ASC
                LIMIT 50
                """
            )
            posts = cur.fetchall()

        results = {
            "processed": 0,
            "not_food": 0,
            "no_date": 0,
            "duplicate": 0,
            "failed": 0,
        }

        for post in posts:
            status = process_post(conn, s3, post)
            results[status] = results.get(status, 0) + 1

    return {
        "total": len(posts),
        **results,
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "pipeline"}


@app.post("/process")
def process_endpoint(
    authorization: Optional[str] = Header(default=None),
):
    expected_token = os.getenv("PIPELINE_TOKEN", "").strip()

    if expected_token:
        supplied_token = ""
        if authorization and authorization.lower().startswith("bearer "):
            supplied_token = authorization.split(" ", 1)[1].strip()

        if supplied_token != expected_token:
            raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        return process_new_posts()
    except Exception as error:
        logger.exception("Pipeline request failed")
        raise HTTPException(
            status_code=500,
            detail=str(error),
        ) from error
