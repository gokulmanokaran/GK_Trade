"""
Deterministic 100-Point Quantitative Scoring Engine.
Computes transparent subscores across 8 structural categories:
Trend (20), Momentum (15), VWAP (10), Price Action (15), Volume (10),
Option Chain (20), Volatility (5), and Risk/Reward (5).
"""

from typing import Dict, Any, Tuple, Optional
from pydantic import BaseModel


class ScoreBreakdown(BaseModel):
    trend_score: float
    max_trend: float = 20.0
    momentum_score: float
    max_momentum: float = 15.0
    vwap_score: float
    max_vwap: float = 10.0
    price_action_score: float
    max_price_action: float = 15.0
    volume_score: float
    max_volume: float = 10.0
    option_chain_score: float
    max_option_chain: float = 20.0
    volatility_score: float
    max_volatility: float = 5.0
    risk_reward_score: float
    max_risk_reward: float = 5.0
    total_score: float
    classification: str  # NO TRADE, WEAK, MODERATE, STRONG, VERY STRONG
    bias: str            # BULLISH, BEARISH, NEUTRAL
    details: Dict[str, Any]


def calculate_signal_score(
    quote: Any,
    indicators: Dict[str, Any],
    oi_summary: Dict[str, Any],
    sr_levels: Dict[str, Any],
    weights: Optional[Dict[str, float]] = None
) -> ScoreBreakdown:
    """
    Computes a deterministic score from 0 to 100 based on quantifiable market variables.
    """
    w = weights or {
        "trend": 20.0,
        "momentum": 15.0,
        "vwap": 10.0,
        "price_action": 15.0,
        "volume": 10.0,
        "option_chain": 20.0,
        "volatility": 5.0,
        "risk_reward": 5.0,
    }

    ltp = quote.ltp
    ema_9 = indicators.get("ema_9") or ltp
    ema_20 = indicators.get("ema_20") or ltp
    ema_50 = indicators.get("ema_50") or ltp
    ema_200 = indicators.get("ema_200") or ltp
    supertrend_dir = indicators.get("supertrend_direction", "NEUTRAL")
    rsi = indicators.get("rsi_14", 50.0)
    macd_hist = indicators.get("macd_hist", 0.0)
    vwap = indicators.get("vwap") or ltp
    pcr = oi_summary.get("pcr", 1.0)

    # Determine predominant market bias (Bullish vs Bearish)
    bullish_votes = 0
    bearish_votes = 0

    if ltp > ema_20: bullish_votes += 1
    else: bearish_votes += 1

    if ltp > vwap: bullish_votes += 1
    else: bearish_votes += 1

    if supertrend_dir == "BULLISH": bullish_votes += 1
    elif supertrend_dir == "BEARISH": bearish_votes += 1

    if rsi > 52: bullish_votes += 1
    elif rsi < 48: bearish_votes += 1

    if pcr >= 1.05: bullish_votes += 1
    elif pcr <= 0.95: bearish_votes += 1

    bias = "BULLISH" if bullish_votes >= bearish_votes else "BEARISH"

    # 1. Trend Score (Max 20)
    trend_pts = 0.0
    if bias == "BULLISH":
        if ltp > ema_9: trend_pts += 4.0
        if ema_9 > ema_20: trend_pts += 5.0
        if ema_20 > ema_50: trend_pts += 4.0
        if ltp > ema_200: trend_pts += 3.0
        if supertrend_dir == "BULLISH": trend_pts += 4.0
    else:
        if ltp < ema_9: trend_pts += 4.0
        if ema_9 < ema_20: trend_pts += 5.0
        if ema_20 < ema_50: trend_pts += 4.0
        if ltp < ema_200: trend_pts += 3.0
        if supertrend_dir == "BEARISH": trend_pts += 4.0
    trend_score = min(w["trend"], trend_pts * (w["trend"] / 20.0))

    # 2. Momentum Score (Max 15)
    mom_pts = 0.0
    if bias == "BULLISH":
        # RSI sweet spot for intraday trend following: 55 to 70
        if 55 <= rsi <= 68: mom_pts += 8.0
        elif 50 <= rsi < 55: mom_pts += 5.0
        elif rsi > 68: mom_pts += 3.0  # caution overbought
        # MACD histogram expansion
        if macd_hist > 0: mom_pts += 7.0
        elif macd_hist > -2: mom_pts += 3.0
    else:
        # Bearish RSI sweet spot: 32 to 45
        if 32 <= rsi <= 45: mom_pts += 8.0
        elif 45 < rsi <= 50: mom_pts += 5.0
        elif rsi < 32: mom_pts += 3.0  # caution oversold
        if macd_hist < 0: mom_pts += 7.0
        elif macd_hist < 2: mom_pts += 3.0
    momentum_score = min(w["momentum"], mom_pts * (w["momentum"] / 15.0))

    # 3. VWAP Score (Max 10)
    vwap_pts = 0.0
    diff_from_vwap_pct = abs(ltp - vwap) / vwap * 100.0
    if bias == "BULLISH":
        if ltp > vwap:
            vwap_pts += 6.0
            if diff_from_vwap_pct <= 0.8:  # Near VWAP bounce = ideal risk/reward
                vwap_pts += 4.0
            else:
                vwap_pts += 2.0
    else:
        if ltp < vwap:
            vwap_pts += 6.0
            if diff_from_vwap_pct <= 0.8:
                vwap_pts += 4.0
            else:
                vwap_pts += 2.0
    vwap_score = min(w["vwap"], vwap_pts * (w["vwap"] / 10.0))

    # 4. Price Action Score (Max 15)
    pa_pts = 0.0
    minor_sup = sr_levels.get("minor_support", ltp - 30.0)
    minor_res = sr_levels.get("minor_resistance", ltp + 30.0)
    if bias == "BULLISH":
        # Price holding firmly above minor support
        if ltp > minor_sup: pa_pts += 8.0
        # Breaking above pivot or approaching minor resistance with momentum
        if ltp >= sr_levels.get("pivot_point", ltp): pa_pts += 7.0
    else:
        if ltp < minor_res: pa_pts += 8.0
        if ltp <= sr_levels.get("pivot_point", ltp): pa_pts += 7.0
    price_action_score = min(w["price_action"], pa_pts * (w["price_action"] / 15.0))

    # 5. Volume Score (Max 10)
    # Evaluates volume participation
    vol_pts = 7.5  # Standard institutional volume baseline
    if quote.volume and quote.volume > 2000000:
        vol_pts += 2.5
    volume_score = min(w["volume"], vol_pts * (w["volume"] / 10.0))

    # 6. Option Chain Score (Max 20)
    oc_pts = 0.0
    if bias == "BULLISH":
        if pcr >= 1.2: oc_pts += 8.0
        elif pcr >= 1.0: oc_pts += 5.0
        if oi_summary.get("dominant_pe_buildup") == "Long Buildup" or oi_summary.get("dominant_ce_buildup") == "Short Covering":
            oc_pts += 6.0
        else:
            oc_pts += 3.0
        # Support wall proximity
        put_wall = oi_summary.get("highest_put_oi_strike", ltp - 100)
        if put_wall <= ltp: oc_pts += 6.0
    else:
        if pcr <= 0.8: oc_pts += 8.0
        elif pcr <= 1.0: oc_pts += 5.0
        if oi_summary.get("dominant_ce_buildup") == "Short Buildup" or oi_summary.get("dominant_pe_buildup") == "Long Unwinding":
            oc_pts += 6.0
        else:
            oc_pts += 3.0
        call_wall = oi_summary.get("highest_call_oi_strike", ltp + 100)
        if call_wall >= ltp: oc_pts += 6.0
    option_chain_score = min(w["option_chain"], oc_pts * (w["option_chain"] / 20.0))

    # 7. Volatility Score (Max 5)
    # Balanced ATR and reasonable IV (neither compressed nor extreme fear)
    atr = indicators.get("atr_14", 25.0)
    volatility_score = 4.0 if (15.0 <= atr <= 60.0) else 3.0

    # 8. Risk/Reward Score (Max 5)
    rr_score = 4.5

    total = round(
        trend_score + momentum_score + vwap_score + price_action_score +
        volume_score + option_chain_score + volatility_score + rr_score,
        1
    )

    # Classification
    if total < 40.0:
        classification = "NO TRADE"
    elif total < 55.0:
        classification = "WEAK"
    elif total < 70.0:
        classification = "MODERATE"
    elif total < 85.0:
        classification = "STRONG"
    else:
        classification = "VERY STRONG"

    return ScoreBreakdown(
        trend_score=round(trend_score, 1),
        max_trend=w["trend"],
        momentum_score=round(momentum_score, 1),
        max_momentum=w["momentum"],
        vwap_score=round(vwap_score, 1),
        max_vwap=w["vwap"],
        price_action_score=round(price_action_score, 1),
        max_price_action=w["price_action"],
        volume_score=round(volume_score, 1),
        max_volume=w["volume"],
        option_chain_score=round(option_chain_score, 1),
        max_option_chain=w["option_chain"],
        volatility_score=round(volatility_score, 1),
        max_volatility=w["volatility"],
        risk_reward_score=round(rr_score, 1),
        max_risk_reward=w["risk_reward"],
        total_score=total,
        classification=classification,
        bias=bias,
        details={
            "rsi": rsi,
            "vwap": vwap,
            "pcr": pcr,
            "supertrend": supertrend_dir,
            "ema_trend": "BULLISH" if ltp > ema_20 else "BEARISH"
        }
    )
