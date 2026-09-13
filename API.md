# OptionPulse REST & WebSocket API Reference

The OptionPulse backend runs on **http://localhost:8000** by default. Interactive OpenAPI / Swagger documentation is available at **http://localhost:8000/docs**.

---

## 1. Market & Quotes Endpoints

### `GET /api/market/indices`
Returns overview quotes and trend badges for core Indian indices (NIFTY, BANKNIFTY, FINNIFTY) along with overall market status.

**Response Example:**
```json
{
  "indices": [
    {
      "symbol": "NIFTY",
      "name": "NIFTY 50",
      "ltp": 25425.20,
      "change": 145.40,
      "p_change": 0.57,
      "open": 25310.00,
      "high": 25460.00,
      "low": 25280.00,
      "prev_close": 25279.80,
      "vwap": 25410.50,
      "trend": "BULLISH",
      "data_source": "COMPOSITE",
      "is_delayed": false
    }
  ],
  "market_status": {
    "status": "MARKET OPEN",
    "is_open": true,
    "ist_time": "10:15:32 IST",
    "is_delayed": false,
    "data_age_seconds": 2
  }
}
```

### `GET /api/market/quote/{symbol}`
Returns detailed quote metrics for a specific symbol.

### `GET /api/market/charts/{symbol}`
Returns historical candlestick bars and indicator overlays for interactive charting.
- Query params: `timeframe` (`1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `1D`), `limit` (default: 80).

---

## 2. Options & Analysis Endpoints

### `GET /api/options/expiries/{symbol}`
Returns the list of available contract expiry dates for the selected symbol.

### `GET /api/options/chain/{symbol}`
Returns the full option chain matrix including Black-Scholes Greeks (Delta, Gamma, Theta, Vega), IV, OI, and PCR.
- Query params:
  - `expiry` (optional): Filter for a specific expiry date.
  - `strike_range` (default: 15): Number of strikes above and below ATM to retrieve.

### `GET /api/options/analysis/{symbol}`
Returns multi-layer analytics combining technical indicators, Open Interest distributions, Support & Resistance levels, and score breakdown.

---

## 3. Signals Endpoints

### `GET /api/signals/latest`
Generates a real-time deterministic trade signal and AI explanation for a symbol.
- Query params: `symbol` (e.g., `NIFTY`).

**Response Schema:**
```json
{
  "trade": {
    "signal": "CALL BUY",
    "instrument": "NIFTY 25400 CE",
    "current_option_ltp": 187.50,
    "entry_low": 185.0,
    "entry_high": 190.0,
    "entry_trigger": "Wait for confirmation above ₹190.0 or pullback near ₹185.0",
    "stop_loss": 145.0,
    "stop_loss_reason": "Based on underlying support at 25,350 & ATR(25.4)",
    "target_1": 225.0,
    "target_2": 270.0,
    "risk_reward": 2.1,
    "signal_score": 82.0,
    "confidence": 82.0,
    "signal_strength": "STRONG",
    "market_bias": "BULLISH",
    "invalidation_level": "NIFTY breaks below 25,350",
    "exit_status": "HOLD",
    "reasons": [
      "Trend: Price structure exhibits bullish alignment across EMAs & Supertrend.",
      "VWAP: Underlying trading above institutional intraday VWAP.",
      "Option Chain: PCR at 1.25 with strong Put OI support base."
    ]
  },
  "score_breakdown": {
    "trend_score": 17.0,
    "momentum_score": 12.0,
    "vwap_score": 9.0,
    "price_action_score": 13.0,
    "volume_score": 8.0,
    "option_chain_score": 18.0,
    "volatility_score": 4.0,
    "risk_reward_score": 5.0,
    "total_score": 86.0,
    "classification": "STRONG",
    "bias": "BULLISH"
  },
  "ai_explanation": {
    "summary": "CALL BUY on NIFTY 25400 CE is supported by price sustaining above VWAP...",
    "market_bias": "BULLISH with strong conviction.",
    "important_support": "Major Support at 25,350 (OI Put wall)...",
    "important_resistance": "Major Resistance at 25,500 (OI Call wall)...",
    "invalidation_criteria": "The setup is strictly invalidated if NIFTY breaks below 25,350."
  }
}
```

### `GET /api/signals/history`
Retrieves past persisted signals with execution status and outcome metrics.

---

## 4. Paper Trading & Backtesting Endpoints

### `POST /api/paper-trade`
Places a simulated paper trade order.
```json
{
  "symbol": "NIFTY",
  "instrument": "NIFTY 25400 CE",
  "direction": "BUY",
  "entry_price": 185.0,
  "quantity": 25,
  "lots": 1,
  "stop_loss": 145.0,
  "target_1": 225.0,
  "target_2": 270.0
}
```

### `GET /api/paper-trades`
Returns active paper trading positions, virtual capital, and simulated P&L.

### `POST /api/paper-trades/{id}/close`
Manually exits an open paper trade position.

### `POST /api/backtest`
Executes a quantitative strategy simulation over historical candlestick data.
- Payload: `symbol`, `timeframe`, `min_score`, `target_multiplier`, `sl_multiplier`.

---

## 5. WebSocket Live Feed

### `WS /ws/market/{symbol}`
Establishes a real-time bi-directional streaming connection.
- Streams ticks every 3 seconds:
```json
{
  "type": "TICK_UPDATE",
  "symbol": "NIFTY",
  "ltp": 25430.50,
  "change": 150.70,
  "p_change": 0.60,
  "vwap": 25412.00,
  "timestamp": "2026-09-13 10:15:35 IST",
  "data_source": "COMPOSITE",
  "is_delayed": false
}
```
