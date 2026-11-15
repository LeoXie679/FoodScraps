# Free Food Radar

**Find free food on the UC San Diego campus — in real time.**

Free Food Radar (FoodScraps) turns club flyers and social posts into a live campus map. Students can see where free food is happening now, filter by dietary needs, and report leftovers so fewer meals go to waste.

## Goals

- **Discoverability** — Surface free-food events that are easy to miss across Instagram and club channels.
- **Accuracy** — Use vision AI to read flyers, match locations to UCSD buildings, and dedupe noisy posts.
- **Immediacy** — Keep the map fresh with scheduled scrapes and leftover reports that expire after a few hours.
- **Accessibility** — Give every student a simple map view of what’s available, not another feed to scroll.

## How it works

```text
Club Instagram / flyers
        ↓
   Bright Data scrape
        ↓
 Vultr Object Storage
        ↓
  AI vision pipeline
        ↓
     PostgreSQL
        ↓
 React + Leaflet map
```

1. **Scraper** collects club posts and flyer images.
2. **Pipeline** extracts event details (title, time, location, food, dietary info), scores confidence, and filters duplicates.
3. **API** serves events and leftover reports.
4. **Web app** plots everything on an interactive UCSD campus map.

## Repo layout

| Path | Role |
|------|------|
| [`scraper/`](scraper/) | Bright Data jobs, image upload, `raw_posts` inserts |
| [`pipeline/`](pipeline/) | Vision extraction, building match, dedup, scoring |
| [`api/`](api/) | FastAPI endpoints for events and leftovers |
| [`web/`](web/) | React + Leaflet campus map |
| [`infra/`](infra/) | Docker Compose, Caddy, SQL |

## Quick start

```bash
cp .env.example .env   # fill in keys
cd scraper && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run_scrape.py --limit 1 --dry-run
```

See [`.env.example`](.env.example) for required Bright Data, Postgres, S3, and inference credentials.

### API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/health` | Health check |
| `GET` | `/events?from=&to=&dietary=` | List events |
| `GET` | `/events/{id}` | Event detail |
| `POST` | `/leftovers` | Report leftovers `{location_name, description, posted_by?}` |
| `GET` | `/leftovers/active` | Active leftover reports |
| `POST` | `/admin/scrape-now` | Trigger scrape (`X-Admin-Token`; optional `?limit=&offset=`) |

Scrapes also run automatically every 30 minutes via `scrape-cron` (rotating ~12-club slices so jobs finish within the 15-minute timeout).

### Deploy (Vultr Compute)

```bash
git clone <this-repo> && cd FoodScraps
# copy .env onto the server
docker compose -f infra/docker-compose.yml up -d --build
curl http://YOUR_IP/health
```

## Contributors

- **Hugo**
- **Leo**
- **Pashyanthi**

Built for UC San Diego students who shouldn’t have to miss a free meal.
