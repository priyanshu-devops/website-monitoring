# 🌐 Domain Monitor

> **Enterprise-grade domain monitoring for 350+ domains — 100% free, no database, no server.**
>
> Google Sheets is your only interface. GitHub Actions runs everything.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Features](#features)
3. [Google Sheets Column Map](#google-sheets-column-map)
4. [Prerequisites](#prerequisites)
5. [Step 1 — Create a Google Cloud Project](#step-1--create-a-google-cloud-project)
6. [Step 2 — Create a Service Account](#step-2--create-a-service-account)
7. [Step 3 — Set Up the Google Sheet](#step-3--set-up-the-google-sheet)
8. [Step 4 — Fork & Configure the Repo](#step-4--fork--configure-the-repo)
9. [Step 5 — Configure GitHub Secrets](#step-5--configure-github-secrets)
10. [Step 6 — First Manual Run](#step-6--first-manual-run)
11. [Local Development](#local-development)
12. [Configuration Reference](#configuration-reference)
13. [Project Structure](#project-structure)
14. [Performance Notes](#performance-notes)
15. [Troubleshooting](#troubleshooting)
16. [FAQ](#faq)

---

## Architecture

```
GitHub Actions (cron: 03:30 UTC + 15:30 UTC)
       │
       ▼
  src/index.ts
  ├── SheetsService.readDomains()      ← Column A + B
       │
       ▼  promisePool(limit=10)
  MonitorEngine.monitorDomain()
  ├── DNSChecker      → IP + Nameservers
  ├── HTTPChecker     → Status, Headers, Body, Redirects
  ├── SSLChecker      → Certificate Expiry, Issuer, Grade
  ├── WHOISChecker    → Domain Expiry Date
  ├── TechDetector    → WordPress, Cloudflare, CDN, Server
  └── ScreenshotService → Playwright → Sharp thumbnail
       │
       ▼
  SheetsService.batchUpdate()          ← Columns C–AF
       │
       ▼
  git commit screenshots/ logs/        ← Committed to repo
       │
       ▼
  Google Sheets =IMAGE() formula renders thumbnails
```

**Cost:** $0.00 — Uses only free-tier services:
- GitHub Actions (2,000 free minutes/month on free plan)
- Google Sheets API (free up to 300 req/min)
- GitHub repository storage (free)

---

## Features

| Category | What's Checked |
|----------|---------------|
| **DNS** | A/AAAA resolution, NS record lookup |
| **HTTP** | Status code, response time, redirect chain, final URL |
| **HTTPS** | HTTPS enabled detection, TLS/SSL fallback |
| **SSL** | Expiry date, days remaining, issuer, TLS version, grade (A+/A/B/C/F) |
| **WHOIS** | Domain expiry date |
| **Content** | Page title, og:title, meta description, page size |
| **Technology** | Server (Nginx/Apache/LiteSpeed/IIS), CMS (WordPress/Drupal/Shopify), CDN |
| **Security** | Cloudflare detection, WAF hints |
| **Hosting** | Provider via reverse-DNS (AWS/GCP/Azure/DigitalOcean/etc.) |
| **Screenshot** | 1366×768 Playwright capture + 400×300 thumbnail |
| **Errors** | All failures logged separately, run continues |

---

## Google Sheets Column Map

| Column | Data |
|--------|------|
| **A** | *(You fill)* Company Name |
| **B** | *(You fill)* Domain Name |
| **C** | Website Status (Online / Offline / Redirect / Error N) |
| **D** | HTTP Status Code |
| **E** | Response Time (ms) |
| **F** | SSL Expiry Date |
| **G** | SSL Days Remaining |
| **H** | Domain Expiry Date (WHOIS) |
| **I** | Website Title |
| **J** | Server IP |
| **K** | Hosting Provider |
| **L** | DNS Status (OK / Failed) |
| **M** | Nameservers |
| **N** | HTTPS Enabled (Yes / No) |
| **O** | Redirect URL |
| **P** | Last Checked Date |
| **Q** | Last Checked Time (IST) |
| **R** | Screenshot URL |
| **S** | Screenshot Thumbnail URL |
| **T** | Website Screenshot `=IMAGE(...)` formula |
| **U** | Error Message |
| **V** | Page Size |
| **W** | WordPress Detection |
| **X** | Cloudflare Detection |
| **Y** | CDN Detection |
| **Z** | Technology Stack |
| **AA** | Meta Title (og:title) |
| **AB** | Meta Description |
| **AC** | SSL Issuer |
| **AD** | SSL Version |
| **AE** | SSL Grade |
| **AF** | Monitoring Result (PASS / FAIL) |

---

## Prerequisites

- A **Google Account** (for Google Sheets + Google Cloud)
- A **GitHub Account** (free)
- Node.js ≥ 20 (for local development only)

---

## Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **"New Project"** → name it `domain-monitor` → **Create**
3. In the search bar, search for **"Google Sheets API"** → **Enable**

> You do NOT need to enable billing. The Sheets API free quota is generous enough for 350 domains twice a day.

---

## Step 2 — Create a Service Account

1. In Google Cloud Console → **IAM & Admin → Service Accounts**
2. Click **"Create Service Account"**
   - Name: `domain-monitor-bot`
   - Click **Continue** (skip optional role assignment)
   - Click **Done**
3. Click the service account you just created
4. Go to **Keys** tab → **Add Key → Create new key → JSON** → **Create**
5. A `.json` file downloads — **keep this safe**

### Convert credentials to base64 (recommended for GitHub Secrets)

**Linux/Mac:**
```bash
base64 -w 0 your-service-account-key.json
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-service-account-key.json"))
```

Copy the output — you'll paste it as `GOOGLE_CREDENTIALS` in Step 5.

---

## Step 3 — Set Up the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a new sheet
2. Note the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```
3. In your sheet, fill in:
   - **Column A** → Company names
   - **Column B** → Domain names (e.g. `example.com`, no `https://`)
4. **Share the sheet** with your service account email:
   - Click **Share** button (top right)
   - Paste the service account email: `domain-monitor-bot@your-project.iam.gserviceaccount.com`
   - Set role to **Editor**
   - Click **Send** / **Share**

> **Important:** The first run will automatically write headers to row 1 (A1:AF1). Do not put data in row 1.

---

## Step 4 — Fork & Configure the Repo

1. **Fork** this repository to your GitHub account (or push to a new repo)
2. Make sure the `main` branch exists (it does by default)

---

## Step 5 — Configure GitHub Secrets

Go to your repository → **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Value |
|-------------|-------|
| `SPREADSHEET_ID` | Your Google Sheet ID (from Step 3) |
| `GOOGLE_CREDENTIALS` | Base64-encoded service account JSON (from Step 2) |

> **Note:** `GITHUB_TOKEN` is provided automatically by GitHub Actions — you do NOT need to create it.

---

## Step 6 — First Manual Run

1. Go to your repo → **Actions** tab
2. Click **"Domain Monitor"** in the left sidebar
3. Click **"Run workflow"** → choose options → click green **"Run workflow"** button
4. Watch the logs in real time
5. Check your Google Sheet — it should be fully populated within 15–25 minutes

---

## Local Development

### Setup

```bash
# 1. Clone your fork
git clone https://github.com/YOUR_USERNAME/domain-monitor.git
cd domain-monitor

# 2. Install dependencies
npm install

# 3. Install Playwright browser
npx playwright install chromium

# 4. Configure environment
cp .env.example .env
# Edit .env with your values
```

### Run

```bash
# Run the monitor once
npm run monitor

# Type-check without running
npm run typecheck

# Build to JavaScript (optional)
npm run build
```

### Environment Variables for Local Development

Edit `.env`:

```env
SPREADSHEET_ID=your_sheet_id
GOOGLE_CREDENTIALS={"type":"service_account",...}   # raw JSON or base64
GITHUB_OWNER=your_github_username
GITHUB_REPO=domain-monitor
GITHUB_BRANCH=main
ENABLE_SCREENSHOTS=true
CONCURRENCY_LIMIT=5    # lower for local machine
```

> **Tip:** Set `ENABLE_SCREENSHOTS=false` locally for much faster test runs.

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SPREADSHEET_ID` | *(required)* | Google Sheet ID |
| `GOOGLE_CREDENTIALS` | *(required)* | Service account JSON (raw or base64) |
| `SHEET_NAME` | `Sheet1` | Tab name in your spreadsheet |
| `GITHUB_OWNER` | auto-detected | GitHub username/org |
| `GITHUB_REPO` | auto-detected | Repo name |
| `GITHUB_BRANCH` | `main` | Branch for screenshot commits |
| `CONCURRENCY_LIMIT` | `10` | Max parallel domain checks |
| `REQUEST_TIMEOUT` | `10000` | Per-request timeout (ms) |
| `RETRY_ATTEMPTS` | `2` | Retries per failed request |
| `ENABLE_SCREENSHOTS` | `true` | Set `false` to skip screenshots |

---

## Project Structure

```
.
├── .github/workflows/monitor.yml   # Cron schedule + run steps
├── config/
│   ├── index.ts                    # Config loader (validates env vars)
│   └── types.ts                    # All TypeScript interfaces
├── services/
│   ├── google/
│   │   ├── auth.ts                 # Service account authentication
│   │   └── sheets.ts               # Read domains + batchUpdate results
│   ├── dns/checker.ts              # DNS A/NS record lookup
│   ├── ssl/checker.ts              # TLS certificate inspection
│   ├── http/checker.ts             # Axios HTTP/HTTPS checks
│   ├── playwright/screenshot.ts    # Browser screenshot + thumbnail
│   └── monitor/engine.ts           # Orchestrates all per-domain checks
├── utils/
│   ├── concurrency.ts              # promisePool, withRetry, withTimeout
│   ├── helpers.ts                  # Parsers, detectors, formatters
│   └── logger.ts                   # Console + file logger
├── typings/whoiser.d.ts            # Type declarations for whoiser
├── src/index.ts                    # Main entry point
├── logs/                           # Daily log files
├── screenshots/                    # Captured screenshots + thumbnails
├── .env.example                    # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Performance Notes

| Domains | Concurrency | Est. Time (no screenshots) | Est. Time (with screenshots) |
|---------|-------------|---------------------------|------------------------------|
| 50 | 10 | ~2 min | ~5 min |
| 100 | 10 | ~4 min | ~10 min |
| 350 | 10 | ~8 min | ~20 min |

**GitHub Actions free tier:** 2,000 minutes/month = ~62 runs (350 domains, 10 concurrency, with screenshots). Since you run twice a day = ~60 runs/month — fits perfectly within free tier.

### Tuning tips

- Increase `CONCURRENCY_LIMIT` to `15` if most domains are fast.
- Set `ENABLE_SCREENSHOTS=false` to halve run time (screenshots are the bottleneck).
- Playwright screenshots run with concurrency limited by the promise pool — no separate config needed.

---

## Troubleshooting

### "Missing required environment variables"
→ Ensure `SPREADSHEET_ID` and `GOOGLE_CREDENTIALS` secrets are set in GitHub → Settings → Secrets → Actions.

### "The caller does not have permission"
→ The service account email was not added as an Editor to the Google Sheet. See Step 3.

### Screenshots not appearing in Sheets
→ The `=IMAGE(...)` formula in column T renders the thumbnail URL from column S. After the first run, GitHub must commit the screenshots. Wait for the "Commit screenshots and logs" step to complete, then refresh the sheet.

### WHOIS returns "N/A"
→ Some TLDs block WHOIS queries. This is normal — the system falls back gracefully and all other checks still run.

### Actions workflow not triggering on schedule
→ GitHub requires at least one successful manual run before scheduled workflows activate. Trigger it manually once via **Actions → Run workflow**.

### SSL grade shows "F" but site loads fine
→ The site may use an older TLS version or have an untrusted certificate chain. This is informational — the HTTP check determines if the site is actually reachable.

---

## FAQ

**Q: Can I monitor subdomains?**
A: Yes. Enter `blog.example.com` or `app.example.com` in Column B — it works exactly the same.

**Q: What happens if a domain check fails?**
A: The failure is logged to `logs/failed-domains-YYYY-MM-DD.log`, the row is updated with `FAIL` and the error message, and the loop continues to the next domain.

**Q: Can I add more domains while a run is in progress?**
A: Yes — new rows are picked up on the next run. The current run only processes rows that existed when it started.

**Q: Will the system overwrite my notes in Column A?**
A: No. The system only reads columns A and B and writes to columns C–AF.

**Q: How are screenshots stored?**
A: Screenshots are committed to the `screenshots/` directory of this repository. The raw GitHub URL is placed in column R/S. Column T contains a `=IMAGE(...)` formula that renders the thumbnail directly inside the sheet cell.

**Q: Is there a rate limit on the Google Sheets API?**
A: The free quota is 300 read/write requests per minute. The system batches updates in chunks of 100 rows with a 600ms delay between chunks to stay well within limits.

---

## License

MIT — use freely for personal, commercial, or internal tooling.
