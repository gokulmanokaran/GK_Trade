"""
Support and Resistance Engine.
Combines price action swing extremes, Open Interest (OI) walls, and classic floor pivots
to compute institutional Major/Minor Support and Resistance levels.
"""

from typing import Dict, Any, List
from backend.data_provider.interface import UnderlyingQuote, OptionChainData, Candle


def calculate_support_resistance(
    quote: UnderlyingQuote,
    chain: OptionChainData,
    candles: List[Candle]
) -> Dict[str, Any]:
    """
    Computes Major Support, Minor Support, Major Resistance, Minor Resistance, and Pivots.
    """
    ltp = quote.ltp

    # 1. Floor Pivot Calculation from recent candles
    if candles and len(candles) >= 10:
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        period_high = max(highs)
        period_low = min(lows)
        period_close = candles[-1].close
    else:
        period_high = quote.high or (ltp + 50.0)
        period_low = quote.low or (ltp - 50.0)
        period_close = quote.prev_close or ltp

    pivot = (period_high + period_low + period_close) / 3.0
    r1 = (2.0 * pivot) - period_low
    s1 = (2.0 * pivot) - period_high
    r2 = pivot + (period_high - period_low)
    s2 = pivot - (period_high - period_low)

    # 2. Open Interest based levels
    highest_call_strike = ltp + 100.0
    highest_put_strike = ltp - 100.0

    if chain.strikes:
        otm_calls = [s for s in chain.strikes if s.strike_price >= ltp]
        otm_puts = [s for s in chain.strikes if s.strike_price <= ltp]

        if otm_calls:
            highest_call_strike = max(otm_calls, key=lambda s: s.ce.oi).strike_price
        if otm_puts:
            highest_put_strike = max(otm_puts, key=lambda s: s.pe.oi).strike_price

    # 3. Blend price levels with OI boundaries
    # Major Resistance: max(r2, highest_call_strike)
    # Minor Resistance: min(r1, highest_call_strike)
    # Major Support: min(s2, highest_put_strike)
    # Minor Support: max(s1, highest_put_strike)

    major_res = round(max(r1, highest_call_strike), 2)
    minor_res = round(min(r1, highest_call_strike) if highest_call_strike > ltp else r1, 2)
    major_supp = round(min(s1, highest_put_strike), 2)
    minor_supp = round(max(s1, highest_put_strike) if highest_put_strike < ltp else s1, 2)

    # Sanity checks
    if minor_res <= ltp:
        minor_res = round(ltp + 35.0, 2)
    if major_res <= minor_res:
        major_res = round(minor_res + 65.0, 2)
    if minor_supp >= ltp:
        minor_supp = round(ltp - 35.0, 2)
    if major_supp >= minor_supp:
        major_supp = round(minor_supp - 65.0, 2)

    return {
        "symbol": quote.symbol,
        "ltp": ltp,
        "pivot_point": round(pivot, 2),
        "major_resistance": major_res,
        "minor_resistance": minor_res,
        "major_support": major_supp,
        "minor_support": minor_supp,
        "classic_r1": round(r1, 2),
        "classic_r2": round(r2, 2),
        "classic_s1": round(s1, 2),
        "classic_s2": round(s2, 2),
        "oi_resistance_wall": highest_call_strike,
        "oi_support_wall": highest_put_strike,
    }
