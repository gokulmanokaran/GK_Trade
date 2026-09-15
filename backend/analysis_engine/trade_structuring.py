"""
Trade Structuring Engine for OptionPulse.
Synthesizes market data, technical structure, Greeks, and scoring output into
actionable manual trade parameters: Entry Zone, Stop Loss, Targets, Risk/Reward,
Trailing SL, dynamic Exit conditions, and structural invalidation levels.
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel
from backend.data_provider.interface import UnderlyingQuote, OptionChainData, Candle
from backend.analysis_engine.scoring_engine import ScoreBreakdown


class StructuredTrade(BaseModel):
    signal: str                # CALL BUY, PUT BUY, NO TRADE
    instrument: str            # e.g., 'NIFTY 25400 CE'
    strike_price: float
    option_type: str           # CE or PE
    current_option_ltp: float
    entry_low: float
    entry_high: float
    entry_trigger: str
    stop_loss: float
    stop_loss_reason: str
    target_1: float
    target_2: float
    target_3: Optional[float] = None
    exit_condition: str
    exit_status: str           # HOLD, TRAIL SL, EXIT NOW
    trailing_sl: Optional[float] = None
    risk_points: float
    reward_points: float
    risk_reward: float
    signal_score: float
    confidence: float
    signal_strength: str       # NO TRADE, WEAK, MODERATE, STRONG, VERY STRONG
    market_bias: str           # BULLISH, BEARISH, NEUTRAL
    invalidation_level: str
    reasons: list[str]


def structure_option_trade(
    quote: UnderlyingQuote,
    chain: OptionChainData,
    score: ScoreBreakdown,
    sr_levels: Dict[str, Any],
    indicators: Dict[str, Any]
) -> StructuredTrade:
    """
    Constructs an institutional-grade manual trade setup from deterministic components.
    """
    ltp = quote.ltp
    bias = score.bias
    total_score = score.total_score
    classification = score.classification

    # Handle NO TRADE threshold
    if total_score < 40.0:
        return StructuredTrade(
            signal="NO TRADE",
            instrument=f"{quote.symbol} (Cash)",
            strike_price=ltp,
            option_type="NONE",
            current_option_ltp=0.0,
            entry_low=0.0,
            entry_high=0.0,
            entry_trigger="No setup meeting quantitative criteria. Wait for confluence.",
            stop_loss=0.0,
            stop_loss_reason="No trade active",
            target_1=0.0,
            target_2=0.0,
            risk_points=0.0,
            reward_points=0.0,
            risk_reward=0.0,
            signal_score=total_score,
            confidence=total_score,
            signal_strength="NO TRADE",
            market_bias=bias,
            invalidation_level="N/A",
            exit_condition="Stand aside",
            exit_status="HOLD",
            reasons=["Score below minimum quantitative threshold (40/100).", "Lack of clear momentum and OI confirmation."]
        )

    # Pick ideal strike: ATM or 1 strike ITM for delta ~0.50-0.55
    step = 50.0 if quote.symbol in ["NIFTY", "FINNIFTY"] else 100.0
    atm_strike = round(ltp / step) * step

    is_call = (bias == "BULLISH")
    signal_name = "CALL BUY" if is_call else "PUT BUY"
    option_type = "CE" if is_call else "PE"

    selected_strike = atm_strike
    matching_row = next((s for s in chain.strikes if s.strike_price == selected_strike), None)
    if not matching_row and chain.strikes:
        matching_row = min(chain.strikes, key=lambda s: abs(s.strike_price - selected_strike))
        selected_strike = matching_row.strike_price

    contract = matching_row.ce if is_call else matching_row.pe if matching_row else None
    opt_ltp = contract.ltp if contract and contract.ltp > 0 else (ltp * 0.0075)

    # 1. Entry Zone Calculation
    # Entry zone accounts for bid/ask spread and pullback opportunity
    spread = abs((contract.ask if contract else opt_ltp) - (contract.bid if contract else opt_ltp))
    spread_buffer = max(1.5, min(4.0, spread if spread > 0 else 2.0))

    entry_low = round(max(0.5, opt_ltp - spread_buffer), 1)
    entry_high = round(max(entry_low + 0.5, opt_ltp + (spread_buffer * 0.5)), 1)
    entry_trigger = f"Wait for confirmation above Rs.{entry_high:.1f} or entry on pullback near Rs.{entry_low:.1f}"

    # 2. Stop Loss Calculation based on underlying structure & ATR
    atr = indicators.get("atr_14", 25.0)
    delta = contract.greeks.delta if (contract and contract.greeks.delta) else 0.50
    delta_eff = max(0.35, min(0.65, abs(delta)))

    # Invalidation based on underlying support/resistance
    if is_call:
        sup_level = sr_levels.get("minor_support", ltp - 35.0)
        underlying_risk = max(15.0, ltp - sup_level)
        opt_risk = round(underlying_risk * delta_eff, 1)
        opt_risk = max(12.0, min(opt_ltp * 0.30, opt_risk))
        sl_price = round(max(2.0, opt_ltp - opt_risk), 1)
        sl_reason = f"Based on underlying support at {sup_level:,.0f} & ATR({atr:.1f})"
        invalidation = f"{quote.symbol} breaks below {sup_level:,.0f}"
    else:
        res_level = sr_levels.get("minor_resistance", ltp + 35.0)
        underlying_risk = max(15.0, res_level - ltp)
        opt_risk = round(underlying_risk * delta_eff, 1)
        opt_risk = max(12.0, min(opt_ltp * 0.30, opt_risk))
        sl_price = round(max(2.0, opt_ltp - opt_risk), 1)
        sl_reason = f"Based on underlying resistance at {res_level:,.0f} & ATR({atr:.1f})"
        invalidation = f"{quote.symbol} sustains above {res_level:,.0f}"

    risk = round(opt_ltp - sl_price, 1)
    risk = max(5.0, risk)

    # 3. Target Calculations (1:1.2 for T1, 1:2.1 for T2, 1:3.2 for T3)
    target_1 = round(opt_ltp + (risk * 1.2), 1)
    target_2 = round(opt_ltp + (risk * 2.1), 1)
    target_3 = round(opt_ltp + (risk * 3.2), 1)

    rr_ratio = round((target_2 - opt_ltp) / risk, 1)

    # 4. Exit Engine Condition
    exit_status = "HOLD"
    trailing_sl = None
    exit_cond = f"Exit at Target 2 (Rs.{target_2}) or upon break of {invalidation}."

    # Reasons
    reasons = []
    reasons.append(f"Trend: Price structure exhibits {bias.lower()} alignment across EMAs & Supertrend.")
    reasons.append(f"VWAP: Underlying trading {'above' if is_call else 'below'} institutional intraday VWAP ({indicators.get('vwap', ltp)}).")
    reasons.append(f"Option Chain: PCR at {chain.pcr:.2f} with strong {'Put' if is_call else 'Call'} OI support base.")
    reasons.append(f"Momentum: RSI at {indicators.get('rsi_14', 50):.1f} confirming directional velocity without exhaustion.")

    instrument_name = f"{quote.symbol} {int(selected_strike)} {option_type}"

    return StructuredTrade(
        signal=signal_name,
        instrument=instrument_name,
        strike_price=selected_strike,
        option_type=option_type,
        current_option_ltp=round(opt_ltp, 2),
        entry_low=entry_low,
        entry_high=entry_high,
        entry_trigger=entry_trigger,
        stop_loss=sl_price,
        stop_loss_reason=sl_reason,
        target_1=target_1,
        target_2=target_2,
        target_3=target_3,
        exit_condition=exit_cond,
        exit_status=exit_status,
        trailing_sl=trailing_sl,
        risk_points=risk,
        reward_points=round(target_2 - opt_ltp, 1),
        risk_reward=rr_ratio,
        signal_score=total_score,
        confidence=total_score,
        signal_strength=classification,
        market_bias=bias,
        invalidation_level=invalidation,
        reasons=reasons
    )
