"""
Yahoo Finance Market Data Provider.
Fetches live/near-live index quotes and real historical candlestick series for ^NSEI and ^NSEBANK.
"""

import asyncio
from datetime import datetime
from typing import List, Optional
import zoneinfo
import yfinance as yf

from backend.data_provider.interface import (
    MarketDataProvider, UnderlyingQuote, OptionChainData, Candle, MarketStatus
)

IST = zoneinfo.ZoneInfo("Asia/Kolkata")

TICKER_MAP = {
    "NIFTY": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "FINNIFTY": "NIFTY_FIN_SERVICE.NS"
}


class YahooFinanceProvider(MarketDataProvider):
    def __init__(self):
        pass

    def get_market_status(self) -> MarketStatus:
        now_ist = datetime.now(IST)
        weekday = now_ist.weekday()
        minute_of_day = now_ist.hour * 60 + now_ist.minute

        if weekday >= 5:
            return MarketStatus(status="MARKET CLOSED", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Market Closed (Weekend)")
        if 9 * 60 + 15 <= minute_of_day <= 15 * 60 + 30:
            return MarketStatus(status="MARKET OPEN", is_open=True, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Live Market Session")
        elif 9 * 60 <= minute_of_day < 9 * 60 + 15:
            return MarketStatus(status="PRE-MARKET", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Pre-market Session")
        else:
            return MarketStatus(status="MARKET CLOSED", is_open=False, ist_time=now_ist.strftime("%H:%M:%S IST"), message="Market Closed")

    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        ticker_symbol = TICKER_MAP.get(symbol.upper(), "^NSEI")

        def _fetch():
            t = yf.Ticker(ticker_symbol)
            fast_info = getattr(t, "fast_info", None)
            if fast_info and getattr(fast_info, "last_price", None):
                ltp = float(fast_info.last_price)
                prev_close = float(getattr(fast_info, "previous_close", ltp))
                open_p = float(getattr(fast_info, "open", ltp))
                high_p = float(getattr(fast_info, "day_high", ltp))
                low_p = float(getattr(fast_info, "day_low", ltp))
            else:
                hist = t.history(period="2d", interval="1d")
                if hist.empty:
                    raise ValueError(f"No data returned from Yahoo Finance for {ticker_symbol}")
                last_row = hist.iloc[-1]
                prev_row = hist.iloc[-2] if len(hist) > 1 else last_row
                ltp = float(last_row["Close"])
                prev_close = float(prev_row["Close"])
                open_p = float(last_row["Open"])
                high_p = float(last_row["High"])
                low_p = float(last_row["Low"])

            change = round(ltp - prev_close, 2)
            p_change = round((change / prev_close) * 100, 2) if prev_close else 0.0

            return UnderlyingQuote(
                symbol=symbol.upper(),
                ltp=round(ltp, 2),
                open=round(open_p, 2),
                high=round(high_p, 2),
                low=round(low_p, 2),
                close=round(ltp, 2),
                prev_close=round(prev_close, 2),
                change=change,
                p_change=p_change,
                volume=0,
                vwap=round((high_p + low_p + ltp) / 3.0, 2),
                timestamp=datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
                data_source="YAHOO_FINANCE",
                is_delayed=True,
                data_age_seconds=15
            )

        return await asyncio.to_thread(_fetch)

    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 80
    ) -> List[Candle]:
        ticker_symbol = TICKER_MAP.get(symbol.upper(), "^NSEI")

        # Map timeframe to yfinance intervals
        yf_interval = "5m"
        yf_period = "5d"
        if timeframe in ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d"]:
            yf_interval = "1h" if timeframe == "1H" else timeframe
            if timeframe == "1m":
                yf_period = "1d"
            elif timeframe in ["3m", "5m", "15m"]:
                yf_period = "5d"
            elif timeframe in ["30m", "1H"]:
                yf_period = "1mo"
            elif timeframe == "1D":
                yf_period = "6mo"

        def _fetch():
            t = yf.Ticker(ticker_symbol)
            df = t.history(period=yf_period, interval=yf_interval)
            if df.empty:
                return []

            candles = []
            cum_vol = 0
            cum_pv = 0.0

            tail_df = df.tail(limit)
            for idx, row in tail_df.iterrows():
                o = float(row["Open"])
                h = float(row["High"])
                l = float(row["Low"])
                c = float(row["Close"])
                v = int(row.get("Volume", 0))

                typical = (h + l + c) / 3.0
                cum_vol += max(1, v)
                cum_pv += typical * max(1, v)
                vwap = round(cum_pv / cum_vol, 2)

                ts_str = idx.astimezone(IST).strftime("%Y-%m-%d %H:%M") if hasattr(idx, "astimezone") else str(idx)[:16]
                candles.append(
                    Candle(
                        timestamp=ts_str,
                        open=round(o, 2),
                        high=round(h, 2),
                        low=round(l, 2),
                        close=round(c, 2),
                        volume=v,
                        vwap=vwap
                    )
                )
            return candles

        return await asyncio.to_thread(_fetch)

    async def get_expiries(self, symbol: str) -> List[str]:
        # Yahoo Finance does not expose Indian NSE option chain expiries directly
        return []

    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        raise NotImplementedError("Yahoo Finance does not provide Indian NSE option chains. Use NseIndiaProvider or CompositeMarketDataProvider.")
