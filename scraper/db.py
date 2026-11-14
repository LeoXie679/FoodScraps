"""Postgres helpers for raw_posts inserts."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row

log = logging.getLogger(__name__)


def connect(database_url: str):
    return psycopg.connect(database_url, row_factory=dict_row)


def parse_posted_at(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        # seconds or ms
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.utcfromtimestamp(ts)
    if isinstance(value, str):
        v = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(v)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m-%d-%Y"):
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue
    return None


def upsert_raw_post(
    conn,
    *,
    source: str,
    source_url: str | None,
    posted_at: Any,
    caption: str,
    image_key: str | None,
) -> int | None:
    """Insert raw_posts row if new. Returns id or None if duplicate."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO raw_posts (source, source_url, posted_at, caption, image_key, status)
            VALUES (%s, %s, %s, %s, %s, 'new')
            ON CONFLICT (source, source_url) DO NOTHING
            RETURNING id
            """,
            (
                source,
                source_url,
                parse_posted_at(posted_at),
                caption,
                image_key,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return row["id"] if row else None


def count_raw_posts(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM raw_posts")
        return int(cur.fetchone()["n"])
