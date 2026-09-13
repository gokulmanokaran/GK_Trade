"""
Market & Indices API Router.
Provides endpoints for index quotes, market status, and chart candlestick series.
"""

from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from backend.data_provider import CompositeMarketDataProvider
from backend.analysis_engine import calculate_indicators

router = APIRouter(prefix="/api/market", tags=["Market"])
provider = CompositeMarketDataProvider()


@router.get("/indices")
async def get_indices():
    """Returns overview quotes and trend badges for core Indian indices."""
    symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY"]
    results = []

    for sym in symbols:
        try:
            q = await provider.get_index_quote(sym)
            candles = await provider.get_historical_data(sym, "5m", 30)
            inds = calculate_indicators(candles)
            trend = inds.get("supertrend_direction", "BULLISH")
            if q.ltp > (q.prev_close or q.ltp):
                trend = "BULLISH"
            elif q.ltp < (q.prev_close or q.ltp):
                trend = "BEARISH"

            results.append({
                "symbol": sym,
                "name": "NIFTY 50" if sym == "NIFTY" else ("NIFTY BANK" if sym == "BANKNIFTY" else "FINNIFTY"),
                "ltp": q.ltp,
                "change": q.change,
                "p_change": q.p_change,
                "open": q.open,
                "high": q.high,
                "low": q.low,
                "prev_close": q.prev_close,
                "vwap": q.vwap,
                "trend": trend,
                "timestamp": q.timestamp,
                "data_source": q.data_source,
                "is_delayed": q.is_delayed,
                "data_age_seconds": q.data_age_seconds
            })
        except Exception as e:
            results.append({
                "symbol": sym,
                "name": sym,
                "ltp": 0.0,
                "change": 0.0,
                "p_change": 0.0,
                "trend": "NEUTRAL",
                "error": str(e)
            })

    market_status = provider.get_market_status()
    return {
        "indices": results,
        "market_status": market_status.model_dump()
    }


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """Returns single quote with comprehensive pricing metrics."""
    try:
        q = await provider.get_index_quote(symbol)
        return q.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quote for {symbol}: {str(e)}")


@router.get("/charts/{symbol}")
async def get_chart_data(
    symbol: str,
    timeframe: str = Query("5m", pattern="^(1m|3m|5m|15m|30m|1H|1D)$"),
    limit: int = Query(80, ge=10, le=200)
):
    """Returns candlestick series and overlay indicators for interactive charts."""
    try:
        candles = await provider.get_historical_data(symbol, timeframe, limit)
        inds = calculate_indicators(candles)
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe,
            "candles": [c.model_dump() for c in candles],
            "indicators": inds
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chart data: {str(e)}")
