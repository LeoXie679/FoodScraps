#!/usr/bin/env bash
# Run ON the Vultr server as root after git clone.
set -euo pipefail
cd /opt/FoodScraps
export SITE_ADDRESS=:80
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps
curl -fsS http://127.0.0.1/health || curl -fsS http://127.0.0.1:80/health || true
