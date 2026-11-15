"""Free Food Radar API — Person A contract endpoints."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import get_conn

REPO = Path(__file__).resolve().parent.parent
load_dotenv(REPO / ".env")

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "").rstrip("/")
S3_BUCKET = os.getenv("S3_BUCKET", "radar-raw")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "changeme")
PIPELINE_URL = os.getenv("PIPELINE_URL", "").strip()
PIPELINE_TOKEN = os.getenv("PIPELINE_TOKEN", "").strip()
LEFTOVER_TTL_HOURS = float(os.getenv("LEFTOVER_TTL_HOURS", "2"))

app = FastAPI(title="Free Food Radar API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_s3 = None


def _s3_client():
    global _s3
    if _s3 is not None:
        return _s3
    if not (S3_ENDPOINT and S3_ACCESS_KEY and S3_SECRET_KEY):
        return None
    import boto3
    from botocore.client import Config

    _s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4"),
    )
    return _s3


def image_public_url(image_key):
    if not image_key:
        return None
    if image_key.startswith("http://") or image_key.startswith("https://"):
        return image_key
    client = _s3_client()
    if client:
        try:
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": image_key},
                ExpiresIn=3600 * 6,
            )
        except Exception:
            pass
    host = S3_ENDPOINT.replace("https://", "").replace("http://", "")
    if not host:
        return None
    return f"https://{S3_BUCKET}.{host}/{image_key}"


class LeftoverIn(BaseModel):
    location_name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    posted_by: Optional[str] = None


@app.get("/health")
def health():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        db = "ok"
    except Exception as e:
        db = f"error: {e}"
    return {"status": "ok", "db": db}


@app.get("/events")
def list_events(
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    dietary: Optional[str] = None,
):
    clauses = ["e.has_food = TRUE"]
    params = []

    if from_:
        clauses.append("e.start_time >= %s")
        params.append(from_)
    if to:
        clauses.append("e.start_time <= %s")
        params.append(to)
    if dietary:
        clauses.append("%s = ANY(e.dietary)")
        params.append(dietary.lower())

    where = " AND ".join(clauses)
    sql = f"""
        SELECT e.id, e.title, e.org, e.start_time, e.end_time, e.location_name,
               e.lat, e.lng, e.has_food, e.food_desc, e.dietary, e.confidence,
               e.cluster_id, r.source_url, r.image_key
        FROM events e
        LEFT JOIN raw_posts r ON r.id = e.raw_post_id
        WHERE {where}
        ORDER BY e.start_time ASC NULLS LAST
        LIMIT 500
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    out = []
    for row in rows:
        item = dict(row)
        item["image_url"] = image_public_url(item.pop("image_key", None))
        item["dietary"] = list(item.get("dietary") or [])
        # ISO strings for JSON
        for k in ("start_time", "end_time"):
            if item.get(k) is not None:
                item[k] = item[k].isoformat()
        out.append(item)
    return out


@app.get("/events/{event_id}")
def get_event(event_id: int):
    sql = """
        SELECT e.id, e.title, e.org, e.start_time, e.end_time, e.location_name,
               e.lat, e.lng, e.has_food, e.food_desc, e.dietary, e.confidence,
               e.cluster_id, r.source_url, r.image_key, r.caption
        FROM events e
        LEFT JOIN raw_posts r ON r.id = e.raw_post_id
        WHERE e.id = %s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (event_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(404, "event not found")
    item = dict(row)
    item["image_url"] = image_public_url(item.pop("image_key", None))
    item["dietary"] = list(item.get("dietary") or [])
    for k in ("start_time", "end_time"):
        if item.get(k) is not None:
            item[k] = item[k].isoformat()
    return item


def _resolve_building(conn, location_name):
    name = location_name.strip()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT lat, lng FROM buildings
            WHERE lower(name) = lower(%s)
               OR EXISTS (
                    SELECT 1 FROM unnest(aliases) a WHERE lower(a) = lower(%s)
               )
            LIMIT 1
            """,
            (name, name),
        )
        row = cur.fetchone()
        if row:
            return row["lat"], row["lng"]
        # fuzzy: name contained in building name or alias
        cur.execute(
            """
            SELECT lat, lng, name FROM buildings
            WHERE lower(name) LIKE lower(%s)
               OR EXISTS (
                    SELECT 1 FROM unnest(aliases) a WHERE lower(a) LIKE lower(%s)
               )
            LIMIT 1
            """,
            (f"%{name}%", f"%{name}%"),
        )
        row = cur.fetchone()
        if row:
            return row["lat"], row["lng"]
    return None, None


@app.post("/leftovers")
def create_leftover(body: LeftoverIn):
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=LEFTOVER_TTL_HOURS)
    with get_conn() as conn:
        lat, lng = _resolve_building(conn, body.location_name)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO leftovers (location_name, lat, lng, description, posted_by, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, location_name, lat, lng, description, posted_by, created_at, expires_at
                """,
                (
                    body.location_name,
                    lat,
                    lng,
                    body.description,
                    body.posted_by,
                    now,
                    expires,
                ),
            )
            row = cur.fetchone()
            conn.commit()
    item = dict(row)
    for k in ("created_at", "expires_at"):
        item[k] = item[k].isoformat()
    return item


@app.get("/leftovers/active")
def active_leftovers():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, location_name, lat, lng, description, posted_by, created_at, expires_at
                FROM leftovers
                WHERE expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 200
                """
            )
            rows = cur.fetchall()
    out = []
    for row in rows:
        item = dict(row)
        for k in ("created_at", "expires_at"):
            item[k] = item[k].isoformat()
        out.append(item)
    return out


def _check_admin(authorization, x_admin_token):
    token = None
    if x_admin_token:
        token = x_admin_token
    elif authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token or token != ADMIN_TOKEN:
        raise HTTPException(401, "unauthorized")


@app.post("/admin/scrape-now")
def scrape_now(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None),
    limit: Optional[int] = Query(None, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    """Trigger one scrape run (for the live demo / scrape-cron)."""
    _check_admin(authorization, x_admin_token)
    scraper = REPO / "scraper" / "run_scrape.py"
    cmd = [sys.executable, str(scraper)]
    if limit:
        cmd.extend(["--limit", str(limit)])
    if offset:
        cmd.extend(["--offset", str(offset)])
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO / "scraper"),
            capture_output=True,
            text=True,
            timeout=900,
            env={**os.environ},
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "scrape timed out") from None

    pipeline = None
    if PIPELINE_URL and proc.returncode == 0:
        try:
            headers = {}
            if PIPELINE_TOKEN:
                headers["Authorization"] = f"Bearer {PIPELINE_TOKEN}"
            with httpx.Client(timeout=120.0) as client:
                pr = client.post(PIPELINE_URL, headers=headers)
                pipeline = {"status_code": pr.status_code, "body": pr.text[:500]}
        except Exception as e:
            pipeline = {"error": str(e)}

    return {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout_tail": proc.stdout[-2000:],
        "stderr_tail": proc.stderr[-2000:],
        "pipeline": pipeline,
    }
