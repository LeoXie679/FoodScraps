#!/usr/bin/env bash
# Apply schema + seed buildings. Requires DATABASE_URL in ../.env
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set. Put it in .env first."
  exit 1
fi
echo "Applying schema.sql ..."
psql "$DATABASE_URL" -f infra/schema.sql
echo "Seeding buildings ..."
psql "$DATABASE_URL" -f infra/seed_buildings.sql
echo "Done."
