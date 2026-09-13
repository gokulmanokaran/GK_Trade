"""
Resilient Streaming Market Data Provider with WebSocket support,
automatic reconnect, exponential backoff, heartbeat, and stale-data detection.
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional
import websockets

from monitoring.providers.interface import (
    MarketDataProvider,
    NormalizedQuote,
    OptionChainSnapshot,
    ProviderHealth,
)
from backend.data_provider.composite_provider import CompositeMarketDataProvider
from backend.data_provider.interface import UnderlyingQuote, OptionChainData

logger = logging.getLogger("optionpulse.monitoring.provider")


class ResilientStreamingProvider(MarketDataProvider):
    """
    Handles live market data streams for NIFTY 50.
    Supports native WebSocket feeds, automatic reconnect,
    exponential backoff, heartbeat, and data staleness enforcement.
    """

    def __init__(self):
        self.ws_url = os.getenv("MARKET_DATA_WS_URL", "").strip()
        self.api_key = os.getenv("MARKET_DATA_API_KEY", "").strip()
        self.provider_name = os.getenv("MARKET_DATA_PROVIDER", "NSE-Composite")

        self._connected = False
        self._shutdown_event = asyncio.Event()
        self._reconnect_count = 0
        self._error_count = 0
        self._last_message_at: Optional[datetime] = None
        self._last_quote_at: Optional[datetime] = None
        self._last_chain_at: Optional[datetime] = None
        self._last_quote: Optional[NormalizedQuote] = None
        self._last_chain: Optional[OptionChainSnapshot] = None
        self._latency_ms = 0.0

        # Composite fallback provider for NSE/Yahoo live data
        self._composite = CompositeMarketDataProvider()

        # Queue for stream_events
        self._quote_queue: asyncio.Queue[NormalizedQuote] = asyncio.Queue(maxsize=100)

    async def connect(self) -> bool:
        """Starts the connection lifecycle."""
        self._shutdown_event.clear()
        self._connected = True
        logger.info(f"Connecting ResilientStreamingProvider (Source: {self.provider_name})...")
        return True

    async def disconnect(self) -> None:
        """Gracefully terminates connections."""
        self._shutdown_event.set()
        self._connected = False
        logger.info("ResilientStreamingProvider disconnected.")

    async def subscribe(self, symbol: str) -> bool:
        logger.info(f"Subscribed to symbol: {symbol}")
        return True

    async def unsubscribe(self, symbol: str) -> bool:
        return True

    def health_check(self) -> ProviderHealth:
        """Returns comprehensive provider health."""
        now = datetime.now(timezone.utc)
        data_age = 0.0
        if self._last_quote_at:
            data_age = max(0.0, (now - self._last_quote_at).total_seconds())

        status = "CONNECTED" if self._connected else "DISCONNECTED"
        if data_age > 180.0:
            status = "STALE"
        elif self._error_count > 5:
            status = "DEGRADED"

        return ProviderHealth(
            provider_name=self.provider_name,
            connected=self._connected,
            status=status,
            last_message_at=self._last_message_at,
            last_valid_quote_at=self._last_quote_at,
            last_option_chain_at=self._last_chain_at,
            data_age_seconds=round(data_age, 2),
            reconnect_count=self._reconnect_count,
            error_count=self._error_count,
            latency_ms=round(self._latency_ms, 2),
        )

    async def get_latest_quote(self, symbol: str = "NIFTY") -> NormalizedQuote:
        """Fetches normalized quote and computes data freshness."""
        start = time.perf_counter()
        try:
            raw_quote: UnderlyingQuote = await self._composite.get_index_quote(symbol)
            self._latency_ms = (time.perf_counter() - start) * 1000

            now = datetime.now(timezone.utc)
            # Parse quote timestamp
            q_time = now
            if hasattr(raw_quote, "timestamp") and raw_quote.timestamp:
                try:
                    if isinstance(raw_quote.timestamp, str):
                        q_time = datetime.fromisoformat(raw_quote.timestamp.replace("Z", "+00:00"))
                    elif isinstance(raw_quote.timestamp, datetime):
                        q_time = raw_quote.timestamp
                except Exception:
                    q_time = now

            data_age = max(0.0, (now - q_time).total_seconds())
            is_stale = data_age > 180.0

            status = "LIVE"
            if is_stale:
                status = "STALE"
            elif getattr(raw_quote, "is_delayed", False):
                status = "DELAYED"

            normalized = NormalizedQuote(
                symbol=symbol,
                ltp=raw_quote.ltp,
                open=raw_quote.open or 0.0,
                high=raw_quote.high or 0.0,
                low=raw_quote.low or 0.0,
                prev_close=raw_quote.prev_close or 0.0,
                change=raw_quote.change or 0.0,
                change_pct=raw_quote.p_change or 0.0,
                volume=raw_quote.volume or 0,
                vwap=raw_quote.vwap or 0.0,
                timestamp=q_time,
                data_age_seconds=round(data_age, 2),
                provider=raw_quote.data_source,
                status=status,
            )

            self._last_quote = normalized
            self._last_quote_at = now
            self._last_message_at = now
            return normalized
        except Exception as e:
            self._error_count += 1
            logger.error(f"Error fetching quote for {symbol}: {e}")
            raise

    async def get_option_chain(self, symbol: str = "NIFTY", expiry: Optional[str] = None) -> OptionChainSnapshot:
        """Fetches normalized option chain snapshot."""
        try:
            raw_chain: OptionChainData = await self._composite.get_option_chain(symbol, expiry)
            now = datetime.now(timezone.utc)

            underlying_price = getattr(raw_chain, "underlying_ltp", 0.0)
            atm = int(round(underlying_price / 50.0) * 50) if underlying_price else 0

            rows_data = []
            strikes = getattr(raw_chain, "strikes", [])
            for row in strikes:
                strike = int(row.strike_price)
                ce = getattr(row, "ce", None)
                pe = getattr(row, "pe", None)
                ce_greeks = getattr(ce, "greeks", None) if ce else None
                pe_greeks = getattr(pe, "greeks", None) if pe else None

                rows_data.append({
                    "strike": strike,
                    "ce_ltp": getattr(ce, "ltp", 0.0) if ce else 0.0,
                    "ce_oi": getattr(ce, "oi", 0) if ce else 0,
                    "ce_oi_change": getattr(ce, "change_oi", 0) if ce else 0,
                    "ce_volume": getattr(ce, "volume", 0) if ce else 0,
                    "ce_iv": getattr(ce, "iv", 0.0) if ce else 0.0,
                    "ce_delta": getattr(ce_greeks, "delta", 0.0) if ce_greeks else 0.0,
                    "ce_gamma": getattr(ce_greeks, "gamma", 0.0) if ce_greeks else 0.0,
                    "ce_theta": getattr(ce_greeks, "theta", 0.0) if ce_greeks else 0.0,
                    "ce_vega": getattr(ce_greeks, "vega", 0.0) if ce_greeks else 0.0,
                    "pe_ltp": getattr(pe, "ltp", 0.0) if pe else 0.0,
                    "pe_oi": getattr(pe, "oi", 0) if pe else 0,
                    "pe_oi_change": getattr(pe, "change_oi", 0) if pe else 0,
                    "pe_volume": getattr(pe, "volume", 0) if pe else 0,
                    "pe_iv": getattr(pe, "iv", 0.0) if pe else 0.0,
                    "pe_delta": getattr(pe_greeks, "delta", 0.0) if pe_greeks else 0.0,
                    "pe_gamma": getattr(pe_greeks, "gamma", 0.0) if pe_greeks else 0.0,
                    "pe_theta": getattr(pe_greeks, "theta", 0.0) if pe_greeks else 0.0,
                    "pe_vega": getattr(pe_greeks, "vega", 0.0) if pe_greeks else 0.0,
                    "is_atm": (strike == atm),
                })

            snapshot = OptionChainSnapshot(
                symbol=symbol,
                expiry=getattr(raw_chain, "expiry_date", "") or datetime.now().strftime("%Y-%m-%d"),
                atm_strike=atm,
                underlying_ltp=underlying_price,
                pcr=round(getattr(raw_chain, "pcr", 1.0), 4),
                max_pain=int(getattr(raw_chain, "max_pain", 0)),
                total_ce_oi=getattr(raw_chain, "total_ce_oi", 0),
                total_pe_oi=getattr(raw_chain, "total_pe_oi", 0),
                rows=rows_data,
                timestamp=now,
                data_age_seconds=0.0,
                provider=getattr(raw_chain, "data_source", "COMPOSITE"),
                status="LIVE" if not getattr(raw_chain, "is_delayed", False) else "DELAYED",
            )

            self._last_chain = snapshot
            self._last_chain_at = now
            return snapshot
        except Exception as e:
            self._error_count += 1
            logger.error(f"Error fetching option chain for {symbol}: {e}")
            raise

    async def stream_events(self) -> AsyncGenerator[NormalizedQuote, None]:
        """
        Continuously yields incoming quotes.
        If WebSocket URL is configured, uses persistent WebSocket with reconnect & backoff.
        Otherwise, yields high-frequency polled ticks with exponential backoff on error.
        """
        backoff_sec = 1.0
        max_backoff = 30.0

        if self.ws_url:
            while not self._shutdown_event.is_set():
                try:
                    logger.info(f"Connecting to WebSocket feed at {self.ws_url}...")
                    async with websockets.connect(
                        self.ws_url,
                        ping_interval=15,
                        ping_timeout=10,
                        close_timeout=5,
                    ) as ws:
                        self._connected = True
                        backoff_sec = 1.0
                        logger.info("WebSocket feed connected successfully.")

                        # Optional subscription payload
                        sub_msg = {"action": "subscribe", "symbol": "NIFTY"}
                        if self.api_key:
                            sub_msg["apiKey"] = self.api_key
                        await ws.send(json.dumps(sub_msg))

                        async for message in ws:
                            if self._shutdown_event.is_set():
                                break
                            self._last_message_at = datetime.now(timezone.utc)
                            data = json.loads(message)
                            if "ltp" in data:
                                quote = NormalizedQuote(
                                    symbol=data.get("symbol", "NIFTY"),
                                    ltp=float(data["ltp"]),
                                    open=float(data.get("open", 0.0)),
                                    high=float(data.get("high", 0.0)),
                                    low=float(data.get("low", 0.0)),
                                    prev_close=float(data.get("prev_close", 0.0)),
                                    change=float(data.get("change", 0.0)),
                                    change_pct=float(data.get("change_pct", 0.0)),
                                    volume=int(data.get("volume", 0)),
                                    vwap=float(data.get("vwap", 0.0)),
                                    timestamp=datetime.now(timezone.utc),
                                    provider=self.provider_name,
                                    status="LIVE",
                                )
                                self._last_quote = quote
                                self._last_quote_at = datetime.now(timezone.utc)
                                yield quote
                except Exception as e:
                    self._reconnect_count += 1
                    self._error_count += 1
                    self._connected = False
                    logger.warning(f"WebSocket disconnected ({e}). Reconnecting in {backoff_sec}s...")
                    await asyncio.sleep(backoff_sec)
                    backoff_sec = min(backoff_sec * 2.0, max_backoff)
        else:
            # Resilient continuous ticker mode (for NSE session + Yahoo fallback)
            logger.info("Using continuous live stream mode.")
            while not self._shutdown_event.is_set():
                try:
                    quote = await self.get_latest_quote("NIFTY")
                    yield quote
                    backoff_sec = 1.0
                    await asyncio.sleep(3.0)  # Stream frequency: 3 seconds
                except Exception as e:
                    self._error_count += 1
                    logger.warning(f"Market stream fetch error ({e}). Backing off {backoff_sec}s...")
                    await asyncio.sleep(backoff_sec)
                    backoff_sec = min(backoff_sec * 1.5, max_backoff)
