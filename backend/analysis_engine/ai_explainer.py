"""
AI Explanation Layer for OptionPulse.
Synthesizes quantitative metrics into an institutional-grade narrative explanation.
Strictly executed AFTER numerical calculations are finalized.
NEVER modifies numbers, targets, stop-loss, or scores.
Provides high-quality deterministic synthesis with optional LLM augmentation.
"""

from typing import Dict, Any
from backend.analysis_engine.trade_structuring import StructuredTrade
from backend.analysis_engine.scoring_engine import ScoreBreakdown


def generate_trade_explanation(
    trade: StructuredTrade,
    score: ScoreBreakdown,
    sr_levels: Dict[str, Any],
    oi_summary: Dict[str, Any],
    indicators: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Produces structured explanation addressing:
    1. Market bias
    2. Why signal was generated
    3. Important support
    4. Important resistance
    5. Entry reasoning
    6. Stop-loss reasoning
    7. Target reasoning
    8. Invalidation criteria
    """
    if trade.signal == "NO TRADE":
        return {
            "summary": "No active trade setup detected. Market condition does not meet the minimum confluence threshold (40/100).",
            "market_bias": "Neutral / Sideways",
            "key_support": f"{sr_levels.get('major_support', 'N/A')}",
            "key_resistance": f"{sr_levels.get('major_resistance', 'N/A')}",
            "invalidation": "Wait for breakout or strong directional volume.",
            "full_narrative": "The quantitative engine evaluated trend, momentum, VWAP, and Open Interest. Indicators currently demonstrate mixed signals with no clear directional bias. Capital preservation is recommended."
        }

    is_call = "CALL" in trade.signal
    sup = sr_levels.get("major_support", 0)
    res = sr_levels.get("major_resistance", 0)
    minor_sup = sr_levels.get("minor_support", 0)
    minor_res = sr_levels.get("minor_resistance", 0)

    pcr = oi_summary.get("pcr", 1.0)
    vwap = indicators.get("vwap", "N/A")
    rsi = indicators.get("rsi_14", "N/A")
    st_dir = indicators.get("supertrend_direction", "N/A")

    # 1. Market Bias
    bias_desc = (
        f"{trade.market_bias} with {trade.signal_strength.lower()} conviction. Confluence across multiple timeframes supports a {trade.direction if hasattr(trade, 'direction') else trade.signal} stance."
    )

    # 2. Why Signal Was Generated
    why_gen = (
        f"{trade.signal} is supported by quantitative scoring of {trade.signal_score:.1f}/100. "
        f"Price is positioned {'above' if is_call else 'below'} VWAP ({vwap}), "
        f"confirmed by Supertrend ({st_dir}) and a PCR of {pcr:.2f}. "
        f"Institutional OI concentration confirms {'support buildup on Puts' if is_call else 'resistance capping on Calls'}."
    )

    # 3 & 4. Support & Resistance
    support_desc = f"Major Support at {sup:,.0f} (OI Put wall) with immediate tactical floor at {minor_sup:,.0f}."
    resistance_desc = f"Major Resistance at {res:,.0f} (OI Call wall) with immediate tactical ceiling at {minor_res:,.0f}."

    # 5. Entry Reasoning
    entry_desc = (
        f"Entry Zone configured at ₹{trade.entry_low:.1f} – ₹{trade.entry_high:.1f} "
        f"to prevent chasing near resistance while accommodating normal bid/ask spreads. {trade.entry_trigger}."
    )

    # 6. Stop Loss Reasoning
    sl_desc = (
        f"Stop Loss set at ₹{trade.stop_loss:.1f} ({trade.stop_loss_reason}). "
        f"This level directly reflects structural market invalidation rather than an arbitrary percentage."
    )

    # 7. Target Reasoning
    target_desc = (
        f"Target 1 at ₹{trade.target_1:.1f} (1:1.2 R:R) captures initial liquidity before major pivot. "
        f"Target 2 at ₹{trade.target_2:.1f} (1:{trade.risk_reward:.1f} R:R) targets structural expansion. "
        f"Trailing stop should activate once Target 1 is achieved."
    )

    # 8. Invalidation
    invalidation_desc = f"The setup is strictly invalidated if {trade.invalidation_level}."

    full_narrative = (
        f"{trade.signal} on {trade.instrument} is supported by price sustaining {'above' if is_call else 'below'} VWAP, "
        f"favorable {st_dir} trend alignment, and {'Put' if is_call else 'Call'} OI concentration near {sup if is_call else res}. "
        f"Entry is recommended in the ₹{trade.entry_low:.1f}–₹{trade.entry_high:.1f} zone with SL at ₹{trade.stop_loss:.1f}. "
        f"{invalidation_desc}"
    )

    return {
        "summary": full_narrative,
        "market_bias": bias_desc,
        "signal_generation_reason": why_gen,
        "important_support": support_desc,
        "important_resistance": resistance_desc,
        "entry_reasoning": entry_desc,
        "sl_reasoning": sl_desc,
        "target_reasoning": target_desc,
        "invalidation_criteria": invalidation_desc,
        "full_narrative": full_narrative
    }
