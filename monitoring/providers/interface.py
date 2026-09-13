"""
Market Data Provider Abstraction & Data Models for OptionPulse.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import AsyncGenerator, Optional
from pydantic import BaseModel, Field


class NormalizedQuote(BaseModel):
    symbol: str = "NIFTY"
    ltp: float
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    prev_close: float = 0.0
    change: float = 0.0
    change_pct: float = 0.0
    volume: int = 0
    vwap: float = 0.0
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)
    exchange_timestamp: Optional[datetime] = None
    data_age_seconds: float = 0.0
    provider: str
    status: str = "LIVE"  # LIVE, DELAYED, STALE, UNAVAILABLE


class OptionChainSnapshot(BaseModel):
    symbol: str = "NIFTY"
    expiry: str
    atm_strike: int
    underlying_ltp: float
    pcr: float = 1.0
    max_pain: int = 0
    total_ce_oi: int = 0
    total_pe_oi: int = 0
    rows: list[dict] = Field(default_factory=list)
    timestamp: datetime
    data_age_seconds: float = 0.0
    provider: str
    status: str = "LIVE"


class ProviderHealth(BaseModel):
    provider_name: str
    connected: bool = False
    status: str = "DISCONNECTED"  # CONNECTED, DISCONNECTED, DEGRADED, STALE
    last_message_at: Optional[datetime] = None
    last_valid_quote_at: Optional[datetime] = None
    last_option_chain_at: Optional[datetime] = None
    data_age_seconds: float = 0.0
    reconnect_count: int = 0
    error_count: int = 0
    latency_ms: float = 0.0
    last_error: Optional[str] = None


class MarketDataProvider(ABC):
    """Abstract interface for all streaming and REST market data providers."""

    @abstractmethod
    async def connect(self) -> bool:
        """Connect to the provider and start streaming."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Gracefully disconnect from the provider."""
        pass

    @abstractmethod
    async def subscribe(self, symbol: str) -> bool:
        """Subscribe to index or option symbols."""
        pass

    @abstractmethod
    async def unsubscribe(self, symbol: str) -> bool:
        """Unsubscribe from symbol."""
        pass

    @abstractmethod
    async def get_latest_quote(self, symbol: str = "NIFTY") -> NormalizedQuote:
        """Fetch latest index quote."""
        pass

    @abstractmethod
    async def get_option_chain(self, symbol: str = "NIFTY", expiry: Optional[str] = None) -> OptionChainSnapshot:
        """Fetch latest option chain snapshot."""
        pass

    @abstractmethod
    async def stream_events(self) -> AsyncGenerator[NormalizedQuote, None]:
        """Async generator yielding incoming quote events."""
        pass

    @abstractmethod
    def health_check(self) -> ProviderHealth:
        """Returns the real-time health metrics of the provider."""
        pass
