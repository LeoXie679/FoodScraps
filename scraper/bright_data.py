"""Bright Data Instagram post discovery helpers."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

log = logging.getLogger(__name__)

BASE = "https://api.brightdata.com/datasets/v3"
# Discover recent posts from a profile URL
DEFAULT_DATASET = "gd_lk5ns7kz21pck8jpis"


class BrightDataError(RuntimeError):
    pass


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _date_mm_dd_yyyy(dt: datetime) -> str:
    return dt.strftime("%m-%d-%Y")


def trigger_discover_posts(
    token: str,
    profile_urls: list[str],
    *,
    dataset_id: str = DEFAULT_DATASET,
    days: int = 7,
    num_of_posts: int = 12,
    client: httpx.Client | None = None,
) -> str:
    """Start an async discover job. Returns snapshot_id."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    payload = {
        "input": [
            {
                "url": url if url.endswith("/") else url + "/",
                "num_of_posts": num_of_posts,
                "start_date": _date_mm_dd_yyyy(start),
                "end_date": _date_mm_dd_yyyy(now + timedelta(days=1)),
                "post_type": "Post",
            }
            for url in profile_urls
        ]
    }
    params = {
        "dataset_id": dataset_id,
        "include_errors": "true",
        "type": "discover_new",
        "discover_by": "url",
    }
    own = client is None
    client = client or httpx.Client(timeout=120.0)
    try:
        # Prefer async trigger for batches; fall back to /scrape which may 202.
        r = client.post(
            f"{BASE}/trigger",
            params=params,
            headers=_headers(token),
            json=payload,
        )
        if r.status_code >= 400:
            r = client.post(
                f"{BASE}/scrape",
                params={**params, "format": "json"},
                headers=_headers(token),
                json=payload,
            )
        if r.status_code == 200:
            # Sync response with data — stash under a fake snapshot handled by caller
            data = r.json()
            if isinstance(data, list):
                raise BrightDataError(
                    "sync_result:" + str(len(data))
                )  # caller shouldn't hit this path via trigger
        if r.status_code not in (200, 202):
            raise BrightDataError(f"trigger failed {r.status_code}: {r.text[:500]}")
        body = r.json()
        snapshot_id = body.get("snapshot_id") or body.get("snapshotId")
        if not snapshot_id:
            # Sometimes /scrape returns data directly
            if isinstance(body, list):
                return "__inline__"
            raise BrightDataError(f"no snapshot_id in response: {body}")
        return snapshot_id
    finally:
        if own:
            client.close()


def scrape_profile_sync(
    token: str,
    profile_url: str,
    *,
    dataset_id: str = DEFAULT_DATASET,
    days: int = 7,
    num_of_posts: int = 12,
    client: httpx.Client | None = None,
) -> list[dict[str, Any]]:
    """Scrape one profile. Handles sync JSON or 202+poll."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    payload = {
        "input": [
            {
                "url": profile_url if profile_url.endswith("/") else profile_url + "/",
                "num_of_posts": num_of_posts,
                "start_date": _date_mm_dd_yyyy(start),
                "end_date": _date_mm_dd_yyyy(now + timedelta(days=1)),
                "post_type": "Post",
            }
        ]
    }
    params = {
        "dataset_id": dataset_id,
        "format": "json",
        "include_errors": "true",
        "type": "discover_new",
        "discover_by": "url",
    }
    own = client is None
    client = client or httpx.Client(timeout=180.0)
    try:
        r = client.post(
            f"{BASE}/scrape",
            params=params,
            headers=_headers(token),
            json=payload,
        )
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "snapshot_id" in data:
                return wait_and_download(token, data["snapshot_id"], client=client)
            return [data] if isinstance(data, dict) else []
        if r.status_code == 202:
            snap = r.json().get("snapshot_id")
            if not snap:
                raise BrightDataError(f"202 without snapshot_id: {r.text[:300]}")
            return wait_and_download(token, snap, client=client)
        raise BrightDataError(f"scrape failed {r.status_code}: {r.text[:500]}")
    finally:
        if own:
            client.close()


def wait_and_download(
    token: str,
    snapshot_id: str,
    *,
    client: httpx.Client | None = None,
    timeout_sec: int = 600,
    poll_every: float = 5.0,
) -> list[dict[str, Any]]:
    own = client is None
    client = client or httpx.Client(timeout=120.0)
    try:
        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            pr = client.get(
                f"{BASE}/progress/{snapshot_id}",
                headers=_headers(token),
            )
            if pr.status_code >= 400:
                raise BrightDataError(f"progress {pr.status_code}: {pr.text[:300]}")
            status = (pr.json() or {}).get("status", "").lower()
            log.info("snapshot %s status=%s", snapshot_id, status)
            if status in ("ready", "done", "completed", "success"):
                break
            if status in ("failed", "error"):
                raise BrightDataError(f"snapshot failed: {pr.text[:400]}")
            time.sleep(poll_every)
        else:
            raise BrightDataError(f"snapshot {snapshot_id} timed out")

        dr = client.get(
            f"{BASE}/snapshot/{snapshot_id}",
            params={"format": "json"},
            headers=_headers(token),
        )
        if dr.status_code >= 400:
            raise BrightDataError(f"download {dr.status_code}: {dr.text[:400]}")
        data = dr.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []
    finally:
        if own:
            client.close()


def normalize_post(raw: dict[str, Any], fallback_org: str | None = None) -> dict[str, Any] | None:
    """Map Bright Data Instagram post fields → our raw_posts shape."""
    if raw.get("error") or raw.get("error_code"):
        log.warning("skip error row: %s", raw.get("error") or raw.get("error_code"))
        return None

    source_url = raw.get("url") or raw.get("post_url") or raw.get("shortcode_url")
    if not source_url and isinstance(raw.get("input"), dict):
        source_url = raw["input"].get("url")

    image_url = raw.get("display_url") or raw.get("image_url") or raw.get("thumbnail")
    if not image_url and isinstance(raw.get("photos"), list) and raw["photos"]:
        image_url = raw["photos"][0]
    if not image_url and isinstance(raw.get("images"), list) and raw["images"]:
        image_url = raw["images"][0]
    if isinstance(image_url, dict):
        image_url = image_url.get("url") or image_url.get("src")

    caption = raw.get("caption") or raw.get("description") or raw.get("content") or ""
    if isinstance(caption, dict):
        caption = caption.get("text") or ""

    posted_at = raw.get("date_posted") or raw.get("timestamp") or raw.get("taken_at")
    org = (
        raw.get("user_posted")
        or raw.get("username")
        or raw.get("profile_username")
        or fallback_org
    )

    if not source_url and not image_url:
        return None

    return {
        "source": "instagram",
        "source_url": source_url,
        "posted_at": posted_at,
        "caption": caption or "",
        "image_url": image_url,
        "org": org,
        "raw": raw,
    }
