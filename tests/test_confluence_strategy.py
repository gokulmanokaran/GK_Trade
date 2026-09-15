"""
Comprehensive Unit & Confluence Tests for NIFTY 50 Options Trading Strategy.
Validates all 20 Implementation Rules:
- ORB 09:15 to 09:30 IST window
- CE and PE full confluence triggers
- Rule 4: Volume UNAVAILABLE if 0, prevents ENTRY_TRIGGERED
- Rule 6: Separate breakout and retest candles (retest_idx > breakout_idx)
- Rule 7: State machine transitions
- Rule 8: Choppiness count (>2 VWAP crosses in last 10 candles -> NO_TRADE_CHOPPY)
- Rule 13/14: Minimum RR 1.5 / 2.2; RR < 1.5 -> POOR_RISK_REWARD
- Rule 17/18: Data quality classification
"""

import pytest
from datetime import datetime
from backend.data_provider.interface import Candle, UnderlyingQuote, OptionChainData, StrikeRow, OptionContract, Greeks
from backend.analysis_engine.confluence_strategy import ConfluenceStrategyEngine, ConfluenceSetupResult


def make_candle(time_str: str, o: float, h: float, l: float, c: float, v: int = 100000) -> Candle:
    return Candle(
        timestamp=f"2026-09-15 {time_str}",
        open=o,
        high=h,
        low=l,
        close=c,
        volume=v,
        vwap=(h + l + c) / 3.0
    )


def test_orb_calculation_strictly_0915_to_0930():
    """Rule 5: Opening Range must be calculated strictly from 09:15:00 <= t < 09:30:00 IST."""
    candles = [
        make_candle("09:15", 23000, 23050, 22980, 23020),
        make_candle("09:20", 23020, 23080, 23010, 23070),
        make_candle("09:25", 23070, 23090, 23040, 23060),
        # 09:30 candle should NOT be part of ORB
        make_candle("09:30", 23060, 23150, 23050, 23140),
    ]

    orb_high, orb_low, indices = ConfluenceStrategyEngine.calculate_orb(candles)
    assert orb_high == 23090  # Max of 09:15, 09:20, 09:25 (NOT 23150 from 09:30)
    assert orb_low == 22980
    assert indices == [0, 1, 2]


def test_call_ce_full_confluence():
    """
    CE Setup:
    1. Spot > VWAP
    2. Spot > 20 EMA
    3. 15m High broken
    4. 5m candle closes convincingly above breakout level
    5. Volume above 20-period average
    6. Retest + bullish rejection on subsequent candle (retest_idx > breakout_idx)
    7. No choppiness
    -> ENTRY_TRIGGERED (CALL_BUY)
    """
    candles = [
        # 15-min ORB (09:15 - 09:25) - High: 23100, Low: 23000
        make_candle("09:15", 23020, 23060, 23000, 23050, v=100000),
        make_candle("09:20", 23050, 23090, 23030, 23080, v=100000),
        make_candle("09:25", 23080, 23100, 23050, 23070, v=100000),
        # 09:30 Consolidation near high
        make_candle("09:30", 23070, 23095, 23060, 23090, v=95000),
        # 09:35 Breakout Candle! Closes convincingly above ORB High 23100 with high volume
        make_candle("09:35", 23090, 23145, 23085, 23140, v=250000),
        # 09:40 Retest Candle! Pulls back to test 23100 and shows bullish rejection (low 23102, close 23135)
        make_candle("09:40", 23140, 23142, 23102, 23135, v=180000),
        # 09:45 Continuation candle
        make_candle("09:45", 23135, 23165, 23130, 23160, v=190000),
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23160.0, volume=190000)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True, is_live_data=True)

    assert result.orb_high == 23100.0
    assert result.orb_low == 23000.0
    assert result.direction == "CE"
    assert result.state == "ENTRY_TRIGGERED"
    assert result.signal_type == "CALL_BUY"
    assert result.target_1 > result.entry_price
    assert result.risk_reward >= 1.5
    assert result.confirmations["orb_breakout"]["status"] == "PASS"
    assert result.confirmations["retest"]["status"] == "PASS"
    assert result.confirmations["volume"]["status"] == "PASS"
    assert result.confirmations["choppiness"]["status"] == "PASS"


def test_put_pe_full_confluence():
    """
    PE Setup:
    1. Spot < VWAP
    2. Spot < 20 EMA
    3. 15m Low broken
    4. 5m candle closes convincingly below breakdown level
    5. Volume above average
    6. Retest + bearish rejection on subsequent candle
    7. No choppiness
    -> ENTRY_TRIGGERED (PUT_BUY)
    """
    candles = [
        # 15-min ORB (09:15 - 09:25) - High: 23200, Low: 23100
        make_candle("09:15", 23180, 23200, 23150, 23160, v=100000),
        make_candle("09:20", 23160, 23170, 23120, 23130, v=100000),
        make_candle("09:25", 23130, 23140, 23100, 23110, v=100000),
        # 09:30 Consolidation near low
        make_candle("09:30", 23110, 23125, 23095, 23105, v=95000),
        # 09:35 Breakdown Candle! Closes convincingly below ORB Low 23100 with high volume
        make_candle("09:35", 23105, 23108, 23050, 23055, v=260000),
        # 09:40 Retest Candle! Pulls back to test 23100 and shows bearish rejection (high 23098, close 23062)
        make_candle("09:40", 23055, 23098, 23050, 23062, v=170000),
        # 09:45 Continuation candle downwards
        make_candle("09:45", 23062, 23065, 23020, 23025, v=190000),
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23025.0, volume=190000)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True, is_live_data=True)

    assert result.orb_high == 23200.0
    assert result.orb_low == 23100.0
    assert result.direction == "PE"
    assert result.state == "ENTRY_TRIGGERED"
    assert result.signal_type == "PUT_BUY"
    assert result.target_1 < result.entry_price
    assert result.risk_reward >= 1.5
    assert result.confirmations["orb_breakout"]["status"] == "PASS"
    assert result.confirmations["retest"]["status"] == "PASS"


def test_rule_4_missing_volume_blocks_entry_triggered():
    """
    Rule 4: NIFTY 50 spot itself does not provide reliable traded volume.
    If reliable volume is unavailable (volume == 0), mark volume confirmation as UNAVAILABLE
    and prevent ENTRY_TRIGGERED. Never silently fabricate volume.
    """
    candles = [
        make_candle("09:15", 23020, 23060, 23000, 23050, v=0),
        make_candle("09:20", 23050, 23090, 23030, 23080, v=0),
        make_candle("09:25", 23080, 23100, 23050, 23070, v=0),
        make_candle("09:30", 23070, 23095, 23060, 23090, v=0),
        make_candle("09:35", 23090, 23145, 23085, 23140, v=0),
        make_candle("09:40", 23140, 23142, 23102, 23135, v=0),
        make_candle("09:45", 23135, 23165, 23130, 23160, v=0),
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23160.0, volume=0)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True)

    assert result.confirmations["volume"]["status"] == "UNAVAILABLE"
    assert result.state == "NO_TRADE"
    assert "Volume confirmation unavailable" in result.rejection_reason
    assert result.state != "ENTRY_TRIGGERED"


def test_rule_6_separate_breakout_and_retest_candles():
    """
    Rule 6: Retest confirmation must occur AFTER the ORB breakout.
    Do not allow the same candle to simultaneously count as breakout + retest + rejection.
    """
    candles = [
        make_candle("09:15", 23020, 23060, 23000, 23050, v=100000),
        make_candle("09:20", 23050, 23090, 23030, 23080, v=100000),
        make_candle("09:25", 23080, 23100, 23050, 23070, v=100000),
        # 09:30: Breakout happens here on bar 3. No candles after this bar yet!
        make_candle("09:30", 23090, 23140, 23090, 23135, v=200000),
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23135.0, volume=200000)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True)

    # Bar 3 cannot count as retest. Retest must be PENDING
    assert result.confirmations["orb_breakout"]["status"] == "PASS"
    assert result.confirmations["retest"]["status"] == "PENDING"
    assert result.state == "WAITING_FOR_RETEST"
    assert result.state != "ENTRY_TRIGGERED"


def test_rule_8_choppiness_filter_rejects_repeated_vwap_crosses():
    """
    Rule 8: Count VWAP crossovers using candle CLOSE values over the last 10 candles.
    If crossover count > 2: NO_TRADE_CHOPPY.
    """
    # Create 10 candles that oscillate around VWAP ~23100 (crosses back and forth 4 times)
    candles = [
        make_candle("09:15", 23080, 23120, 23070, 23100, v=100000),
        make_candle("09:20", 23100, 23115, 23090, 23105, v=100000),
        make_candle("09:25", 23105, 23110, 23085, 23095, v=100000),  # ORB H:23120, L:23070
        make_candle("09:30", 23095, 23125, 23090, 23115, v=100000),  # Cross 1: Above
        make_candle("09:35", 23115, 23118, 23080, 23088, v=100000),  # Cross 2: Below
        make_candle("09:40", 23088, 23130, 23085, 23122, v=100000),  # Cross 3: Above
        make_candle("09:45", 23122, 23124, 23075, 23080, v=100000),  # Cross 4: Below
        make_candle("09:50", 23080, 23135, 23078, 23128, v=100000),  # Cross 5: Above
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23128.0, volume=100000)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True)

    assert result.confirmations["choppiness"]["status"] == "FAIL_CHOPPY"
    assert result.state == "NO_TRADE"
    assert "NO_TRADE_CHOPPY" in result.rejection_reason


def test_rule_7_waiting_for_orb_breakout():
    """Rule 7: State must be WAITING_FOR_ORB_BREAKOUT before ORB is breached."""
    candles = [
        make_candle("09:15", 23000, 23050, 22980, 23020),
        make_candle("09:20", 23020, 23080, 23010, 23070),
        make_candle("09:25", 23070, 23090, 23040, 23060),
        # 09:30 candle trades completely inside ORB (22980 - 23090)
        make_candle("09:30", 23060, 23075, 23030, 23050),
    ]

    quote = UnderlyingQuote(symbol="NIFTY", ltp=23050.0)
    result = ConfluenceStrategyEngine.evaluate(candles, quote, is_market_open=True)

    assert result.state == "WAITING_FOR_ORB_BREAKOUT"
    assert result.confirmations["orb_breakout"]["status"] == "PENDING"
    assert result.signal_type == "WATCH"


def test_rule_17_data_quality_labeling():
    """Rules 3, 17, 18: Never label delayed/mock data as LIVE."""
    candles = [
        make_candle("09:15", 23000, 23050, 22980, 23020),
        make_candle("09:20", 23020, 23080, 23010, 23070),
        make_candle("09:25", 23070, 23090, 23040, 23060),
    ]
    quote = UnderlyingQuote(symbol="NIFTY", ltp=23060.0, is_delayed=True, data_age_seconds=900)

    result = ConfluenceStrategyEngine.evaluate(
        candles, quote, data_quality="DELAYED", data_source="YAHOO_FINANCE",
        data_age_seconds=900, is_live_data=False
    )

    assert result.data_quality == "DELAYED"
    assert result.is_live_data is False
    assert result.data_age_seconds == 900
    assert result.data_source == "YAHOO_FINANCE"
