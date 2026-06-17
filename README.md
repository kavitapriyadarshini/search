# PM Job Search Pipeline

Automated daily job search for **Product Manager** roles in **Bengaluru** or **remote**, with Apify scraping, Groq scoring, and Notion tracking.

## Stack

- **Next.js** dashboard (`Run Now`, today's matches, run logs)
- **Apify** — LinkedIn + Naukri actors
- **Groq** (`llama-3.1-8b-instant`) — 0–100 score on 4 × 25 criteria
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
| `GROQ_API_KEY` | Groq API key for job scoring |
| `NOTION_API_KEY` | Notion integration secret |
| `NOTION_DATABASE_ID` | 32-char database ID only (no URL, hyphens auto-stripped) |
| `CRON_SECRET` | Random secret for Vercel Cron (required in production) |

### 2. Notion database

Create a database with these **exact** property names:

| Property | Type |
|----------|------|
| Role Title | Title |
| Company | Text |
| Score | Number |
| Match Reason | Text |
| JD Link | URL |
| Apply Link | URL |
| Date Found | Date |
| Status | Status (option **To Apply**) |

Connect your Notion integration to the database (⋯ → Connections).

### 3. Apify actors

Defaults (configurable via env):

- **LinkedIn**: `curious_coder/linkedin-jobs-scraper` — pass search URLs with `f_TPR=r86400` (last 24h), Bengaluru + remote
- **Naukri**: `memo23/naukri-scraper` — keyword + location, `timeFilter: 24h`

> **Note:** `apimaestro/linkedin-jobs-scraper` and `curious_coder/naukri-scraper` do not exist on Apify (verified via API). The actors above are the working replacements.

Subscribe to both actors on [Apify Store](https://apify.com/store) before running.

### 4. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Run Now**.

**Test mode:** Check "Test mode" on the dashboard (or `npm run pipeline -- --test`) to skip Apify and run 5 mock jobs through Groq scoring and Notion sync.

Or run the pipeline from the CLI:

```bash
npm run pipeline
npm run pipeline -- --test   # mock jobs, no Apify
```

## Deploy to Vercel (daily 8:00 AM IST)

The app uses **Vercel Cron Jobs** — no laptop or local dev server required.

1. Push to GitHub and [deploy on Vercel](https://vercel.com/new)
2. Add all env vars from `.env.local` in **Project → Settings → Environment Variables**, including:
   - `CRON_SECRET` — generate with `openssl rand -base64 32`
3. Vercel reads `vercel.json` and runs `GET /api/pipeline/run` at **02:30 UTC** (= 8:00 AM IST)

Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron invocations. The GET handler rejects requests without a valid secret.

> **Hobby plan:** Cron jobs require Vercel Pro on some accounts. Check [Vercel Cron docs](https://vercel.com/docs/cron-jobs) for your plan limits.

### Local cron (optional, deprecated)

`scripts/install-cron.sh` still works if you want to run `npm run pipeline` on your machine, but **Vercel Cron is the recommended approach** for 24/7 scheduling.

## Pipeline flow

1. Scrape LinkedIn (Bengaluru + remote, last 24h) and Naukri (Bangalore + remote, last 24h)
2. Deduplicate by job URL
3. **Hard filters** (auto-reject JD containing): `quota`, `pipeline`, `sales target`, `unpaid`, `intern`, `night shift`, `rotational shift`, or Associate PM + 5+ years
4. **Groq score** (0–100, threshold **60**)
5. Push passing jobs to Notion (skip duplicates by JD Link)

## Project layout

```
src/lib/
  apify.ts      # LinkedIn + Naukri scrapers
  filters.ts    # Hard filters
  scorer.ts     # Groq scoring
  notion.ts     # Notion sync
  pipeline.ts   # Orchestration
data/
  pipeline-state.json   # Run history (gitignored)
```
