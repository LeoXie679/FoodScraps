#!/bin/sh
# Called every 30 minutes by the scrape-cron compose service.
# Hits the API admin endpoint, which scrapes then calls the pipeline.
set -eu

LOCKDIR=/tmp/scrape-cron.lock
API_URL="${SCRAPE_CRON_URL:-http://api:8000/admin/scrape-now}"

if [ -z "${ADMIN_TOKEN:-}" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ADMIN_TOKEN missing; skip"
  exit 1
fi

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) previous scrape still running; skip"
  exit 0
fi
trap 'rmdir "$LOCKDIR"' EXIT

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) starting scrape-now -> $API_URL"
# Bright Data + vision can take several minutes; allow up to 16 minutes.
HTTP_CODE=$(curl -sS -o /tmp/scrape-cron.out -w "%{http_code}" \
  -X POST \
  -H "X-Admin-Token: ${ADMIN_TOKEN}" \
  --max-time 960 \
  "$API_URL" || true)

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) HTTP $HTTP_CODE"
head -c 2000 /tmp/scrape-cron.out 2>/dev/null || true
echo
