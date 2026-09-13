"""
Option Chain and In-Depth Technical/OI Analysis API Router.
"""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from backend.data_provider import CompositeMarketDataProvider
from backend.analysis_engine import (
    calculate_indicators, analyze_open_interest,
    calculate_support_resistance, calculate_signal_score
)

router = APIRouter(prefix="/api/options", tags=["Options & Analysis"])
provider = CompositeMarketDataProvider()


@router.get("/expiries/{symbol}")
async def get_expiries(symbol: str):
    """Returns available contract expiry dates for the symbol."""
    try:
        expiries = await provider.get_expiries(symbol)
        return {"symbol": symbol.upper(), "expiries": expiries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chain/{symbol}")
async def get_option_chain(
    symbol: str,
    expiry: Optional[str] = Query(None, description="Contract expiry date"),
    strike_range: int = Query(15, ge=5, le=50, description="Strikes above and below ATM")
):
    """Returns full option chain with Black-Scholes Greeks, OI, Volume, and PCR."""
    try:
        chain = await provider.get_option_chain(symbol, expiry)

        # Slice strikes around ATM if strike_range requested
        step = 50.0 if symbol.upper() in ["NIFTY", "FINNIFTY"] else 100.0
        atm_strike = round(chain.underlying_ltp / step) * step

        all_strikes = chain.strikes
        # Filter around ATM
        filtered = [s for s in all_strikes if abs(s.strike_price - atm_strike) <= (strike_range * step)]
        if not filtered:
            filtered = all_strikes

        return {
            "symbol": chain.symbol,
            "expiry_date": chain.expiry_date,
            "available_expiries": chain.available_expiries,
            "underlying_ltp": chain.underlying_ltp,
            "atm_strike": atm_strike,
            "pcr": chain.pcr,
            "max_pain": chain.max_pain,
            "total_ce_oi": chain.total_ce_oi,
            "total_pe_oi": chain.total_pe_oi,
            "timestamp": chain.timestamp,
            "data_source": chain.data_source,
            "is_delayed": chain.is_delayed,
            "strikes": [s.model_dump() for s in filtered]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch option chain: {str(e)}")


@router.get("/analysis/{symbol}")
async def get_symbol_analysis(
    symbol: str,
    expiry: Optional[str] = Query(None)
):
    """Returns comprehensive multi-layer analytics: Indicators, OI, Support/Resistance, and Score."""
    try:
        sym = symbol.upper()
        q = await provider.get_index_quote(sym)
        chain = await provider.get_option_chain(sym, expiry)
        candles = await provider.get_historical_data(sym, "5m", 80)

        indicators = calculate_indicators(candles)
        oi_analysis = analyze_open_interest(chain)
        sr_levels = calculate_support_resistance(q, chain, candles)
        score = calculate_signal_score(q, indicators, oi_analysis, sr_levels)

        return {
            "symbol": sym,
            "underlying_ltp": q.ltp,
            "indicators": indicators,
            "oi_analysis": oi_analysis,
            "support_resistance": sr_levels,
            "score_breakdown": score.model_dump(),
            "timestamp": q.timestamp,
            "data_source": q.data_source
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to calculate symbol analysis: {str(e)}")
