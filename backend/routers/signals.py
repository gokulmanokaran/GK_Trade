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

        # Persist signal if active trade setup
        if trade.signal != "NO TRADE":
            db_signal = Signal(
                symbol=sym,
                instrument=trade.instrument,
                direction=trade.signal,
                entry_low=trade.entry_low,
                entry_high=trade.entry_high,
                entry_trigger=trade.entry_trigger,
                stop_loss=trade.stop_loss,
                stop_loss_reason=trade.stop_loss_reason,
                target_1=trade.target_1,
                target_2=trade.target_2,
                target_3=trade.target_3,
                exit_condition=trade.exit_condition,
                risk_reward=trade.risk_reward,
                signal_score=trade.signal_score,
                confidence=trade.confidence,
                signal_strength=trade.signal_strength,
                market_bias=trade.market_bias,
                invalidation_level=trade.invalidation_level,
                reason=" | ".join(trade.reasons),
                ai_explanation=ai_expl["summary"],
                status="ACTIVE",
                outcome="PENDING"
            )
            db.add(db_signal)
            await db.flush()

            db_comp = SignalComponent(
                signal_id=db_signal.id,
                trend_score=score.trend_score,
                momentum_score=score.momentum_score,
                vwap_score=score.vwap_score,
                price_action_score=score.price_action_score,
                volume_score=score.volume_score,
                option_chain_score=score.option_chain_score,
                volatility_score=score.volatility_score,
                risk_reward_score=score.risk_reward_score,
                total_score=score.total_score,
                details_json=score.details
            )
            db.add(db_comp)
            await db.commit()

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
