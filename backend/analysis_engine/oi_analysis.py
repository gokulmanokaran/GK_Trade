"""
Option Chain Open Interest (OI) & Buildup Analytics Engine.
Identifies PCR bias, Max Pain, major OI concentrations (support/resistance walls),
and interprets Long/Short buildup & covering dynamics.
"""

from typing import Dict, Any, List
from backend.data_provider.interface import OptionChainData, StrikeRow


def analyze_open_interest(chain: OptionChainData) -> Dict[str, Any]:
    """
    Analyzes option chain OI distribution, PCR, buildup activity,
    and returns a structured analytical summary with natural language insights.
    """
    strikes = chain.strikes
    if not strikes:
        return {
            "pcr": 1.0,
            "bias": "NEUTRAL",
            "max_pain": chain.underlying_ltp,
            "highest_call_oi_strike": chain.underlying_ltp,
            "highest_put_oi_strike": chain.underlying_ltp,
            "highest_call_chg_oi_strike": chain.underlying_ltp,
            "highest_put_chg_oi_strike": chain.underlying_ltp,
            "call_buildup_summary": "Neutral activity",
            "put_buildup_summary": "Neutral activity",
            "narrative": "Insufficient option chain data for detailed OI analysis."
        }

    # 1. Identify key strikes
    highest_call_oi_row = max(strikes, key=lambda s: s.ce.oi)
    highest_put_oi_row = max(strikes, key=lambda s: s.pe.oi)

    highest_call_chg_row = max(strikes, key=lambda s: s.ce.change_oi)
    highest_put_chg_row = max(strikes, key=lambda s: s.pe.change_oi)

    # 2. PCR Analysis
    pcr = chain.pcr
    if pcr >= 1.25:
        pcr_bias = "BULLISH"
        pcr_note = "Elevated PCR indicates strong Put writing, reflecting potential underlying support."
    elif pcr <= 0.75:
        pcr_bias = "BEARISH"
        pcr_note = "Depressed PCR signals aggressive Call writing, suggesting potential resistance."
    else:
        pcr_bias = "NEUTRAL"
        pcr_note = "Balanced PCR indicates balanced market positioning between Call and Put writers."

    # 3. Buildup summaries
    ce_buildups = [s.ce.buildup for s in strikes if s.ce.oi > 1000]
    pe_buildups = [s.pe.buildup for s in strikes if s.pe.oi > 1000]

    top_ce_buildup = max(set(ce_buildups), key=ce_buildups.count) if ce_buildups else "Neutral"
    top_pe_buildup = max(set(pe_buildups), key=pe_buildups.count) if pe_buildups else "Neutral"

    # 4. Generate probabilistic insights
    narrative_points = []
    narrative_points.append(
        f"PCR stands at {pcr:.2f} ({pcr_bias} bias). {pcr_note}"
    )
    narrative_points.append(
        f"Highest Put OI concentration at {highest_put_oi_row.strike_price:,.0f} ({highest_put_oi_row.pe.oi:,} contracts) indicates potential major support."
    )
    narrative_points.append(
        f"Highest Call OI concentration at {highest_call_oi_row.strike_price:,.0f} ({highest_call_oi_row.ce.oi:,} contracts) indicates possible major resistance."
    )
    if highest_put_chg_row.pe.change_oi > 0:
        narrative_points.append(
            f"Active Put writing observed near {highest_put_chg_row.strike_price:,.0f} (+{highest_put_chg_row.pe.change_oi:,} change in OI), suggesting intraday floor accumulation."
        )
    if highest_call_chg_row.ce.change_oi > 0:
        narrative_points.append(
            f"Call writing activity concentrated around {highest_call_chg_row.strike_price:,.0f} (+{highest_call_chg_row.ce.change_oi:,} change in OI), reinforcing an overhead ceiling."
        )

    return {
        "pcr": pcr,
        "bias": pcr_bias,
        "max_pain": chain.max_pain,
        "total_ce_oi": chain.total_ce_oi,
        "total_pe_oi": chain.total_pe_oi,
        "highest_call_oi_strike": highest_call_oi_row.strike_price,
        "highest_call_oi_volume": highest_call_oi_row.ce.oi,
        "highest_put_oi_strike": highest_put_oi_row.strike_price,
        "highest_put_oi_volume": highest_put_oi_row.pe.oi,
        "highest_call_chg_oi_strike": highest_call_chg_row.strike_price,
        "highest_put_chg_oi_strike": highest_put_chg_row.strike_price,
        "dominant_ce_buildup": top_ce_buildup,
        "dominant_pe_buildup": top_pe_buildup,
        "narrative": " ".join(narrative_points),
        "bullet_insights": narrative_points
    }
