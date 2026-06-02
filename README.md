# PM Job Search Pipeline

Automated daily job search for **Product Manager** roles in **Bengaluru** or **remote**, with Apify scraping, Claude scoring, and Notion tracking.

## Stack

- **Next.js** dashboard (`Run Now`, today's matches, run logs)
- **Apify** — LinkedIn + Naukri actors
- **Claude** (`claude-haiku-4-5-20251001`) — 0–100 score on 4 × 25 criteria
- **Notion** — shortlisted jobs database
- **cron** — daily 8:00 AM IST

## Setup

### 1. Environment

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Description |
|----------|-------------|
| `APIFY_API_KEY` | Apify API token |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `NOTION_API_KEY` | Notion integration secret |
| `NOTION_DATABASE_ID` | Target database ID |

### 2. Notion database

Create a database with these **exact** property names:

| Property | Type |
|----------|------|
| Role Title | Title |
| Company | Text |
| Score | Number |
| Match reason | Text |
| JD Link | URL |
| Date Found | Date |
| Status | Select (add option **To Apply**) |

Connect your Notion integration to the database (⋯ → Connections).

### 3. Apify actors

Defaults (configurable via env):

- **LinkedIn**: `mukeshrana90/linkedin-jobs-scraper-unlimited` — keyword, Bengaluru + remote, `past24Hours`
- **Naukri**: `automation-lab/naukri-scraper` — keyword, Bangalore + remote, sorted by date, client-side 24h filter

Subscribe to both actors on [Apify Store](https://apify.com/store) before running.

### 4. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Run Now**.

Or run the pipeline from the CLI (used by cron):

```bash
npm run pipeline
```

## Daily schedule (8:00 AM IST)

```bash
chmod +x scripts/install-cron.sh
./scripts/install-cron.sh
```

This adds: `30 2 * * *` UTC = **8:00 AM IST**.

Logs: `data/cron.log`

**Note:** Cron runs `npm run pipeline` directly (no server required). Keep the machine awake or use a hosted cron that calls `POST /api/pipeline/run` with `CRON_SECRET` if the app is deployed.

## Pipeline flow

1. Scrape LinkedIn (Bengaluru + remote, last 24h) and Naukri (Bangalore + remote, last 24h)
2. Deduplicate by job URL
3. **Hard filters** (auto-reject JD containing): `quota`, `pipeline`, `sales target`, `unpaid`, `intern`, `night shift`, `rotational shift`, or Associate PM + 5+ years
4. **Claude score** (0–100, threshold **60**)
5. Push passing jobs to Notion (skip duplicates by JD Link)

## Deployed cron (optional)

If the app runs on a server:

```bash
curl -X POST https://your-app.com/api/pipeline/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Project layout

```
src/lib/
  apify.ts      # LinkedIn + Naukri scrapers
  filters.ts    # Hard filters
  scorer.ts     # Claude scoring
  notion.ts     # Notion sync
  pipeline.ts   # Orchestration
data/
  pipeline-state.json   # Run history (gitignored)
```
