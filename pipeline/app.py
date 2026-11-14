
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


def match_building(conn, location):
    if not location:
        return None

    with conn.cursor() as cur:
        cur.execute("SELECT name, aliases, lat, lng FROM buildings")
        buildings = cur.fetchall()

    choices = {}

    for building in buildings:
        choices[building["name"]] = building
        for alias in building["aliases"]:
            choices[alias] = building

    if not choices:
        return None

    match = process.extractOne(
        location,
        list(choices.keys()),
        scorer=fuzz.WRatio,
    )

    if match and match[1] >= 80:
        return choices[match[0]]

    return None


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

        if not result.title:
            raise ValueError("Event has no title")

        building = match_building(conn, result.location)
        logger.info(
            "Post %s: AI location=%r, matched building=%r",
            post_id,
            result.location,
            building["name"] if building else None,
        )

        location_name = (
            building["name"]
            if building
            else result.location
        )

        lat = building["lat"] if building else None
        lng = building["lng"] if building else None

        start_time = make_timestamp(result.date, result.start)
        end_time = make_timestamp(result.date, result.end)

        confidence = calculate_confidence(
            result.extraction_confidence,
            result.date,
            result.start,
        )

        # Check whether this event already exists.
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

            candidate = {
                "title": result.title,
                "org": result.org,
                "location_name": location_name,
                "date": result.date,
            }

            duplicate = any(
                are_duplicates(candidate, dict(event))
                for event in existing_events
            )

            if duplicate:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE raw_posts SET status = 'processed' WHERE id = %s",
                        (post_id,),
                    )
                conn.commit()
                logger.info("Duplicate event skipped for post %s", post_id)
                return "duplicate"

        with conn.cursor() as cur:
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
                    lat,
                    lng,
                    result.has_food,
                    result.food,
                    result.dietary,
                    confidence,
                ),
            )

            cur.execute(
                "UPDATE raw_posts SET status = 'processed' WHERE id = %s",
                (post_id,),
            )

        conn.commit()

        logger.info("Successfully processed post %s", post_id)
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
                WHERE status = 'new'
                ORDER BY created_at ASC
                LIMIT 50
                """
            )
            posts = cur.fetchall()

        results = {
            "processed": 0,
            "not_food": 0,
            "duplicate": 0,
            "failed": 0,
        }

        for post in posts:
            status = process_post(conn, s3, post)
            results[status] += 1

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
