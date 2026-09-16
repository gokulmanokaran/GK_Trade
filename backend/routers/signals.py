"""
Signals API Router.
Generates deterministic quantitative market signals, stores signal history,
and serves trade setups with transparent score breakdowns and AI explanations.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.database import get_db, Signal, SignalComponent
from backend.data_provider import CompositeMarketDataProvider
from backend.analysis_engine import (
    calculate_indicators, analyze_open_interest,
    calculate_support_resistance, calculate_signal_score,
    structure_option_trade, generate_trade_explanation
)
from backend.analysis_engine.confluence_strategy import ConfluenceStrategyEngine
from dataclasses import asdict

router = APIRouter(prefix="/api/signals", tags=["Signals"])
provider = CompositeMarketDataProvider()


@router.get("/latest")
async def get_latest_signal(
    symbol: str = Query("NIFTY", description="Underlying symbol"),
    db: AsyncSession = Depends(get_db)
):
    """
    Evaluates market conditions in real-time, calculates deterministic trade setup,
    generates post-calculation AI narrative, persists to DB, and returns result.
    """
    sym = symbol.upper()
    try:
        quote = await provider.get_index_quote(sym)
        chain = await provider.get_option_chain(sym)
        candles = await provider.get_historical_data(sym, "5m", 80)

        indicators = calculate_indicators(candles)
        oi_summary = analyze_open_interest(chain)
        sr_levels = calculate_support_resistance(quote, chain, candles)
        score = calculate_signal_score(quote, indicators, oi_summary, sr_levels)
        trade = structure_option_trade(quote, chain, score, sr_levels, indicators)
        ai_expl = generate_trade_explanation(trade, score, sr_levels, oi_summary, indicators)

        # Confluence Strategy Setup (Strict 20 Rules)
        is_market_open = provider.get_market_status().is_open
        confluence = ConfluenceStrategyEngine.evaluate(
            candles=candles,
            quote=quote,
            chain=chain,
            is_market_open=is_market_open,
            data_quality=getattr(quote, "data_quality", "LIVE"),
            data_source=quote.data_source,
            data_age_seconds=quote.data_age_seconds,
            is_live_data=getattr(quote, "is_live_data", not quote.is_delayed)
        )

        # Return evaluation result strictly without side-effects (GET is read-only)
        return {
            "trade": trade.model_dump(),
            "confluence_setup": asdict(confluence),
            "score_breakdown": score.model_dump(),
            "ai_explanation": ai_expl,
            "support_resistance": sr_levels,
            "oi_summary": oi_summary,
            "indicators": indicators,
            "underlying": {
                "symbol": quote.symbol,
                "ltp": quote.ltp,
                "change": quote.change,
                "p_change": quote.p_change,
                "vwap": quote.vwap,
                "timestamp": quote.timestamp,
                "data_source": quote.data_source,
                "is_delayed": quote.is_delayed,
                "data_quality": getattr(quote, "data_quality", "LIVE"),
                "is_live_data": getattr(quote, "is_live_data", not quote.is_delayed),
                "data_age_seconds": quote.data_age_seconds,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signal generation error: {str(e)}")


@router.get("/history")
async def get_signal_history(
    symbol: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Fetches stored signal history with score, confidence, and simulated performance."""
    try:
        stmt = select(Signal).order_by(desc(Signal.timestamp)).limit(limit)
        if symbol:
            stmt = stmt.where(Signal.symbol == symbol.upper())

        result = await db.execute(stmt)
        signals = result.scalars().all()

        history = []
        for s in signals:
            history.append({
                "id": s.id,
                "timestamp": s.timestamp.strftime("%H:%M:%S") if s.timestamp else "",
                "date": s.timestamp.strftime("%Y-%m-%d") if s.timestamp else "",
                "symbol": s.symbol,
                "instrument": s.instrument,
                "direction": s.direction,
                "entry_zone": f"₹{s.entry_low} - ₹{s.entry_high}",
                "stop_loss": s.stop_loss,
                "target_1": s.target_1,
                "target_2": s.target_2,
                "risk_reward": f"1:{s.risk_reward}",
                "score": s.signal_score,
                "confidence": s.confidence,
                "strength": s.signal_strength,
                "market_bias": s.market_bias,
                "invalidation": s.invalidation_level,
                "status": s.status,
                "outcome": s.outcome,
                "simulated_pnl": s.simulated_pnl
            })
        return {"signals": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{signal_id}")
async def delete_signal(
    signal_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Deletes a signal and its associated components from the database."""
    try:
        stmt = select(Signal).where(Signal.id == signal_id)
        result = await db.execute(stmt)
        sig = result.scalars().first()
        if not sig:
            raise HTTPException(status_code=404, detail=f"Signal {signal_id} not found")

        await db.delete(sig)
        await db.commit()
        return {"success": True, "deleted": signal_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete signal: {str(e)}")

