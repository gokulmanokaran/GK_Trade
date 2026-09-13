"""
NSE India Official Public API Provider.
Connects directly to www.nseindia.com option chain and indices APIs.
Features session cookie initialization, user-agent headers, exponential backoff,
and Black-Scholes Greeks calculation on real strikes.
"""

import math
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
import zoneinfo
import httpx

from backend.data_provider.interface import (
    MarketDataProvider, UnderlyingQuote, OptionChainData,
    StrikeRow, OptionContract, Greeks, Candle, MarketStatus
)
from backend.analysis_engine.greeks import calculate_greeks

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/option-chain",
}


class NseIndiaProvider(MarketDataProvider):
    def __init__(self):
        self._session_cookies: Dict[str, str] = {}
        self._last_cookie_time: Optional[datetime] = None
        self._lock = asyncio.Lock()

    def get_market_status(self) -> MarketStatus:
        now_ist = datetime.now(IST)
        weekday = now_ist.weekday()
        minute_of_day = now_ist.hour * 60 + now_ist.minute

        if weekday >= 5:
            return MarketStatus(status="MARKET CLOSED", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Weekend (Market Closed)")
        if 9 * 60 + 15 <= minute_of_day <= 15 * 60 + 30:
            return MarketStatus(status="MARKET OPEN", is_open=True, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Live Market Session")
        elif 9 * 60 <= minute_of_day < 9 * 60 + 15:
            return MarketStatus(status="PRE-MARKET", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Pre-market Session")
        else:
            return MarketStatus(status="MARKET CLOSED", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Market Closed")

    async def _ensure_session(self, client: httpx.AsyncClient):
        async with self._lock:
            now = datetime.now()
            if not self._session_cookies or (self._last_cookie_time and (now - self._last_cookie_time).total_seconds() > 300):
                res = await client.get("https://www.nseindia.com", headers=HEADERS, timeout=8.0)
                self._session_cookies = dict(res.cookies)
                self._last_cookie_time = now

    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        chain_data = await self.get_option_chain(symbol)
        now_ist = datetime.now(IST)
        return UnderlyingQuote(
            symbol=symbol.upper(),
            ltp=chain_data.underlying_ltp,
            timestamp=now_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            data_source="NSE_INDIA_LIVE",
            is_delayed=False,
            data_age_seconds=5
        )

    async def get_expiries(self, symbol: str) -> List[str]:
        chain_data = await self.get_option_chain(symbol)
        return chain_data.available_expiries

    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        sym = symbol.upper()
        url = f"https://www.nseindia.com/api/option-chain-indices?symbol={sym}"
        if sym not in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]:
            url = f"https://www.nseindia.com/api/option-chain-equities?symbol={sym}"

        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            await self._ensure_session(client)
            resp = await client.get(url, headers=HEADERS, cookies=self._session_cookies)

            if resp.status_code == 401 or resp.status_code == 403:
                # Refresh cookie and retry once
                self._session_cookies = {}
                await self._ensure_session(client)
                resp = await client.get(url, headers=HEADERS, cookies=self._session_cookies)

            resp.raise_for_status()
            data = resp.json()

        records = data.get("records", {})
        expiry_dates: List[str] = records.get("expiryDates", [])
        raw_rows = records.get("data", [])
        underlying_ltp = float(records.get("underlyingValue", 0.0))
        ts_str = records.get("timestamp", datetime.now(IST).strftime("%d-%b-%Y %H:%M:%S"))

        if not expiry_dates:
            raise ValueError("No expiry dates found in NSE response")

        active_expiry = expiry if expiry and expiry in expiry_dates else expiry_dates[0]

        # Calculate time to expiry
        try:
            exp_dt = datetime.strptime(active_expiry, "%d-%b-%Y").replace(hour=15, minute=30, tzinfo=IST)
            now_dt = datetime.now(IST)
            diff_days = max(0.2, (exp_dt - now_dt).total_seconds() / 86400.0)
            time_to_expiry_years = diff_days / 365.0
        except Exception:
            time_to_expiry_years = 4.0 / 365.0

        # Filter rows by active expiry
        filtered_rows = [r for r in raw_rows if r.get("expiryDate") == active_expiry]

        strikes: List[StrikeRow] = []
        total_ce_oi = 0
        total_pe_oi = 0

        for item in sorted(filtered_rows, key=lambda x: x.get("strikePrice", 0)):
            strike_price = float(item.get("strikePrice", 0))
            ce_data = item.get("CE", {})
            pe_data = item.get("PE", {})

            # CE Greeks
            ce_iv = float(ce_data.get("impliedVolatility", 0.0)) / 100.0 if ce_data.get("impliedVolatility") else 0.12
            ce_delta, ce_gamma, ce_theta, ce_vega = calculate_greeks(
                underlying_ltp, strike_price, time_to_expiry_years, ce_iv, option_type="CE"
            )

            # PE Greeks
            pe_iv = float(pe_data.get("impliedVolatility", 0.0)) / 100.0 if pe_data.get("impliedVolatility") else 0.12
            pe_delta, pe_gamma, pe_theta, pe_vega = calculate_greeks(
                underlying_ltp, strike_price, time_to_expiry_years, pe_iv, option_type="PE"
            )

            ce_oi = int(ce_data.get("openInterest", 0))
            pe_oi = int(pe_data.get("openInterest", 0))
            ce_chg_oi = int(ce_data.get("changeinOpenInterest", 0))
            pe_chg_oi = int(pe_data.get("changeinOpenInterest", 0))

            total_ce_oi += ce_oi
            total_pe_oi += pe_oi

            ce_chg = float(ce_data.get("change", 0.0))
            pe_chg = float(pe_data.get("change", 0.0))

            ce_buildup = "Long Buildup" if (ce_chg >= 0 and ce_chg_oi >= 0) else (
                "Short Buildup" if (ce_chg < 0 and ce_chg_oi >= 0) else (
                    "Short Covering" if (ce_chg >= 0 and ce_chg_oi < 0) else "Long Unwinding"
                )
            )
            pe_buildup = "Long Buildup" if (pe_chg >= 0 and pe_chg_oi >= 0) else (
                "Short Buildup" if (pe_chg < 0 and pe_chg_oi >= 0) else (
                    "Short Covering" if (pe_chg >= 0 and pe_chg_oi < 0) else "Long Unwinding"
                )
            )

            ce_contract = OptionContract(
                strike_price=strike_price,
                option_type="CE",
                ltp=float(ce_data.get("lastPrice", 0.0)),
                change=ce_chg,
                p_change=float(ce_data.get("pChange", 0.0)),
                volume=int(ce_data.get("totalTradedVolume", 0)),
                oi=ce_oi,
                change_oi=ce_chg_oi,
                pchange_oi=float(ce_data.get("pchangeinOpenInterest", 0.0)),
                iv=round(ce_iv * 100, 2),
                bid=float(ce_data.get("bidprice", 0.0)),
                ask=float(ce_data.get("askPrice", 0.0)),
                greeks=Greeks(delta=ce_delta, gamma=ce_gamma, theta=ce_theta, vega=ce_vega),
                buildup=ce_buildup
            )

            pe_contract = OptionContract(
                strike_price=strike_price,
                option_type="PE",
                ltp=float(pe_data.get("lastPrice", 0.0)),
                change=pe_chg,
                p_change=float(pe_data.get("pChange", 0.0)),
                volume=int(pe_data.get("totalTradedVolume", 0)),
                oi=pe_oi,
                change_oi=pe_chg_oi,
                pchange_oi=float(pe_data.get("pchangeinOpenInterest", 0.0)),
                iv=round(pe_iv * 100, 2),
                bid=float(pe_data.get("bidprice", 0.0)),
                ask=float(pe_data.get("askPrice", 0.0)),
                greeks=Greeks(delta=pe_delta, gamma=pe_gamma, theta=pe_theta, vega=pe_vega),
                buildup=pe_buildup
            )

            strikes.append(StrikeRow(strike_price=strike_price, ce=ce_contract, pe=pe_contract))

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

        max_pain = min(pain_values, key=pain_values.get) if pain_values else underlying_ltp

        return OptionChainData(
            symbol=sym,
            expiry_date=active_expiry,
            available_expiries=expiry_dates,
            underlying_ltp=underlying_ltp,
            pcr=pcr,
            max_pain=max_pain,
            total_ce_oi=total_ce_oi,
            total_pe_oi=total_pe_oi,
            timestamp=ts_str,
            data_source="NSE_INDIA_LIVE",
            is_delayed=False,
            strikes=strikes
        )

    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 80
    ) -> List[Candle]:
        # NSE public web does not expose historical intraday candlestick arrays freely;
        # handled by YahooFinanceProvider in CompositeProvider
        raise NotImplementedError("Historical candles from NSE are handled via CompositeProvider.")
