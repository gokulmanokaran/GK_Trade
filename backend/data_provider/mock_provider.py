"""
High-Fidelity Mock & Synthetic Replay Market Data Provider.
Used for testing, off-market hours, and fallback when public exchange servers rate-limit.
Generates realistic Indian option chain strikes, Black-Scholes Greeks, OI walls, PCR, and candles.
Explicitly flags data_source as 'MOCK_REPLAY'.
"""

import math
import random
from datetime import datetime, timedelta
from typing import List, Optional
import zoneinfo

from backend.data_provider.interface import (
    MarketDataProvider, UnderlyingQuote, OptionChainData,
    StrikeRow, OptionContract, Greeks, Candle, MarketStatus
)
from backend.analysis_engine.greeks import calculate_greeks, black_scholes_price

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

INSTRUMENT_DEFAULTS = {
    "NIFTY": {"base_ltp": 25425.20, "strike_step": 50.0, "lot_size": 25, "iv": 0.125},
    "BANKNIFTY": {"base_ltp": 54150.80, "strike_step": 100.0, "lot_size": 15, "iv": 0.148},
    "FINNIFTY": {"base_ltp": 24820.40, "strike_step": 50.0, "lot_size": 25, "iv": 0.132},
}


class MockMarketDataProvider(MarketDataProvider):
    def __init__(self):
        self._price_offsets = {k: 0.0 for k in INSTRUMENT_DEFAULTS}

    def _get_current_ist(self) -> datetime:
        return datetime.now(IST)

    def get_market_status(self) -> MarketStatus:
        now_ist = self._get_current_ist()
        # Indian market hours: Mon-Fri 09:15 to 15:30 IST
        weekday = now_ist.weekday()  # 0=Monday, 4=Friday, 5=Sat, 6=Sun
        is_weekday = weekday < 5
        minute_of_day = now_ist.hour * 60 + now_ist.minute

        if not is_weekday:
            status = "MARKET CLOSED"
            is_open = False
            msg = "Market is closed for the weekend"
        elif minute_of_day < 9 * 60:
            status = "MARKET CLOSED"
            is_open = False
            msg = "Market opens at 09:15 IST"
        elif 9 * 60 <= minute_of_day < 9 * 60 + 15:
            status = "PRE-MARKET"
            is_open = False
            msg = "Pre-market session (09:00 - 09:15 IST)"
        elif 9 * 60 + 15 <= minute_of_day <= 15 * 60 + 30:
            status = "MARKET OPEN"
            is_open = True
            msg = "Live market session"
        else:
            status = "MARKET CLOSED"
            is_open = False
            msg = "Market closed at 15:30 IST"

        return MarketStatus(
            status=status,
            is_open=is_open,
            ist_time=now_ist.strftime("%H:%M:%S IST"),
            data_age_seconds=2,
            is_delayed=False,
            message=msg
        )

    def _get_next_thursdays(self, count: int = 4) -> List[str]:
        now = self._get_current_ist()
        days_ahead = 3 - now.weekday()  # Thursday is 3
        if days_ahead < 0 or (days_ahead == 0 and now.hour >= 15 and now.minute >= 30):
            days_ahead += 7
        first_thursday = now + timedelta(days=days_ahead)
        expiries = []
        for i in range(count):
            d = first_thursday + timedelta(weeks=i)
            expiries.append(d.strftime("%d-%b-%Y"))
        return expiries

    async def get_expiries(self, symbol: str) -> List[str]:
        return self._get_next_thursdays(4)

    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        sym = symbol.upper()
        config = INSTRUMENT_DEFAULTS.get(sym, INSTRUMENT_DEFAULTS["NIFTY"])
        base_ltp = config["base_ltp"]

        # Small realistic Brownian walk for tick variation
        self._price_offsets[sym] = round(self._price_offsets.get(sym, 0.0) + random.uniform(-1.5, 1.8), 2)
        ltp = round(base_ltp + self._price_offsets[sym], 2)
        prev_close = round(base_ltp - 120.50, 2)
        change = round(ltp - prev_close, 2)
        p_change = round((change / prev_close) * 100, 2)

        now_ist = self._get_current_ist()

        return UnderlyingQuote(
            symbol=sym,
            ltp=ltp,
            open=round(prev_close + 45.0, 2),
            high=round(max(ltp + 35.0, prev_close + 90.0), 2),
            low=round(min(ltp - 40.0, prev_close - 20.0), 2),
            close=ltp,
            prev_close=prev_close,
            change=change,
            p_change=p_change,
            volume=4820000,
            vwap=round(ltp - 14.5, 2),
            timestamp=now_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            data_source="MOCK_REPLAY",
            is_delayed=False,
            data_age_seconds=2
        )

    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        quote = await self.get_index_quote(symbol)
        sym = symbol.upper()
        config = INSTRUMENT_DEFAULTS.get(sym, INSTRUMENT_DEFAULTS["NIFTY"])
        step = config["strike_step"]
        base_iv = config["iv"]

        expiries = await self.get_expiries(sym)
        active_expiry = expiry if expiry and expiry in expiries else expiries[0]

        # Calculate time to expiry (in years)
        # Default ~4 calendar days for near expiry
        time_to_expiry_years = max(0.005, 4.0 / 365.0)

        atm_strike = round(quote.ltp / step) * step
        num_strikes = 15  # 15 strikes above & 15 below ATM = 31 strikes total

        strikes: List[StrikeRow] = []
        total_ce_oi = 0
        total_pe_oi = 0

        # Calculate strikes
        start_strike = atm_strike - (num_strikes * step)

        for i in range(num_strikes * 2 + 1):
            strike = round(start_strike + (i * step), 2)
            distance = (strike - atm_strike) / step

            # Realistic Volatility Smile
            ce_iv = round(base_iv + (abs(distance) * 0.0015), 4)
            pe_iv = round(base_iv + (abs(distance) * 0.0020), 4)

            # Black-Scholes Greeks
            ce_delta, ce_gamma, ce_theta, ce_vega = calculate_greeks(
                quote.ltp, strike, time_to_expiry_years, ce_iv, option_type="CE"
            )
            pe_delta, pe_gamma, pe_theta, pe_vega = calculate_greeks(
                quote.ltp, strike, time_to_expiry_years, pe_iv, option_type="PE"
            )

            # Theoretical Prices
            ce_price = round(black_scholes_price(quote.ltp, strike, time_to_expiry_years, ce_iv, option_type="CE"), 2)
            pe_price = round(black_scholes_price(quote.ltp, strike, time_to_expiry_years, pe_iv, option_type="PE"), 2)

            # Open Interest model: Normal distribution around ATM with bias
            ce_oi_weight = math.exp(-0.5 * ((distance - 2) / 4.5) ** 2)
            pe_oi_weight = math.exp(-0.5 * ((distance + 2) / 4.5) ** 2)

            ce_oi = int(120000 * ce_oi_weight + random.randint(1500, 6000))
            pe_oi = int(145000 * pe_oi_weight + random.randint(1800, 7000))

            ce_chg_oi = int(ce_oi * random.uniform(0.05, 0.22) * (-1 if distance < 0 else 1))
            pe_chg_oi = int(pe_oi * random.uniform(0.08, 0.28) * (1 if distance < 0 else -1))

            total_ce_oi += ce_oi
            total_pe_oi += pe_oi

            # Buildup classifications
            # CE: price up + OI up = Long Buildup, price down + OI up = Short Buildup
            # CE: price up + OI down = Short Covering, price down + OI down = Long Unwinding
            ce_chg_price = round(random.uniform(-4.5, 6.0), 2)
            pe_chg_price = round(random.uniform(-6.0, 4.5), 2)

            ce_buildup = "Long Buildup" if (ce_chg_price >= 0 and ce_chg_oi >= 0) else (
                "Short Buildup" if (ce_chg_price < 0 and ce_chg_oi >= 0) else (
                    "Short Covering" if (ce_chg_price >= 0 and ce_chg_oi < 0) else "Long Unwinding"
                )
            )

            pe_buildup = "Long Buildup" if (pe_chg_price >= 0 and pe_chg_oi >= 0) else (
                "Short Buildup" if (pe_chg_price < 0 and pe_chg_oi >= 0) else (
                    "Short Covering" if (pe_chg_price >= 0 and pe_chg_oi < 0) else "Long Unwinding"
                )
            )

            ce_contract = OptionContract(
                strike_price=strike,
                option_type="CE",
                ltp=max(0.50, ce_price),
                change=ce_chg_price,
                p_change=round((ce_chg_price / max(1.0, ce_price)) * 100, 2),
                volume=int(ce_oi * 1.6),
                oi=ce_oi,
                change_oi=ce_chg_oi,
                pchange_oi=round((ce_chg_oi / max(1, ce_oi)) * 100, 2),
                iv=round(ce_iv * 100, 2),
                bid=round(max(0.45, ce_price - 0.15), 2),
                ask=round(ce_price + 0.15, 2),
                greeks=Greeks(delta=ce_delta, gamma=ce_gamma, theta=ce_theta, vega=ce_vega),
                buildup=ce_buildup
            )

            pe_contract = OptionContract(
                strike_price=strike,
                option_type="PE",
                ltp=max(0.50, pe_price),
                change=pe_chg_price,
                p_change=round((pe_chg_price / max(1.0, pe_price)) * 100, 2),
                volume=int(pe_oi * 1.5),
                oi=pe_oi,
                change_oi=pe_chg_oi,
                pchange_oi=round((pe_chg_oi / max(1, pe_oi)) * 100, 2),
                iv=round(pe_iv * 100, 2),
                bid=round(max(0.45, pe_price - 0.15), 2),
                ask=round(pe_price + 0.15, 2),
                greeks=Greeks(delta=pe_delta, gamma=pe_gamma, theta=pe_theta, vega=pe_vega),
                buildup=pe_buildup
            )

            strikes.append(StrikeRow(strike_price=strike, ce=ce_contract, pe=pe_contract))

        pcr = round(total_pe_oi / max(1, total_ce_oi), 2)

        # Max Pain calculation
        pain_values = {}
        for s in strikes:
            k = s.strike_price
            pain = sum(
                max(0.0, k - row.strike_price) * row.ce.oi + max(0.0, row.strike_price - k) * row.pe.oi
                for row in strikes
            )
            pain_values[k] = pain

        max_pain = min(pain_values, key=pain_values.get) if pain_values else atm_strike

        return OptionChainData(
            symbol=sym,
            expiry_date=active_expiry,
            available_expiries=expiries,
            underlying_ltp=quote.ltp,
            pcr=pcr,
            max_pain=max_pain,
            total_ce_oi=total_ce_oi,
            total_pe_oi=total_pe_oi,
            timestamp=quote.timestamp,
            data_source="MOCK_REPLAY",
            is_delayed=False,
            strikes=strikes
        )

    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 80
    ) -> List[Candle]:
        quote = await self.get_index_quote(symbol)
        candles: List[Candle] = []
        now = self._get_current_ist()

        # Interval in minutes
        mins = 5
        if timeframe == "1m":
            mins = 1
        elif timeframe == "3m":
            mins = 3
        elif timeframe == "15m":
            mins = 15
        elif timeframe == "30m":
            mins = 30
        elif timeframe == "1H":
            mins = 60
        elif timeframe == "1D":
            mins = 375

        curr_close = quote.ltp - (limit * 2.2)
        total_vol = 0
        total_pv = 0.0

        for i in range(limit):
            dt = now - timedelta(minutes=(limit - i) * mins)
            chg = random.uniform(-18.0, 22.0)
            open_p = curr_close
            close_p = round(open_p + chg, 2)
            high_p = round(max(open_p, close_p) + abs(random.uniform(2.0, 15.0)), 2)
            low_p = round(min(open_p, close_p) - abs(random.uniform(2.0, 15.0)), 2)
            vol = random.randint(15000, 85000)

            typical_price = (high_p + low_p + close_p) / 3.0
            total_vol += vol
            total_pv += typical_price * vol
            vwap_p = round(total_pv / max(1, total_vol), 2)

            curr_close = close_p

            candles.append(
                Candle(
                    timestamp=dt.strftime("%Y-%m-%d %H:%M"),
                    open=open_p,
                    high=high_p,
                    low=low_p,
                    close=close_p,
                    volume=vol,
                    vwap=vwap_p
                )
            )

        # Anchor last candle close to current quote ltp
        candles[-1].close = quote.ltp
        candles[-1].high = max(candles[-1].high, quote.ltp)
        candles[-1].low = min(candles[-1].low, quote.ltp)

        return candles
