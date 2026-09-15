"""
Market Data Provider Interface and Domain Data Transfer Objects (DTOs).
Ensures loose coupling: the signal engine and UI interact solely with this abstraction.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import zoneinfo

IST = zoneinfo.ZoneInfo("Asia/Kolkata")


class UnderlyingQuote(BaseModel):
    symbol: str
    ltp: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    prev_close: Optional[float] = None
    change: Optional[float] = None
    p_change: Optional[float] = None
    volume: Optional[int] = 0
    vwap: Optional[float] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"))
    data_source: str = "COMPOSITE"
    is_delayed: bool = False
    data_age_seconds: int = 0
    data_quality: str = "LIVE"  # LIVE, DELAYED, STALE, INSUFFICIENT
    is_live_data: bool = True


class Greeks(BaseModel):
    delta: Optional[float] = 0.0
    gamma: Optional[float] = 0.0
    theta: Optional[float] = 0.0
    vega: Optional[float] = 0.0


class OptionContract(BaseModel):
    strike_price: float
    option_type: str  # CE or PE
    ltp: float = 0.0
    change: float = 0.0
    p_change: float = 0.0
    volume: int = 0
    oi: int = 0
    change_oi: int = 0
    pchange_oi: float = 0.0
    iv: float = 0.0
    bid: float = 0.0
    ask: float = 0.0
    greeks: Greeks = Field(default_factory=Greeks)
    buildup: str = "NEUTRAL"  # Long Buildup, Short Buildup, Short Covering, Long Unwinding


class StrikeRow(BaseModel):
    strike_price: float
    ce: OptionContract
    pe: OptionContract


class OptionChainData(BaseModel):
    symbol: str
    expiry_date: str
    available_expiries: List[str] = Field(default_factory=list)
    underlying_ltp: float
    pcr: float = 1.0
    max_pain: float = 0.0
    total_ce_oi: int = 0
    total_pe_oi: int = 0
    timestamp: str = Field(default_factory=lambda: datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"))
    data_source: str = "COMPOSITE"
    is_delayed: bool = False
    strikes: List[StrikeRow] = Field(default_factory=list)


class Candle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int = 0
    vwap: Optional[float] = None


class MarketStatus(BaseModel):
    status: str  # "MARKET OPEN", "MARKET CLOSED", "PRE-MARKET", "POST-MARKET"
    is_open: bool
    ist_time: str
    data_age_seconds: int = 0
    is_delayed: bool = False
    message: str = "Market is operating normally"


class MarketDataProvider(ABC):
    """Abstract interface for all Indian market data providers."""

    @abstractmethod
    async def get_index_quote(self, symbol: str) -> UnderlyingQuote:
        """Fetch current quote for index or stock."""
        pass

    @abstractmethod
    async def get_option_chain(self, symbol: str, expiry: Optional[str] = None) -> OptionChainData:
        """Fetch option chain with strikes, CE/PE data, and Greeks."""
        pass

    @abstractmethod
    async def get_historical_data(
        self, symbol: str, timeframe: str = "5m", limit: int = 100
    ) -> List[Candle]:
        """Fetch candlestick bars for technical analysis and charts."""
        pass

    @abstractmethod
    async def get_expiries(self, symbol: str) -> List[str]:
        """Fetch list of valid expiry dates for symbol."""
        pass

    @abstractmethod
    def get_market_status(self) -> MarketStatus:
        """Calculate market state based on Indian Standard Time (09:15 - 15:30 IST)."""
        pass
