# OptionPulse Architecture & Design Specification

OptionPulse is designed with high modularity, deterministic computation, and loose coupling across all subsystems.

```mermaid
graph TD
    subgraph Data Layer
        MDP[MarketDataProvider Abstract Base Class]
        NSE[NseIndiaProvider - Live Scraper]
        YF[YahooFinanceProvider - Candles & Quotes]
        MOCK[MockMarketDataProvider - Synthetic Replay]
        CMP[CompositeMarketDataProvider - Resilient Fallback]
        MDP --> CMP
        CMP --> NSE
        CMP --> YF
        CMP --> MOCK
    end

    subgraph Quantitative Engine
        TI[Technical Indicators Engine - EMA, RSI, MACD, Supertrend, ATR, VWAP]
        BS[Black-Scholes Options Engine - Delta, Gamma, Theta, Vega, IV]
        OI[OI & Buildup Engine - PCR, Max Pain, Walls, Long/Short Buildup]
        SR[Support & Resistance Engine - Floor Pivots + OI Confluence]
        SE[100-Point Deterministic Scoring Engine]
        TS[Trade Structuring Engine - Entry Zone, SL, Targets, Dynamic Exit]
        AI[AI Narrative Explanation Layer - Post-Calculation]
        
        TI --> SE
        BS --> SE
        OI --> SE
        SR --> SE
        SE --> TS
        TS --> AI
    end

    subgraph Service & Storage Layer
        FASTAPI[FastAPI REST & WebSocket Server]
        DB[(PostgreSQL / SQLite via Async SQLAlchemy)]
        PT[Paper Trading Engine]
        BT[Backtesting Engine]
    end

    subgraph Frontend Interface
        NEXT[Next.js 16 + React 19 + TypeScript + Tailwind CSS]
        TERM[Institutional Financial Trading Terminal]
    end

    Data Layer --> Quantitative Engine
    Quantitative Engine --> FASTAPI
    Service & Storage Layer <--> FASTAPI
    FASTAPI <--> NEXT
```

---

## 1. Modular Data Provider Layer

The data provider architecture is governed by the `MarketDataProvider` abstract class:

- **Decoupling Guarantee**: Neither the quantitative engine nor the frontend directly connects to any specific data source.
- **Provider Implementations**:
  1. `NseIndiaProvider`: Direct connection to `www.nseindia.com` option chain endpoints with session cookies, header emulation, and Black-Scholes Greeks synthesis.
  2. `YahooFinanceProvider`: Fetches underlying indices and historical candlestick arrays.
  3. `MockMarketDataProvider`: High-fidelity synthetic Indian market replay with true strike intervals (50 for NIFTY, 100 for BANKNIFTY) and analytical Black-Scholes Greeks.
  4. `CompositeMarketDataProvider`: Auto-fallback orchestration that monitors provider health and flags data staleness (`⚠️ DATA DELAYED` or `MOCK_REPLAY`).

---

## 2. Quantitative Scoring Model (100 Points)

The quantitative scoring engine computes 8 distinct component scores:

| Component | Max Points | Metrics Evaluated |
|---|:---:|---|
| **Trend** | 20 | Price vs EMA 9/20/50/200, Supertrend direction |
| **Momentum** | 15 | RSI (14) sweet-spot, MACD line, histogram expansion |
| **VWAP** | 10 | Underlying position vs institutional intraday VWAP |
| **Price Action** | 15 | Swing highs/lows, breakout/breakdown, pivot clearance |
| **Volume** | 10 | Volume participation and relative volume (RVOL) |
| **Option Chain & OI** | 20 | PCR bias, dominant option buildup, Call/Put OI walls |
| **Volatility** | 5 | ATR and IV percentile stability |
| **Risk / Reward** | 5 | Structural clearance for >= 1:1.5 or 1:2 R:R |
| **TOTAL** | **100** | **Sum of all 8 components** |

### Classification Tiers:
- `0 - 39`: **NO TRADE**
- `40 - 54`: **WEAK**
- `55 - 69`: **MODERATE**
- `70 - 84`: **STRONG**
- `85 - 100`: **VERY STRONG**

---

## 3. Black-Scholes Greeks Formulation

Closed-form analytical equations implemented in `backend/analysis_engine/greeks.py`:

- **Delta ($\Delta$)**:
  - $\Delta_{CE} = N(d_1)$
  - $\Delta_{PE} = N(d_1) - 1$
- **Gamma ($\Gamma$)**:
  - $\Gamma = \frac{N'(d_1)}{S \cdot \sigma \cdot \sqrt{T}}$
- **Vega ($\nu$)**:
  - $\nu = \frac{S \cdot \sqrt{T} \cdot N'(d_1)}{100}$ (per 1% change in IV)
- **Theta ($\Theta$)**:
  - $\Theta_{CE} = -\frac{S \cdot N'(d_1) \cdot \sigma}{2 \sqrt{T}} - r \cdot K \cdot e^{-rT} N(d_2)$ (per calendar day)
  - $\Theta_{PE} = -\frac{S \cdot N'(d_1) \cdot \sigma}{2 \sqrt{T}} + r \cdot K \cdot e^{-rT} N(-d_2)$ (per calendar day)
- **Implied Volatility (IV)**:
  - Computed via numerical bisection search matching theoretical price to market quote.

---

## 4. Database Schema Structure (16 Tables)

1. `users`: User preferences, capital, and risk limits.
2. `market_instruments`: NIFTY, BANKNIFTY, FINNIFTY definitions and lot sizes.
3. `expiries`: Active and upcoming contract dates.
4. `market_quotes`: Real-time underlying quotes and historical snapshots.
5. `option_chain_snapshots`: Chain-level metadata (PCR, Max Pain, total OI).
6. `option_chain_rows`: Detailed per-strike data (LTP, OI, IV, Greeks).
7. `technical_indicators`: Computed EMAs, RSI, MACD, Supertrend, ATR, VWAP.
8. `signals`: Deterministic signal records and trade setups.
9. `signal_components`: Component score breakdown for complete transparency.
10. `support_resistance`: Dynamic major and minor support/resistance levels.
11. `paper_trades`: Virtual trading positions and P&L logs.
12. `backtest_runs`: Strategy backtest configurations and aggregate metrics.
13. `backtest_trades`: Individual simulated backtest trades.
14. `system_logs`: System and audit events.
15. `provider_health`: Latency, request counts, and error tracking per data provider.
16. `settings`: Configurable scoring weights and application settings.
