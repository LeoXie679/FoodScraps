# What YOU do (Hugo) vs what the code already does

The scraper + API + Docker setup are in this repo. Your job is only accounts, keys, and clicking Deploy in Vultr.

---

## 1. Bright Data API token (5 minutes)

1. Open [https://brightdata.com](https://brightdata.com) and log in.
2. Go to **Settings → API** (or **Account → API key**).
3. Copy the **API token** (long string).
4. Keep it in Notes for now.

---

## 2. Create a free Postgres database with Neon (fastest — do this instead of waiting on Vultr DB)

1. Go to [https://neon.tech](https://neon.tech) → sign up with GitHub.
2. Create a project named `food-radar`.
3. Copy the connection string that looks like:
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
4. Save it as `DATABASE_URL`.

(You can move to Vultr Managed Postgres later if you want; the code does not care.)

---

## 3. Vultr Object Storage bucket `radar-raw` (10 minutes)

1. Vultr dashboard → left **rocket Deploy** → **Object Storage**.
2. Deploy Object Storage in any US region.
3. Create a **bucket** named exactly: `radar-raw`
4. Copy:
   - Hostname / endpoint (e.g. `ewr1.vultrobjects.com`) → use as `https://ewr1.vultrobjects.com`
   - Access Key
   - Secret Key

---

## 4. Vultr Compute server (15 minutes)

1. Vultr → blue **rocket** → **Cloud Compute** (NOT Cloud GPU).
2. Ubuntu 24.04, ~2 vCPU / 4 GB, set a root password, label `food-radar`.
3. Deploy → wait until **Running** → copy the **IP address**.

Then on your Mac Terminal:

```bash
ssh root@PASTE_YOUR_IP_HERE
```

Once logged in, paste:

```bash
apt update && apt install -y docker.io docker-compose-v2 git curl
systemctl enable --now docker
```

---

## 5. Put secrets in `.env` on your Mac

In the project folder:

```bash
cd /Users/hugo/Projects/FoodScraps
cp .env.example .env
```

Open `.env` in Cursor and fill:

```env
BRIGHTDATA_API_TOKEN=paste_here
DATABASE_URL=paste_neon_url_here
S3_ENDPOINT=https://YOUR_REGION.vultrobjects.com
S3_ACCESS_KEY=paste_here
S3_SECRET_KEY=paste_here
S3_BUCKET=radar-raw
ADMIN_TOKEN=pick-any-secret-for-demo
```

**Never commit `.env`.** It is already in `.gitignore`.

---

## 6. Tell the AI agent (or run yourself) these local commands

Install scraper deps and dry-run Bright Data (no cloud writes):

```bash
cd /Users/hugo/Projects/FoodScraps/scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run_scrape.py --limit 1 --dry-run
```

Apply DB tables (needs `psql` or we can run via Docker later):

```bash
# Mac: brew install libpq && brew link --force libpq
cd /Users/hugo/Projects/FoodScraps
bash infra/run_schema.sh
```

Real scrape (writes images + DB rows):

```bash
cd /Users/hugo/Projects/FoodScraps/scraper
source .venv/bin/activate
python run_scrape.py --limit 5
```

---

## Paste back here when ready

Reply with these **three** things (secrets OK to paste in chat for the hackathon, or say “filled in .env”):

1. Bright Data token — **done / not yet**
2. Neon `DATABASE_URL` — **done / not yet**
3. Object Storage endpoint + keys — **done / not yet**
4. Compute IP — **done / not yet**

Then we deploy with Docker and hit `/health`.
