"""
Upstox v2 Market Data Provider.
Integrates with Upstox API v2 for real-time market data:
- Quotes (LTP, OHLC, VWAP, Change)
- Intraday & Historical 5-minute Candles
- Option Chain (Strikes, CE/PE LTP, OI, IV, Greeks)
- Available Expiries

Security: Reads UPSTOX_ANALYTICS_TOKEN exclusively from backend environment.
"""

import os
import math
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import zoneinfo
import httpx

from backend.data_provider.interface import (
    MarketDataProvider, UnderlyingQuote, OptionChainData,
    StrikeRow, OptionContract, Greeks, Candle, MarketStatus
)
from backend.analysis_engine.greeks import calculate_greeks

logger = logging.getLogger("optionpulse.data_provider.upstox")
IST = zoneinfo.ZoneInfo("Asia/Kolkata")

UPSTOX_BASE_URL = "https://api.upstox.com/v2"

INSTRUMENT_KEYS = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "NIFTY 50": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "NIFTY BANK": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
}


class UpstoxProvider(MarketDataProvider):
    """Upstox API v2 live market data provider."""

    def __init__(self, token: Optional[str] = None):
        self._token = token or os.getenv("UPSTOX_ANALYTICS_TOKEN", "").strip()
        self._timeout = 10.0

    @property
    def is_configured(self) -> bool:
        return bool(self._token)

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._token}",
            "User-Agent": "OptionPulse/2.0"
        }

    def _get_instrument_key(self, symbol: str) -> str:
        sym = symbol.upper().strip()
        return INSTRUMENT_KEYS.get(sym, f"NSE_INDEX|{sym}")

    def get_market_status(self) -> MarketStatus:
        now_ist = datetime.now(IST)
        weekday = now_ist.weekday()
        minute_of_day = now_ist.hour * 60 + now_ist.minute

        if weekday >= 5:
            return MarketStatus(
                status="MARKET CLOSED",
                is_open=False,
                ist_time=now_ist.strftime("%H:%M:%S IST"),
                message="Weekend (Market Closed)"
            )
        if 9 * 60 + 15 <= minute_of_day <= 15 * 60 + 30:
            return MarketStatus(
                status="MARKET OPEN",
                is_open=True,
                ist_time=now_ist.strftime("%H:%M:%S IST"),
                message="Live Market Session"
            )
        elif 9 * 60 <= minute_of_day < 9 * 60 + 15:
            return MarketStatus(
                status="PRE-MARKET",
                is_open=False,
                ist_time=now_ist.strftime("%H:%M:%S IST"),
                message="Pre-market Session"
            )
        else:
            return MarketStatus(
                status="MARKET CLOSED",
                is_open=False,
                ist_time=now_ist.strftime("%H:%M:%S IST"),
                message="Market Closed"
            )

    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        """Fetches live quote for an underlying index via Upstox."""
        if not self.is_configured:
            raise ValueError("UPSTOX_ANALYTICS_TOKEN is not configured in backend environment.")

        inst_key = self._get_instrument_key(symbol)
        url = f"{UPSTOX_BASE_URL}/market-quote/quotes?instrument_key={inst_key}"

        now_ist = datetime.now(IST)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code == 401:
                logger.error("Upstox token expired or invalid (HTTP 401)")
                raise PermissionError("Upstox Analytics Token is invalid or expired.")
            resp.raise_for_status()
            data = resp.json()

        quote_data = data.get("data", {})
        q = None
        for k, v in quote_data.items():
            if symbol.upper() in k.upper() or "NIFTY" in k.upper():
                q = v
                break
        if not q and quote_data:
            q = list(quote_data.values())[0]

        if not q:
            raise ValueError(f"No quote data returned by Upstox for {symbol}")

        ltp = float(q.get("last_price") or q.get("ltp") or 0.0)
        ohlc = q.get("ohlc", {})
        open_p = float(ohlc.get("open") or ltp)
        high_p = float(ohlc.get("high") or ltp)
        low_p = float(ohlc.get("low") or ltp)
        prev_close = float(ohlc.get("close") or ltp)
        change = float(q.get("net_change") or (ltp - prev_close))
        p_change = float(q.get("percentage_change") or ((change / prev_close * 100) if prev_close else 0.0))
        volume = int(q.get("volume") or 0)
        vwap = float(q.get("average_price") or 0.0) if q.get("average_price") else None

        ts_raw = q.get("timestamp") or q.get("last_trade_time")
        if ts_raw:
            try:
                if isinstance(ts_raw, (int, float)):
                    ts_dt = datetime.fromtimestamp(ts_raw / 1000.0, tz=timezone.utc).astimezone(IST)
                    ts_str = ts_dt.strftime("%Y-%m-%d %H:%M:%S IST")
                else:
                    ts_str = str(ts_raw)
            except Exception:
                ts_str = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        else:
            ts_str = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")

        return UnderlyingQuote(
            symbol=symbol.upper(),
            ltp=ltp,
            open=open_p,
            high=high_p,
            low=low_p,
            close=ltp,
            prev_close=prev_close,
            change=round(change, 2),
            p_change=round(p_change, 2),
            volume=volume,
            vwap=round(vwap, 2) if vwap else None,
            timestamp=ts_str,
            data_source="UPSTOX_REALTIME",
            is_delayed=False,
            data_age_seconds=0,
            data_quality="LIVE",
            is_live_data=True
        )

    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 80
    ) -> List[Candle]:
        """Fetches 5-minute intraday candles from Upstox."""
        if not self.is_configured:
            raise ValueError("UPSTOX_ANALYTICS_TOKEN is not configured in backend environment.")

        inst_key = self._get_instrument_key(symbol)
        interval = "5minute" if timeframe in ("5m", "5minute") else "1minute"
        url = f"{UPSTOX_BASE_URL}/historical-candle/intraday/{inst_key}/{interval}"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code == 401:
                raise PermissionError("Upstox Analytics Token is invalid or expired.")
            resp.raise_for_status()
            data = resp.json()

        candles_raw = data.get("data", {}).get("candles", [])
        parsed_candles: List[Candle] = []
        for c in reversed(candles_raw[:limit]):
            ts_str = c[0]
            parsed_candles.append(Candle(
                timestamp=ts_str,
                open=float(c[1]),
                high=float(c[2]),
                low=float(c[3]),
                close=float(c[4]),
                volume=int(c[5]) if len(c) > 5 else 0
            ))

        return parsed_candles

    async def get_expiries(self, symbol: str) -> List[str]:
        """Fetches active expiry dates for symbol from Upstox."""
        if not self.is_configured:
            return []

        inst_key = self._get_instrument_key(symbol)
        url = f"{UPSTOX_BASE_URL}/option/contract?instrument_key={inst_key}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, headers=self.headers)
                if resp.status_code == 200:
                    data = resp.json()
                    contracts = data.get("data", [])
                    expiries = sorted(list(set(c.get("expiry") for c in contracts if c.get("expiry"))))
                    return expiries
        except Exception as e:
            logger.warning(f"Failed to fetch expiries from Upstox: {e}")

        return []

    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        """Fetches full option chain with real Greeks & OI from Upstox."""
        if not self.is_configured:
            raise ValueError("UPSTOX_ANALYTICS_TOKEN is not configured in backend environment.")

        inst_key = self._get_instrument_key(symbol)
        expiries = await self.get_expiries(symbol)
        selected_expiry = expiry or (expiries[0] if expiries else None)

        url = f"{UPSTOX_BASE_URL}/option/chain?instrument_key={inst_key}"
        if selected_expiry:
            url += f"&expiry_date={selected_expiry}"

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code == 401:
                raise PermissionError("Upstox Analytics Token is invalid or expired.")
            resp.raise_for_status()
            data = resp.json()

        chain_list = data.get("data", [])
        if not chain_list:
            raise ValueError(f"Empty option chain received from Upstox for {symbol}")

        spot_quote = await self.get_index_quote(symbol)
        spot_price = spot_quote.ltp

        strikes_map: Dict[float, Dict[str, Any]] = {}
        total_ce_oi = 0
        total_pe_oi = 0

        for item in chain_list:
            strike = float(item.get("strike_price", 0.0))
            if strike <= 0:
                continue

            call_data = item.get("call_options", {})
            put_data = item.get("put_options", {})

            # Parse Call
            ce_market = call_data.get("market_data", {})
            ce_greeks = call_data.get("option_greeks", {})
            ce_oi = int(ce_market.get("oi") or 0)
            ce_ltp = float(ce_market.get("ltp") or 0.0)
            total_ce_oi += ce_oi

            ce_contract = OptionContract(
                strike_price=strike,
                option_type="CE",
                ltp=ce_ltp,
                change=float(ce_market.get("net_change") or 0.0),
                p_change=float(ce_market.get("percentage_change") or 0.0),
                volume=int(ce_market.get("volume") or 0),
                oi=ce_oi,
                change_oi=int(ce_market.get("change_in_oi") or 0),
                iv=float(ce_greeks.get("iv") or 0.0),
                greeks=Greeks(
                    delta=float(ce_greeks.get("delta") or 0.0),
                    gamma=float(ce_greeks.get("gamma") or 0.0),
                    theta=float(ce_greeks.get("theta") or 0.0),
                    vega=float(ce_greeks.get("vega") or 0.0)
                )
            )

            # Parse Put
            pe_market = put_data.get("market_data", {})
            pe_greeks = put_data.get("option_greeks", {})
            pe_oi = int(pe_market.get("oi") or 0)
            pe_ltp = float(pe_market.get("ltp") or 0.0)
            total_pe_oi += pe_oi

            pe_contract = OptionContract(
                strike_price=strike,
                option_type="PE",
                ltp=pe_ltp,
                change=float(pe_market.get("net_change") or 0.0),
                p_change=float(pe_market.get("percentage_change") or 0.0),
                volume=int(pe_market.get("volume") or 0),
                oi=pe_oi,
                change_oi=int(pe_market.get("change_in_oi") or 0),
                iv=float(pe_greeks.get("iv") or 0.0),
                greeks=Greeks(
                    delta=float(pe_greeks.get("delta") or 0.0),
                    gamma=float(pe_greeks.get("gamma") or 0.0),
                    theta=float(pe_greeks.get("theta") or 0.0),
                    vega=float(pe_greeks.get("vega") or 0.0)
                )
            )

            strikes_map[strike] = StrikeRow(strike_price=strike, ce=ce_contract, pe=pe_contract)

        sorted_strikes = [strikes_map[k] for k in sorted(strikes_map.keys())]
        pcr = round(total_pe_oi / max(1, total_ce_oi), 2)

        return OptionChainData(
            symbol=symbol.upper(),
            expiry_date=selected_expiry or datetime.now(IST).strftime("%Y-%m-%d"),
            available_expiries=expiries,
            underlying_ltp=spot_price,
            pcr=pcr,
            max_pain=0.0,
            total_ce_oi=total_ce_oi,
            total_pe_oi=total_pe_oi,
            timestamp=datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
            data_source="UPSTOX_REALTIME",
            is_delayed=False,
            strikes=sorted_strikes
        )
