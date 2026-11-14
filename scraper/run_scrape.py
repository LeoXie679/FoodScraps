#!/usr/bin/env python3
"""
Scrape club Instagram posts via Bright Data → Object Storage → raw_posts.

Usage (from repo root, with .env filled in):
  cd scraper && python run_scrape.py
  cd scraper && python run_scrape.py --limit 3          # first 3 clubs only
  cd scraper && python run_scrape.py --dry-run          # no S3/DB writes
  cd scraper && python run_scrape.py --from-json sample.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

from bright_data import BrightDataError, normalize_post, scrape_profile_sync
from db import connect, count_raw_posts, upsert_raw_post
from storage import make_s3_client, upload_image

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
CLUBS_PATH = ROOT / "clubs.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("scrape")


def load_env() -> None:
    load_dotenv(REPO / ".env")
    load_dotenv(ROOT / ".env")


def load_clubs(limit: int | None) -> list[dict]:
    data = json.loads(CLUBS_PATH.read_text())
    accounts = data["accounts"]
    if limit is not None:
        accounts = accounts[:limit]
    return accounts


def process_posts(
    posts: list[dict],
    *,
    org: str | None,
    dry_run: bool,
    s3,
    bucket: str,
    conn,
    http: httpx.Client,
) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    for raw in posts:
        norm = normalize_post(raw, fallback_org=org)
        if not norm:
            skipped += 1
            continue
        if not norm.get("image_url"):
            log.warning("no image for %s — skip", norm.get("source_url"))
            skipped += 1
            continue

        if dry_run:
            log.info(
                "[dry-run] would store %s image=%s",
                norm.get("source_url"),
                (norm["image_url"] or "")[:80],
            )
            inserted += 1
            continue

        try:
            key = upload_image(
                s3=s3,
                bucket=bucket,
                image_url=norm["image_url"],
                source_url=norm.get("source_url"),
                http=http,
            )
        except Exception as e:
            log.exception("image upload failed for %s: %s", norm.get("source_url"), e)
            skipped += 1
            continue

        row_id = upsert_raw_post(
            conn,
            source=norm["source"],
            source_url=norm.get("source_url"),
            posted_at=norm.get("posted_at"),
            caption=norm.get("caption") or "",
            image_key=key,
        )
        if row_id:
            inserted += 1
            log.info("inserted raw_posts id=%s", row_id)
        else:
            skipped += 1
            log.info("duplicate %s", norm.get("source_url"))
    return inserted, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Bright Data → S3 → raw_posts")
    parser.add_argument("--limit", type=int, default=None, help="Only first N clubs")
    parser.add_argument("--dry-run", action="store_true", help="No S3/DB writes")
    parser.add_argument("--from-json", type=Path, help="Load posts from a saved JSON file")
    parser.add_argument("--days", type=int, default=7, help="Lookback window in days")
    parser.add_argument("--posts-per-club", type=int, default=12)
    args = parser.parse_args()

    load_env()
    token = os.getenv("BRIGHTDATA_API_TOKEN", "").strip()
    dataset = os.getenv("BRIGHTDATA_DATASET_ID", "gd_lk5ns7kz21pck8jpis").strip()
    database_url = os.getenv("DATABASE_URL", "").strip()
    endpoint = os.getenv("S3_ENDPOINT", "").strip()
    access = os.getenv("S3_ACCESS_KEY", "").strip()
    secret = os.getenv("S3_SECRET_KEY", "").strip()
    bucket = os.getenv("S3_BUCKET", "radar-raw").strip()
    region = os.getenv("S3_REGION", "us-east-1").strip()

    if not args.from_json and not token:
        log.error("Set BRIGHTDATA_API_TOKEN in .env (or use --from-json)")
        return 1

    if not args.dry_run:
        missing = [
            name
            for name, val in [
                ("DATABASE_URL", database_url),
                ("S3_ENDPOINT", endpoint),
                ("S3_ACCESS_KEY", access),
                ("S3_SECRET_KEY", secret),
            ]
            if not val
        ]
        if missing:
            log.error("Missing env vars for write mode: %s", ", ".join(missing))
            log.error("Use --dry-run to test Bright Data without cloud, or fill .env")
            return 1

    s3 = None
    conn = None
    if not args.dry_run:
        s3 = make_s3_client(endpoint, access, secret, region)
        conn = connect(database_url)

    total_in = 0
    total_skip = 0

    with httpx.Client(timeout=180.0, follow_redirects=True) as http:
        if args.from_json:
            posts = json.loads(Path(args.from_json).read_text())
            if isinstance(posts, dict):
                posts = posts.get("posts") or posts.get("data") or [posts]
            ins, sk = process_posts(
                posts,
                org=None,
                dry_run=args.dry_run,
                s3=s3,
                bucket=bucket,
                conn=conn,
                http=http,
            )
            total_in += ins
            total_skip += sk
        else:
            clubs = load_clubs(args.limit)
            log.info("scraping %d club accounts (last %d days)", len(clubs), args.days)
            for club in clubs:
                url = club["url"]
                org = club.get("org") or club.get("handle")
                log.info("--- %s (%s)", org, url)
                try:
                    posts = scrape_profile_sync(
                        token,
                        url,
                        dataset_id=dataset,
                        days=args.days,
                        num_of_posts=args.posts_per_club,
                        client=http,
                    )
                except BrightDataError as e:
                    log.error("Bright Data failed for %s: %s", url, e)
                    continue
                except Exception as e:
                    log.exception("unexpected error for %s: %s", url, e)
                    continue

                # Save raw JSON for debugging
                samples = ROOT / "samples"
                samples.mkdir(exist_ok=True)
                out = samples / f"{club.get('handle', 'club')}.json"
                out.write_text(json.dumps(posts, indent=2)[:2_000_000])
                log.info("saved %s (%d posts)", out.name, len(posts))

                ins, sk = process_posts(
                    posts,
                    org=org,
                    dry_run=args.dry_run,
                    s3=s3,
                    bucket=bucket,
                    conn=conn,
                    http=http,
                )
                total_in += ins
                total_skip += sk

    if conn is not None:
        n = count_raw_posts(conn)
        conn.close()
        log.info("done. inserted=%d skipped=%d raw_posts_total=%d", total_in, total_skip, n)
    else:
        log.info("done (dry-run). would_insert=%d skipped=%d", total_in, total_skip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
