# OptionPulse Deployment & Production Architecture Guide

This guide details the complete production deployment setup for **OptionPulse** (NIFTY 50 Options Live Analysis & Signal Platform) using **Vercel Hobby**, **Supabase PostgreSQL**, and an **External Persistent Monitoring Daemon**.

---

## 🏛️ System Architecture Overview

```
                          ┌────────────────────────┐
                          │   Live Market Data     │
                          │ (NSE India / Realtime) │
                          └───────────┬────────────┘
                                      │
            ┌─────────────────────────┴────────────────────────┐
            ▼                                                  ▼
┌───────────────────────────────┐              ┌───────────────────────────────┐
│ Persistent Monitoring Daemon  │              │  Next.js PWA (Vercel Hobby)   │
│     (Python / FastAPI)        │              │  • Mobile-First Dashboard     │
│ • Continuous WebSocket / Loop │              │  • User Read APIs             │
│ • State Machine Enforcement   │              │  • Web Push Dispatcher        │
│ • Idempotent Signal Engine    │              │  • Watchdog Recovery Endpoint │
└───────────────┬───────────────┘              └───────────────┬───────────────┘
                │                                              │
                │        ┌─────────────────────────────┐       │
                └───────►│    Supabase PostgreSQL      │◄──────┘
                         │ • signals, signal_events    │
                         │ • monitor_executions        │
                         │ • notification_deliveries   │
                         │ • push_subscriptions        │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   Web Push Notification     │
                         │   (Direct to User Phone)    │
                         └─────────────────────────────┘
```

OptionPulse operates on a **dual-tier decoupled architecture**:
1. **Frontend & Read APIs**: Hosted on **Vercel Hobby Plan**. Highly optimized, serverless, mobile-first PWA.
2. **Persistent Monitoring Daemon (`/monitoring`)**: Hosted on Railway / Render / VPS / Fly.io / Docker. Continuously monitors NIFTY 50 ticks during Indian market hours (09:15–15:30 IST).
3. **Watchdog Backup Scheduler**: A GitHub Actions workflow runs every 10 minutes during market hours to call `POST /api/monitor/nifty` as a safety watchdog and failover mechanism.

---

## 1. Supabase Database Setup

OptionPulse uses Supabase as its primary database and persistence layer.

### Step 1.1: Run Database Migrations
In your Supabase project dashboard, navigate to **SQL Editor** and run the following two migration scripts in order:

1. **`supabase/migrations/001_initial_schema.sql`**
   - Creates `market_quotes`, `option_chains`, `signals`, `signal_events`, `paper_trades`, `system_logs`.
   - Sets up automatic timestamps, indexes, and Row Level Security (RLS).
2. **`supabase/migrations/002_monitor_and_notifications.sql`**
   - Creates `monitor_executions` for execution telemetry.
   - Creates `notification_deliveries` with unique `delivery_key` (`signal_id + '_' + event_type`) for guaranteed deduplication.
   - Adds unique constraint on `signal_events(idempotency_key)`.
   - Adds `push_subscriptions` table for mobile PWA notifications.

### Step 1.2: Retrieve Supabase API Keys
From **Project Settings -> API**, copy:
- **Project URL** (e.g. `https://ctndvgfuneosowsrwuro.supabase.co`)
- **Anon Key** (public client key)
- **Service Role Key** (secret admin key for backend & serverless routes)

---

## 2. Vercel Deployment (Frontend & Serverless APIs)

The Next.js application is configured to deploy effortlessly to the **Vercel Hobby** plan.

### Step 2.1: Import Project into Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repository (`GK_Trade`).
2. In the **Project Settings**:
   - **Framework Preset**: Next.js
   - **Root Directory**: Click `Edit` and select **`frontend`** *(CRITICAL: do not deploy from workspace root)*.

### Step 2.2: Configure Environment Variables in Vercel
Add the following environment variables in **Vercel -> Project Settings -> Environment Variables**:

| Variable Name | Environment | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Dev | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Dev | Your Supabase Public Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Dev | Your Supabase Secret Service Role Key |
| `CRON_SECRET` | Production, Preview, Dev | Strong random secret string (e.g. `openssl rand -hex 32`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production, Preview, Dev | Web Push VAPID Public Key |
| `VAPID_PRIVATE_KEY` | Production, Preview, Dev | Web Push VAPID Private Key |
| `VAPID_SUBJECT` | Production, Preview, Dev | `mailto:your-email@example.com` |
| `NEXT_PUBLIC_MONITOR_SERVICE_URL`| Production, Preview, Dev | *(Optional)* URL of your deployed monitoring daemon |

### Step 2.3: Vercel Cron on Hobby Plan
In `frontend/vercel.json`, only **one** daily cron is configured:
```json
{
  "crons": [
    {
      "path": "/api/summary/today",
      "schedule": "30 10 * * 1-5"
    }
  ]
}
```
> **Note**: `30 10 * * 1-5` executes at 10:30 UTC (16:00 IST) Monday to Friday to generate the End-of-Day trading performance summary. This strictly complies with Vercel Hobby's 1-cron-per-day limit.

---

## 3. Persistent Monitoring Daemon Deployment (`/monitoring`)

The Python monitoring service runs continuously during market hours without serverless timeout limitations.

### Option A: Railway / Render (Recommended 1-Click Docker)
1. In Railway or Render, create a new Web Service pointing to repository subfolder `monitoring` (or using `monitoring/Dockerfile`).
2. Build Command: `docker build -t optionpulse-monitor -f monitoring/Dockerfile .`
3. Set Environment Variables:
   ```env
   PORT=8080
   SUPABASE_URL=https://ctndvgfuneosowsrwuro.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   CRON_SECRET=your-shared-cron-secret
   PUSH_NOTIFICATION_PUBLIC_KEY=your-vapid-public-key
   PUSH_NOTIFICATION_PRIVATE_KEY=your-vapid-private-key
   PUSH_NOTIFICATION_SUBJECT=mailto:admin@optionpulse.in
   MARKET_DATA_PROVIDER=NSE-Composite
   ```
4. Health check endpoint: `GET /health` or `GET /api/monitor/status`.

### Option B: Linux VPS (Systemd Service)
Create a systemd unit file `/etc/systemd/system/optionpulse-monitor.service`:
```ini
[Unit]
Description=OptionPulse Persistent Market Monitoring Daemon
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/GK_Trade
EnvironmentFile=/home/ubuntu/GK_Trade/.env
ExecStart=/home/ubuntu/GK_Trade/.venv/bin/uvicorn monitoring.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable optionpulse-monitor
sudo systemctl start optionpulse-monitor
```

---

## 4. GitHub Actions Watchdog (Free Schedule)

To ensure market analysis continues even if the monitoring daemon temporarily restarts, the included GitHub Actions workflow acts as a scheduled watchdog.

### Step 4.1: Configure GitHub Repository Secrets
Go to **GitHub -> Repository Settings -> Secrets and variables -> Actions** and add:
- `VERCEL_APP_URL`: Your Vercel production URL (e.g. `https://gk-trade.vercel.app`)
- `CRON_SECRET`: The identical `CRON_SECRET` string configured in Vercel.

### Step 4.2: Verify Workflow File
The workflow is located at `.github/workflows/nifty-monitor.yml`.
It automatically runs every 10 minutes between **03:45 UTC and 10:00 UTC (09:15 to 15:30 IST) Monday to Friday** and pings `POST /api/monitor/nifty`.

---

## 5. Local Testing & Verification

### Test Watchdog & Monitor API Locally
Use the provided cross-platform test script:

**Using Node.js:**
```bash
# Test during normal session (respects market hours & holidays)
node scripts/test-monitor.mjs

# Force execution pipeline test (even on weekends/holidays)
node scripts/test-monitor.mjs --force

# Test deployed Vercel instance
node scripts/test-monitor.mjs --url https://your-project.vercel.app --secret your_cron_secret --force
```

**Using PowerShell:**
```powershell
.\scripts\test-monitor.ps1 -Force
```

### Run Backend Unit & Integration Tests
```bash
.\.venv\Scripts\pytest.exe -v
```
All 15 tests covering state machine transitions, NSE holiday detection, push notification deduplication, provider health, and REST endpoints will execute.

### Validate Frontend Build
```bash
npm run build --prefix frontend
```
Ensures 0 TypeScript and 0 Next.js bundling errors.

---

## 6. Production Health & Troubleshooting Checklist

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| `DATA_STALE` returned | Market is closed or feed age > 180s | Normal behavior on weekends/after-hours. No fake data is produced. |
| `CLOSED_WEEKEND` / `CLOSED_HOLIDAY` | Request received outside NSE trading days | Expected. Service skips calculation to save compute. |
| `401 Unauthorized` on `/api/monitor/nifty` | Missing or mismatched `CRON_SECRET` | Ensure `Authorization: Bearer <CRON_SECRET>` is passed in headers. |
| Web Push Not Delivered | Browser denied permission or missing keys | Ensure VAPID keys are configured in both Vercel and monitoring service. |
| Duplicate Alerts | Network retry on push notification | The `notification_deliveries(delivery_key)` table guarantees idempotency. |
