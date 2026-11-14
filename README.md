# Free Food Radar (FoodScraps)

Live campus map of free food at UCSD. Bright Data scrapes club flyers → Vultr Object Storage → vision pipeline → Postgres → React/Leaflet map.

## Repo layout

| Path | Owner | Role |
|------|--------|------|
| `/scraper` | Person A | Bright Data jobs, upload images, insert `raw_posts` |
| `/pipeline` | Person B | Vision extraction, dedup, scoring |
| `/api` | Person A | FastAPI endpoints |
| `/web` | Person C | React map app |
| `/infra` | Person A | Docker Compose, Caddy, SQL |

## Person A quick start

See **[SETUP_FOR_HUGO.md](SETUP_FOR_HUGO.md)** for click-by-click Vultr / Bright Data / Neon steps.

```bash
cp .env.example .env   # fill keys
cd scraper && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run_scrape.py --limit 1 --dry-run
```

## API contract

- `GET /health`
- `GET /events?from=&to=&dietary=`
- `GET /events/{id}`
- `POST /leftovers` `{location_name, description, posted_by?}`
- `GET /leftovers/active`
- `POST /admin/scrape-now` (header `X-Admin-Token`) — also run automatically every 30 minutes by the `scrape-cron` compose service (scrape → pipeline)

## Deploy (on Vultr Compute)

```bash
git clone <this-repo> && cd FoodScraps
# copy .env onto the server
docker compose -f infra/docker-compose.yml up -d --build
curl http://YOUR_IP/health
```
