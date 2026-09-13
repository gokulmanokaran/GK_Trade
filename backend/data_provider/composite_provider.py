"""
Composite & Resilient Market Data Provider.
Seamlessly routes requests between NSE India Live, Yahoo Finance, and Mock/Replay fallback.
Provides comprehensive health monitoring, error logging, and staleness detection.
"""

import time
import logging
from datetime import datetime
from typing import List, Optional
import zoneinfo

from backend.data_provider.interface import (
    MarketDataProvider, UnderlyingQuote, OptionChainData, Candle, MarketStatus
)
from backend.data_provider.nse_provider import NseIndiaProvider
from backend.data_provider.yahoo_provider import YahooFinanceProvider
from backend.data_provider.mock_provider import MockMarketDataProvider

logger = logging.getLogger("optionpulse.dataprovider")
IST = zoneinfo.ZoneInfo("Asia/Kolkata")


class CompositeMarketDataProvider(MarketDataProvider):
    def __init__(self):
        self.nse_provider = NseIndiaProvider()
        self.yahoo_provider = YahooFinanceProvider()
        self.mock_provider = MockMarketDataProvider()

        self.last_provider_used = "INITIALIZING"
        self.last_success_time = None
        self.last_error_time = None
        self.last_error_message = None
        self.request_count = 0
        self.error_count = 0

    def get_market_status(self) -> MarketStatus:
        status = self.mock_provider.get_market_status()
        if self.last_error_message and self.last_provider_used == "MOCK_REPLAY":
            status.message = f"{status.message} (Using Replay Data: {self.last_error_message[:40]}...)"
            status.is_delayed = True
        return status

    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        self.request_count += 1
        t0 = time.time()

        # Try Yahoo Finance first for underlying index quotes
        try:
            quote = await self.yahoo_provider.get_index_quote(symbol)
            self.last_provider_used = "YAHOO_FINANCE"
            self.last_success_time = datetime.now(IST)
            return quote
        except Exception as e:
            logger.debug(f"YahooFinance quote failed for {symbol}: {e}. Trying NSE / Mock...")

        # Fallback to Mock / Synthetic Replay
        try:
            quote = await self.mock_provider.get_index_quote(symbol)
            self.last_provider_used = "MOCK_REPLAY"
            return quote
        except Exception as e:
            self.error_count += 1
            self.last_error_time = datetime.now(IST)
            self.last_error_message = str(e)
            raise

    async def get_expiries(self, symbol: str) -> List[str]:
        # Try NSE first
        try:
            expiries = await self.nse_provider.get_expiries(symbol)
            if expiries:
                return expiries
        except Exception as e:
            logger.debug(f"NSE expiries failed for {symbol}: {e}. Using mock expiries.")

        return await self.mock_provider.get_expiries(symbol)

    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        self.request_count += 1
        t0 = time.time()

        # Attempt Live NSE India fetch
        try:
            chain = await self.nse_provider.get_option_chain(symbol, expiry)
            self.last_provider_used = "NSE_INDIA_LIVE"
            self.last_success_time = datetime.now(IST)
            chain.data_source = "NSE_INDIA_LIVE"
            return chain
        except Exception as e:
            self.error_count += 1
            self.last_error_time = datetime.now(IST)
            self.last_error_message = f"NSE Live unavailable: {type(e).__name__}"
            logger.info(f"NSE Live option chain fallback triggered: {e}")

        # Graceful fallback to Mock / Synthetic Replay with clear labeling
        chain = await self.mock_provider.get_option_chain(symbol, expiry)
        self.last_provider_used = "MOCK_REPLAY"
        chain.data_source = "MOCK_REPLAY"
        chain.is_delayed = True
        return chain

    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 80
    ) -> List[Candle]:
        # Attempt Yahoo Finance historical candles
        try:
            candles = await self.yahoo_provider.get_historical_data(symbol, timeframe, limit)
            if candles and len(candles) > 0:
                return candles
        except Exception as e:
            logger.debug(f"YahooFinance candles failed for {symbol}: {e}. Falling back to mock candles.")

        return await self.mock_provider.get_historical_data(symbol, timeframe, limit)
