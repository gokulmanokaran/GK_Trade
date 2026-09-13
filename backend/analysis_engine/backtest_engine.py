"""
Backtesting Engine for OptionPulse.
Simulates deterministic signal execution across historical candlestick bars.
Computes institutional performance metrics: Win Rate, Profit Factor, Max Drawdown,
Consecutive Wins/Losses, and Net Simulated P&L.
"""

from typing import List, Dict, Any
from pydantic import BaseModel
from backend.data_provider.interface import Candle
from backend.analysis_engine.indicators import calculate_indicators


class BacktestTradeResult(BaseModel):
    trade_num: int
    instrument: str
    direction: str
    entry_time: str
    entry_price: float
    exit_time: str
    exit_price: float
    pnl: float
    pnl_pct: float
    exit_reason: str


class BacktestSummary(BaseModel):
    symbol: str
    timeframe: str
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    max_drawdown: float
    net_simulated_pnl: float
    consecutive_wins: int
    consecutive_losses: int
    trades: List[BacktestTradeResult]
    equity_curve: List[Dict[str, Any]]
    disclaimer: str = "Simulated backtest results are for strategy evaluation only. Past simulated performance does not guarantee future results."


def run_backtest_simulation(
    symbol: str,
    candles: List[Candle],
    timeframe: str = "5m",
    min_score: float = 70.0,
    target_mult: float = 1.5,
    sl_mult: float = 1.0,
    lot_size: int = 25
) -> BacktestSummary:
    """
    Executes backtest over provided candle series.
    """
    if len(candles) < 30:
        return BacktestSummary(
            symbol=symbol, timeframe=timeframe, total_trades=0, winning_trades=0,
            losing_trades=0, win_rate=0.0, avg_win=0.0, avg_loss=0.0,
            profit_factor=0.0, max_drawdown=0.0, net_simulated_pnl=0.0,
            consecutive_wins=0, consecutive_losses=0, trades=[], equity_curve=[]
        )

    trades: List[BacktestTradeResult] = []
    equity_curve: List[Dict[str, Any]] = []

    capital = 100000.0
    peak_capital = capital
    max_dd = 0.0

    in_trade = False
    entry_price = 0.0
    entry_time = ""
    direction = ""
    sl_price = 0.0
    target_price = 0.0
    trade_count = 0

    curr_cons_wins = 0
    max_cons_wins = 0
    curr_cons_loss = 0
    max_cons_loss = 0

    total_wins_val = 0.0
    total_loss_val = 0.0

    equity_curve.append({"time": candles[20].timestamp, "equity": capital})

    # Rolling simulation from index 20
    for i in range(20, len(candles)):
        sub_candles = candles[:i]
        c = candles[i]
        inds = calculate_indicators(sub_candles)

        if not in_trade:
            # Deterministic trigger based on EMA & Supertrend confluence
            ema_9 = inds.get("ema_9", c.close)
            ema_20 = inds.get("ema_20", c.close)
            vwap = inds.get("vwap", c.close)
            rsi = inds.get("rsi_14", 50.0)

            # Option synthetic delta approximation (~0.50)
            synthetic_opt_price = round(max(30.0, c.close * 0.0075), 1)

            if ema_9 > ema_20 and c.close > vwap and rsi > 54:
                # Enter CALL BUY
                in_trade = True
                direction = "CALL BUY"
                entry_price = synthetic_opt_price
                entry_time = c.timestamp
                risk = 25.0 * sl_mult
                sl_price = max(5.0, entry_price - risk)
                target_price = entry_price + (risk * target_mult)
                trade_count += 1
            elif ema_9 < ema_20 and c.close < vwap and rsi < 46:
                # Enter PUT BUY
                in_trade = True
                direction = "PUT BUY"
                entry_price = synthetic_opt_price
                entry_time = c.timestamp
                risk = 25.0 * sl_mult
                sl_price = max(5.0, entry_price - risk)
                target_price = entry_price + (risk * target_mult)
                trade_count += 1
        else:
            # Check exit conditions on candle high/low movement
            candle_change = (c.close - candles[i - 1].close)
            opt_move = candle_change * (0.50 if direction == "CALL BUY" else -0.50)
            current_opt_price = max(2.0, entry_price + opt_move)

            hit_target = current_opt_price >= target_price
            hit_sl = current_opt_price <= sl_price
            timeout_exit = (i == len(candles) - 1)

            if hit_target or hit_sl or timeout_exit:
                exit_price = target_price if hit_target else (sl_price if hit_sl else current_opt_price)
                exit_reason = "TARGET HIT" if hit_target else ("STOP LOSS HIT" if hit_sl else "END OF SESSION")

                pnl_per_unit = exit_price - entry_price
                trade_pnl = round(pnl_per_unit * lot_size, 2)
                pnl_pct = round((pnl_per_unit / entry_price) * 100, 2)

                capital += trade_pnl
                if capital > peak_capital:
                    peak_capital = capital
                dd = ((peak_capital - capital) / peak_capital) * 100.0
                if dd > max_dd:
                    max_dd = dd

                if trade_pnl > 0:
                    total_wins_val += trade_pnl
                    curr_cons_wins += 1
                    curr_cons_loss = 0
                    if curr_cons_wins > max_cons_wins:
                        max_cons_wins = curr_cons_wins
                else:
                    total_loss_val += abs(trade_pnl)
                    curr_cons_loss += 1
                    curr_cons_wins = 0
                    if curr_cons_loss > max_cons_loss:
                        max_cons_loss = curr_cons_loss

                trades.append(
                    BacktestTradeResult(
                        trade_num=trade_count,
                        instrument=f"{symbol} OPT {direction[:4]}",
                        direction=direction,
                        entry_time=entry_time,
                        entry_price=round(entry_price, 2),
                        exit_time=c.timestamp,
                        exit_price=round(exit_price, 2),
                        pnl=trade_pnl,
                        pnl_pct=pnl_pct,
                        exit_reason=exit_reason
                    )
                )
                equity_curve.append({"time": c.timestamp, "equity": round(capital, 2)})
                in_trade = False

    tot_trades = len(trades)
    win_trades = len([t for t in trades if t.pnl > 0])
    loss_trades = tot_trades - win_trades
    win_rate = round((win_trades / tot_trades) * 100, 1) if tot_trades else 0.0

    avg_win = round(total_wins_val / max(1, win_trades), 2) if win_trades else 0.0
    avg_loss = round(total_loss_val / max(1, loss_trades), 2) if loss_trades else 0.0
    profit_factor = round(total_wins_val / max(1.0, total_loss_val), 2)
    net_pnl = round(capital - 100000.0, 2)

    return BacktestSummary(
        symbol=symbol,
        timeframe=timeframe,
        total_trades=tot_trades,
        winning_trades=win_trades,
        losing_trades=loss_trades,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=profit_factor,
        max_drawdown=round(max_dd, 2),
        net_simulated_pnl=net_pnl,
        consecutive_wins=max_cons_wins,
        consecutive_losses=max_cons_loss,
        trades=trades,
        equity_curve=equity_curve
    )
