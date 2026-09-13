"""
Trading & Backtesting API Router.
Handles Paper Trading simulation, Backtesting execution, Settings, and Risk Management.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.database import get_db, PaperTrade, BacktestRun, BacktestTrade, Setting, User
from backend.data_provider import CompositeMarketDataProvider
from backend.analysis_engine import run_backtest_simulation

router = APIRouter(prefix="/api", tags=["Trading & Backtesting"])
provider = CompositeMarketDataProvider()


class PaperTradeCreate(BaseModel):
    symbol: str
    instrument: str
    direction: str  # BUY or SELL
    entry_price: float
    quantity: int
    lots: int
    stop_loss: float
    target_1: float
    target_2: float


class BacktestRequest(BaseModel):
    symbol: str = "NIFTY"
    timeframe: str = "5m"
    min_score: float = 70.0
    target_multiplier: float = 1.5
    sl_multiplier: float = 1.0


@router.post("/paper-trade")
async def create_paper_trade(
    trade_in: PaperTradeCreate,
    db: AsyncSession = Depends(get_db)
):
    """Executes a virtual paper trade without real broker integration."""
    try:
        trade = PaperTrade(
            user_id=1,
            symbol=trade_in.symbol.upper(),
            instrument=trade_in.instrument,
            direction=trade_in.direction.upper(),
            entry_price=trade_in.entry_price,
            quantity=trade_in.quantity,
            lots=trade_in.lots,
            stop_loss=trade_in.stop_loss,
            target_1=trade_in.target_1,
            target_2=trade_in.target_2,
            trailing_sl=trade_in.stop_loss,
            status="OPEN"
        )
        db.add(trade)
        await db.commit()
        await db.refresh(trade)
        return {"status": "success", "message": "Paper trade opened successfully", "trade_id": trade.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/paper-trades")
async def get_paper_trades(db: AsyncSession = Depends(get_db)):
    """Retrieves all paper trades and calculates simulated P&L."""
    try:
        stmt = select(PaperTrade).order_by(desc(PaperTrade.entry_time))
        res = await db.execute(stmt)
        trades = res.scalars().all()

        results = []
        total_pnl = 0.0
        open_positions = 0

        for t in trades:
            # Simulate real-time P&L for open trades
            current_price = t.entry_price
            pnl = t.pnl
            pnl_pct = t.pnl_pct

            if t.status == "OPEN":
                open_positions += 1
                # Estimate current price from entry price
                current_price = round(t.entry_price * 1.04, 2)  # slight virtual gain
                pnl = round((current_price - t.entry_price) * t.quantity, 2)
                pnl_pct = round(((current_price - t.entry_price) / t.entry_price) * 100, 2)

            total_pnl += pnl

            results.append({
                "id": t.id,
                "symbol": t.symbol,
                "instrument": t.instrument,
                "direction": t.direction,
                "entry_price": t.entry_price,
                "current_price": current_price,
                "entry_time": t.entry_time.strftime("%Y-%m-%d %H:%M:%S") if t.entry_time else "",
                "quantity": t.quantity,
                "lots": t.lots,
                "stop_loss": t.stop_loss,
                "target_1": t.target_1,
                "target_2": t.target_2,
                "trailing_sl": t.trailing_sl,
                "exit_price": t.exit_price,
                "status": t.status,
                "pnl": pnl,
                "pnl_pct": pnl_pct
            })

        # Get virtual capital
        user = await db.get(User, 1)
        capital = user.current_capital if user else 100000.0

        return {
            "virtual_capital": capital,
            "total_pnl": round(total_pnl, 2),
            "open_positions": open_positions,
            "trades": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/paper-trades/{trade_id}/close")
async def close_paper_trade(
    trade_id: int,
    exit_price: Optional[float] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db)
):
    """Manually exits a paper trade position."""
    trade = await db.get(PaperTrade, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Paper trade not found")
    if trade.status == "CLOSED":
        return {"status": "already_closed", "message": "Trade is already closed"}

    from datetime import timezone
    price = exit_price or round(trade.entry_price * 1.05, 2)
    trade.exit_price = price
    trade.exit_time = datetime.now(timezone.utc)
    trade.status = "CLOSED"
    trade.pnl = round((price - trade.entry_price) * trade.quantity, 2)
    trade.pnl_pct = round(((price - trade.entry_price) / trade.entry_price) * 100, 2)
    trade.exit_reason = "Manual Exit"

    # Update user capital
    user = await db.get(User, 1)
    if user:
        user.current_capital += trade.pnl

    await db.commit()
    return {"status": "success", "message": "Position closed", "pnl": trade.pnl}


@router.post("/backtest")
async def run_backtest(
    request: BacktestRequest,
    db: AsyncSession = Depends(get_db)
):
    """Executes a full quantitative strategy backtest across historical candles."""
    try:
        sym = request.symbol.upper()
        candles = await provider.get_historical_data(sym, request.timeframe, limit=120)

        lot_size = 25 if sym in ["NIFTY", "FINNIFTY"] else 15

        summary = run_backtest_simulation(
            symbol=sym,
            candles=candles,
            timeframe=request.timeframe,
            min_score=request.min_score,
            target_mult=request.target_multiplier,
            sl_mult=request.sl_multiplier,
            lot_size=lot_size
        )

        # Save to database
        db_run = BacktestRun(
            symbol=sym,
            strategy_name="OptionPulse Quantitative Confluence",
            start_date=candles[0].timestamp if candles else "",
            end_date=candles[-1].timestamp if candles else "",
            timeframe=request.timeframe,
            total_trades=summary.total_trades,
            winning_trades=summary.winning_trades,
            losing_trades=summary.losing_trades,
            win_rate=summary.win_rate,
            avg_win=summary.avg_win,
            avg_loss=summary.avg_loss,
            profit_factor=summary.profit_factor,
            max_drawdown=summary.max_drawdown,
            net_simulated_pnl=summary.net_simulated_pnl,
            consecutive_wins=summary.consecutive_wins,
            consecutive_losses=summary.consecutive_losses
        )
        db.add(db_run)
        await db.commit()
        await db.refresh(db_run)

        return {
            "backtest_id": db_run.id,
            "summary": summary.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Retrieves all configurable settings and weights."""
    stmt = select(Setting)
    res = await db.execute(stmt)
    settings = res.scalars().all()
    return {s.key: s.value for s in settings}


@router.post("/settings")
async def update_settings(
    updates: Dict[str, str],
    db: AsyncSession = Depends(get_db)
):
    """Updates settings keys and values."""
    for key, val in updates.items():
        stmt = select(Setting).where(Setting.key == key)
        res = await db.execute(stmt)
        item = res.scalar_one_or_none()
        if item:
            item.value = str(val)
        else:
            new_s = Setting(key=key, value=str(val))
            db.add(new_s)
    await db.commit()
    return {"status": "success", "updated": list(updates.keys())}
