"""
Persistent Continuous Market Monitoring Service for NIFTY 50 Options.
Runs continuous async loop during IST market hours, evaluating ticks,
state machine transitions, Supabase sync, and push notifications.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from monitoring.market.session import MarketSessionManager
from monitoring.providers.streaming_provider import ResilientStreamingProvider
from monitoring.providers.interface import NormalizedQuote
from monitoring.signals.state_machine import SignalStateMachine, SignalState, SignalEventType
from monitoring.storage.supabase_sync import SupabaseSync
from monitoring.notifications.push_dispatcher import PushNotificationDispatcher
from backend.analysis_engine.confluence_strategy import ConfluenceStrategyEngine
from backend.data_provider.interface import UnderlyingQuote, Candle

logger = logging.getLogger("optionpulse.monitoring.service")


class MarketMonitoringService:
    """Orchestrates persistent background market monitoring for NIFTY 50."""

    def __init__(self):
        self.provider = ResilientStreamingProvider()
        self.storage = SupabaseSync()
        self.notifier = PushNotificationDispatcher(self.storage)

        self._running = False
        self._stop_event = asyncio.Event()
        self._last_execution_time: Optional[datetime] = None
        self._last_processing_ms: float = 0.0

    async def start(self):
        """Starts the persistent monitoring lifecycle."""
        self._running = True
        self._stop_event.clear()
        await self.provider.connect()
        logger.info("MarketMonitoringService started successfully.")

        while not self._stop_event.is_set():
            try:
                session = MarketSessionManager.get_session_status()
                is_open = session.get("is_open", False)

                if not is_open:
                    logger.info(f"Market is {session.get('session', 'CLOSED')} ({session.get('reason', '')}). Waiting 30s...")
                    await asyncio.sleep(30.0)
                    continue

                # Market is OPEN: run monitoring cycle
                await self.run_monitoring_cycle()
                await asyncio.sleep(3.0)  # Continuous evaluation every 3 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)
                await asyncio.sleep(5.0)

        await self.provider.disconnect()
        logger.info("MarketMonitoringService stopped.")

    async def stop(self):
        """Signals graceful shutdown."""
        self._running = False
        self._stop_event.set()

    async def run_monitoring_cycle(self) -> dict:
        """
        Executes a single end-to-end monitoring cycle:
        1. Fetch latest NIFTY quote
        2. Check freshness & data staleness
        3. Evaluate existing active signals with State Machine
        4. Generate new signal if no active signal exists
        5. Persist events and dispatch notifications
        6. Record execution audit in monitor_executions
        """
        start_wall = time.perf_counter()
        now_utc = datetime.now(timezone.utc)
        exec_id = f"nifty-monitor-{now_utc.strftime('%Y%m%d-%H%M%S')}"

        session = MarketSessionManager.get_session_status()
        result = {
            "execution_id": exec_id,
            "start_time": now_utc.isoformat(),
            "market_status": session.get("session", "UNKNOWN"),
            "data_provider": self.provider.provider_name,
            "signal_generated": False,
            "events_generated": [],
            "notifications_sent": 0,
            "status": "SUCCESS",
            "errors": None,
        }

        try:
            # 1. Fetch quote
            quote: NormalizedQuote = await self.provider.get_latest_quote("NIFTY")
            result["data_timestamp"] = quote.timestamp.isoformat()
            result["data_age_seconds"] = quote.data_age_seconds
            result["nifty_ltp"] = quote.ltp

            # 2. Check data freshness
            if quote.status == "STALE" or quote.data_age_seconds > 180.0:
                logger.warning(f"Market data is stale ({quote.data_age_seconds}s old). Skipping signal generation.")
                result["status"] = "DATA_STALE"
                result["errors"] = f"Data age {quote.data_age_seconds}s exceeds 180s threshold."
                return await self._finalize_cycle(result, start_wall)

            # Save quote to database
            await self.storage.save_market_quote({
                "instrument": "NIFTY",
                "ltp": quote.ltp,
                "open": quote.open,
                "high": quote.high,
                "low": quote.low,
                "prev_close": quote.prev_close,
                "change": quote.change,
                "change_pct": quote.change_pct,
                "volume": quote.volume,
                "vwap": quote.vwap,
                "provider": quote.provider,
                "data_timestamp": quote.timestamp.isoformat(),
            })

            # 3. Evaluate existing active signals via State Machine
            active_signals = await self.storage.get_active_signals()
            if active_signals:
                for sig in active_signals:
                    transition = SignalStateMachine.evaluate_price_against_signal(sig, quote.ltp)
                    if transition and transition.is_valid:
                        logger.info(f"Signal {sig['id']} transitioned: {transition.from_state.value} -> {transition.to_state.value}")
                        # Update status in DB
                        await self.storage.update_signal_status(str(sig["id"]), transition.to_state.value)

                        # Insert transition event (idempotent)
                        if transition.event_type:
                            event_data = {
                                "signal_id": str(sig["id"]),
                                "event_type": transition.event_type.value,
                                "from_status": transition.from_state.value,
                                "to_status": transition.to_state.value,
                                "nifty_price": quote.ltp,
                                "idempotency_key": transition.idempotency_key,
                                "created_at": now_utc.isoformat(),
                            }
                            inserted = await self.storage.insert_signal_event(event_data)
                            result["events_generated"].append(transition.event_type.value)

                            # Dispatch push notification if newly triggered
                            sent = await self.notifier.dispatch(sig, transition.event_type)
                            if sent:
                                result["notifications_sent"] += 1
            else:
                # 4. No active signal: evaluate real-time 20-rule Confluence Strategy
                # Only during regular market session (09:15 - 15:30)
                if session.get("is_open", False):
                    try:
                        chain = await self.provider.get_option_chain("NIFTY")
                        raw_candles = await self.provider.get_historical_data("NIFTY", "5m", 80)
                        
                        # Convert to domain Candle objects
                        candles = []
                        for c in raw_candles:
                            if isinstance(c, Candle):
                                candles.append(c)
                            elif hasattr(c, "open"):
                                candles.append(Candle(
                                    timestamp=str(getattr(c, "timestamp", "")),
                                    open=float(c.open),
                                    high=float(c.high),
                                    low=float(c.low),
                                    close=float(c.close),
                                    volume=int(getattr(c, "volume", 0) or 0)
                                ))

                        # Build domain UnderlyingQuote
                        underlying_quote = UnderlyingQuote(
                            symbol="NIFTY",
                            ltp=quote.ltp,
                            open=quote.open,
                            high=quote.high,
                            low=quote.low,
                            close=quote.ltp,
                            prev_close=quote.prev_close,
                            change=quote.change,
                            p_change=quote.change_pct,
                            volume=quote.volume,
                            vwap=quote.vwap,
                            timestamp=quote.timestamp.strftime("%Y-%m-%d %H:%M:%S IST") if quote.timestamp else "",
                            data_source=quote.provider,
                            is_delayed=(quote.status != "LIVE"),
                            data_age_seconds=int(quote.data_age_seconds),
                            data_quality=quote.status,
                            is_live_data=(quote.status == "LIVE"),
                        )

                        # Evaluate strict 20-rule confluence
                        confluence = ConfluenceStrategyEngine.evaluate(
                            candles=candles,
                            quote=underlying_quote,
                            chain=None,
                            is_market_open=session.get("is_open", False),
                            data_quality=quote.status,
                            data_source=quote.provider,
                            data_age_seconds=int(quote.data_age_seconds),
                            is_live_data=(quote.status == "LIVE"),
                        )

                        # ONLY generate signal if genuine ENTRY_TRIGGERED
                        if confluence.state == "ENTRY_TRIGGERED" and confluence.signal_type in ("CALL_BUY", "PUT_BUY"):
                            # Deduplication guard: Check if identical strike + signal_type already exists today
                            strike = confluence.recommended_strike or Math.round(quote.ltp / 50) * 50
                            today_str = now_utc.strftime("%Y-%m-%d")
                            
                            # Query active or today's signals to prevent duplicates
                            existing_signals = await self.storage.get_active_signals()
                            is_duplicate = any(
                                s.get("strike") == strike and s.get("signal_type") == confluence.signal_type
                                for s in existing_signals
                            )

                            if not is_duplicate:
                                entry_price = confluence.entry_price or quote.ltp
                                entry_low = round(entry_price - 2.0, 1)
                                entry_high = round(entry_price + 2.0, 1)

                                new_signal = {
                                    "instrument": "NIFTY",
                                    "signal_type": confluence.signal_type,
                                    "expiry": getattr(chain, "expiry", "Current Expiry"),
                                    "strike": strike,
                                    "option_type": confluence.option_type or ("CE" if confluence.direction == "CE" else "PE"),
                                    "nifty_price": quote.ltp,
                                    "entry_low": entry_low,
                                    "entry_high": entry_high,
                                    "entry_trigger": f"Enter {confluence.instrument_name or confluence.option_type} at target ₹{confluence.option_ltp or entry_price}",
                                    "sl": confluence.stop_loss or round(entry_price * 0.85, 1),
                                    "sl_reason": confluence.invalidation_condition or "Retest swing or VWAP break",
                                    "target1": confluence.target_1 or round(entry_price * 1.25, 1),
                                    "target2": confluence.target_2 or round(entry_price * 1.50, 1),
                                    "rr_ratio": confluence.risk_reward or 1.75,
                                    "signal_score": confluence.confidence_score,
                                    "confidence": float(confluence.confidence_score),
                                    "regime": "TRENDING_BULLISH" if confluence.direction == "CE" else "TRENDING_BEARISH",
                                    "trend_direction": "BULLISH" if confluence.direction == "CE" else "BEARISH",
                                    "technical_reason": confluence.summary_reason,
                                    "oi_reason": f"PCR: {getattr(chain, 'pcr', 1.0):.2f}",
                                    "chain_reason": f"ATM: {getattr(chain, 'atm_strike', strike)}",
                                    "liquidity_ok": True,
                                    "status": "WATCH",
                                    "created_at": now_utc.isoformat(),
                                }

                                inserted_sig = await self.storage.insert_signal(new_signal)
                                if inserted_sig:
                                    sig_id = str(inserted_sig.get("id"))
                                    result["signal_generated"] = True
                                    result["signal_id"] = sig_id

                                    idempotency_key = f"{sig_id}_NEW_SIGNAL"
                                    await self.storage.insert_signal_event({
                                        "signal_id": sig_id,
                                        "event_type": "NEW_SIGNAL",
                                        "to_status": "WATCH",
                                        "nifty_price": quote.ltp,
                                        "idempotency_key": idempotency_key,
                                        "created_at": now_utc.isoformat(),
                                    })
                                    result["events_generated"].append("NEW_SIGNAL")
                                    await self.notifier.dispatch(inserted_sig, "NEW_SIGNAL")
                                    result["notifications_sent"] += 1
                                    logger.info(f"Genuine signal created: {confluence.signal_type} {strike} (ID: {sig_id})")
                            else:
                                logger.info(f"Duplicate setup detected for {confluence.signal_type} {strike}. Skipped.")
                        else:
                            logger.debug(f"Confluence state: {confluence.state} - {confluence.summary_reason}. NO SIGNAL.")
                    except Exception as sig_err:
                        logger.warning(f"Error during strategy evaluation: {sig_err}")

        except Exception as e:
            result["status"] = "FAILED"
            result["errors"] = str(e)
            logger.error(f"Monitoring cycle error: {e}", exc_info=True)

        return await self._finalize_cycle(result, start_wall)

    async def _finalize_cycle(self, result: dict, start_wall: float) -> dict:
        duration_ms = round((time.perf_counter() - start_wall) * 1000, 2)
        now_utc = datetime.now(timezone.utc)

        result["end_time"] = now_utc.isoformat()
        result["duration_ms"] = int(duration_ms)
        self._last_execution_time = now_utc
        self._last_processing_ms = duration_ms

        # Persist audit record in Supabase
        await self.storage.record_execution(result)
        return result

    def get_status(self) -> dict:
        """Returns real-time health metrics for status endpoint."""
        health = self.provider.health_check()
        session = MarketSessionManager.get_session_status()
        return {
            "status": "healthy" if health.connected and health.status != "STALE" else health.status.lower(),
            "market_status": session.get("session", "UNKNOWN"),
            "provider_status": health.status.lower(),
            "last_market_update": health.last_valid_quote_at.isoformat() if health.last_valid_quote_at else None,
            "data_age_seconds": health.data_age_seconds,
            "last_signal_evaluation": self._last_execution_time.isoformat() if self._last_execution_time else None,
            "processing_time_ms": int(self._last_processing_ms),
            "reconnect_count": health.reconnect_count,
            "error_count": health.error_count,
        }
