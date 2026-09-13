import pytest
import asyncio
from backend.data_provider import CompositeMarketDataProvider
from backend.analysis_engine import (
    calculate_indicators, analyze_open_interest,
    calculate_support_resistance, calculate_signal_score,
    structure_option_trade, generate_trade_explanation,
    run_backtest_simulation
)

@pytest.mark.asyncio
async def test_end_to_end_analysis_pipeline():
    provider = CompositeMarketDataProvider()
    quote = await provider.get_index_quote("NIFTY")
    assert quote.ltp > 0
    assert quote.symbol == "NIFTY"

    chain = await provider.get_option_chain("NIFTY")
    assert len(chain.strikes) > 0
    assert chain.pcr > 0

    candles = await provider.get_historical_data("NIFTY", "5m", 60)
    assert len(candles) >= 30

    # Technicals
    inds = calculate_indicators(candles)
    assert inds["rsi_14"] is not None
    assert inds["supertrend_direction"] in ["BULLISH", "BEARISH", "NEUTRAL"]

    # OI Analysis
    oi = analyze_open_interest(chain)
    assert "pcr" in oi
    assert oi["highest_call_oi_strike"] > 0
    assert oi["highest_put_oi_strike"] > 0

    # Support & Resistance
    sr = calculate_support_resistance(quote, chain, candles)
    assert sr["major_support"] < sr["major_resistance"]

    # Quantitative Scoring
    score = calculate_signal_score(quote, inds, oi, sr)
    assert 0 <= score.total_score <= 100
    assert score.classification in ["NO TRADE", "WEAK", "MODERATE", "STRONG", "VERY STRONG"]

    # Trade Structuring
    trade = structure_option_trade(quote, chain, score, sr, inds)
    assert trade.signal in ["CALL BUY", "PUT BUY", "NO TRADE"]
    if trade.signal != "NO TRADE":
        assert trade.entry_high >= trade.entry_low
        assert trade.stop_loss < trade.entry_low if "CALL" in trade.signal else True
        assert trade.target_1 > trade.current_option_ltp

    # AI Explanation
    expl = generate_trade_explanation(trade, score, sr, oi, inds)
    assert "summary" in expl
    assert len(expl["summary"]) > 20

    # Backtest Simulation
    bt = run_backtest_simulation("NIFTY", candles)
    assert bt.total_trades >= 0
    assert 0.0 <= bt.win_rate <= 100.0
