# OptionPulse 🚀
### Indian Stock-Options Market Analysis & Manual Decision-Support Platform

OptionPulse is an institutional-grade, full-stack market-analysis and decision-support web application tailored for Indian derivative markets (**NIFTY**, **BANKNIFTY**, **FINNIFTY**, and equity options).

> ⚠️ **IMPORTANT REGULATORY & RISK NOTICE**:
> OptionPulse is strictly an analytical decision-support and market-intelligence assistant. It does **NOT** place real orders, does **NOT** automate trading, does **NOT** connect to broker execution endpoints, and does **NOT** claim guaranteed returns or accuracy. Users manually execute trades in their own broker terminals based on their personal risk parameters.

---

## 🌟 Core Features

- **Institutional Market Overview**: Live tracking of NIFTY, BANKNIFTY, and FINNIFTY with day ranges, VWAP, and trend badges.
- **Hero AI Market Signal Card**:
  - Clear **CALL BUY** / **PUT BUY** / **NO TRADE** bias.
  - Recommended liquid instrument (e.g., `NIFTY 25400 CE`).
  - **Entry Zone** (e.g., ₹185 – ₹190) with tactical confirmation triggers.
  - Structure-based **Stop Loss** (e.g., ₹145) with explicit invalidation level.
  - Multi-tier targets: **Target 1** (1:1.2), **Target 2** (1:2.1), and optional **Target 3**.
  - Dynamic Exit Condition: `HOLD`, `TRAIL SL`, or `EXIT NOW`.
  - Calculated **Risk / Reward** ratio.
- **Transparent 100-Point Quantitative Scoring Engine**:
  - Trend: 0–20 pts (EMA 9/20/50/200, Supertrend)
  - Momentum: 0–15 pts (RSI 14, MACD, Hist)
  - VWAP: 0–10 pts (Institutional VWAP rejection / breakout)
  - Price Action: 0–15 pts (Structure & Pivots)
  - Volume: 0–10 pts (Volume trends & participation)
  - Option Chain & OI: 0–20 pts (PCR, Buildups, Walls)
  - Volatility: 0–5 pts (ATR & IV)
  - Risk/Reward: 0–5 pts
  - Total: 100 pts (Configurable weights in Settings)
- **Institutional Option Chain Matrix**:
  - Complete Call & Put sides: OI, Change in OI, Volume, IV, LTP, Bid/Ask.
  - Black-Scholes Greeks: **Delta (Δ)**, **Gamma (Γ)**, **Theta (Θ)**, and **Vega (ν)**.
  - Highlighted **ATM Strike**, **ITM / OTM** shading, **Highest Call OI (Resistance Wall)**, and **Highest Put OI (Support Wall)**.
  - Expiry selector & Strike range filter (±10, ±15, ±25, ±40 strikes).
- **Open Interest & Buildup Analytics**:
  - Live Put-Call Ratio (PCR) meter with bias classification.
  - Max Pain calculation.
  - Automatic detection of **Long Buildup**, **Short Buildup**, **Short Covering**, and **Long Unwinding**.
- **Interactive Technical Charts**:
  - Powered by TradingView Lightweight Charts.
  - Multi-timeframe support: `1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `1D`.
  - Toggleable indicators: EMA 9/20/50, VWAP, Supertrend, Volume, RSI, MACD.
- **Paper Trading Simulator**:
  - Virtual capital (₹100,000 starting).
  - 1-Click execution simulation directly from AI Market Signal cards.
  - Real-time P&L tracking, trailing SL, and position management without financial risk.
- **Quantitative Strategy Backtesting**:
  - Simulates confluence strategies over historical candle series.
  - Key metrics: Win Rate %, Profit Factor, Max Drawdown %, Consecutive Wins/Losses, and Equity Curve.
- **Risk Management Calculator (Section 29)**:
  - Capital sizing based on maximum 1% risk per trade.
  - Respects real Indian index lot sizes (25 for NIFTY, 15 for BANKNIFTY).
- **AI Narrative Explanation Layer**:
  - Deterministic synthesis generated *strictly after* quantitative calculation.
  - Explains market bias, support, resistance, and explicit trade invalidation criteria.

---

## 🏗️ Architecture & Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, TradingView Lightweight Charts.
- **Backend**: Python 3.12, FastAPI, Uvicorn, WebSockets.
- **Analysis Engine**: Pandas, NumPy, SciPy (Black-Scholes analytical Greeks & normal distributions).
- **Data Provider Layer**: Resilient modular abstraction (`MarketDataProvider` interface):
  - `NseIndiaProvider`: Direct live NSE option chain and index scraping with session cookies.
  - `YahooFinanceProvider`: Underlying quotes and intraday historical candlestick series.
  - `MockMarketDataProvider`: High-fidelity synthetic Indian replay for off-market hours and automated testing.
  - `CompositeMarketDataProvider`: Auto-fallback orchestration with latency and error tracking.
- **Database**: PostgreSQL (production DDL schema) + SQLite (zero-config local development fallback) via async SQLAlchemy.

---

## 🚀 Quick Start Guide

### 1. Launch Backend (FastAPI on port 8000)
```bash
.\.venv\Scripts\uvicorn.exe backend.main:app --reload --port 8000
```

### 2. Launch Frontend (Next.js on port 3000)
```bash
npm run dev --prefix frontend
# or from root:
npm run dev
```

### 3. Or Launch Both Together with One Command
```bash
.\run.bat
```
Open **http://localhost:3000** in your browser.

---

## 🧪 Running Automated Tests
```bash
.\.venv\Scripts\pytest.exe tests/ -v
```
All tests validate data parsing, Black-Scholes Greeks, technical indicators, quantitative scoring, trade structuring, paper trading, and REST API endpoints.
