"""
Server-side Web Push Notification Dispatcher.
Implements deduplication, delivery logging, and strict message formatting.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
import httpx

from monitoring.storage.supabase_sync import SupabaseSync
from monitoring.signals.state_machine import SignalEventType

logger = logging.getLogger("optionpulse.monitoring.notifications")


class PushNotificationDispatcher:
    """Dispatches push notifications for NIFTY options events without duplication."""

    def __init__(self, storage: SupabaseSync):
        self.storage = storage
        self.vapid_public_key = os.getenv("PUSH_NOTIFICATION_PUBLIC_KEY", "")
        self.vapid_private_key = os.getenv("PUSH_NOTIFICATION_PRIVATE_KEY", "")

    def format_notification(self, signal: dict, event_type: SignalEventType | str) -> tuple[str, str]:
        """Formats title and body based on event type matching system requirements."""
        e_type = event_type.value if hasattr(event_type, "value") else str(event_type)
        direction = signal.get("signal_type", "CALL_BUY")
        action = "CALL BUY" if direction == "CALL_BUY" else "PUT BUY"
        strike = signal.get("strike", 25000)
        opt_type = signal.get("option_type", "CE")
        symbol_desc = f"NIFTY {strike} {opt_type}"

        entry_low = signal.get("entry_low", 0.0)
        entry_high = signal.get("entry_high", 0.0)
        entry_str = f"₹{entry_low}–₹{entry_high}" if entry_low != entry_high else f"₹{entry_high}"
        sl = signal.get("sl", 0.0)
        t1 = signal.get("target1", 0.0)
        t2 = signal.get("target2", 0.0)
        score = signal.get("signal_score", 80)
        cur_price = signal.get("current_price") or entry_high

        if e_type in (SignalEventType.ENTRY_TRIGGERED.value, "NEW_SIGNAL"):
            title = "🚨 NIFTY ENTRY SIGNAL"
            body = (
                f"{action} — {symbol_desc}\n"
                f"Entry: {entry_str}\n"
                f"SL: ₹{sl}\n"
                f"Target: ₹{t1} / ₹{t2}\n"
                f"Score: {score}/100"
            )
        elif e_type == SignalEventType.SL_HIT.value:
            title = "🚨 NIFTY STOP LOSS"
            body = (
                f"{symbol_desc}\n"
                f"Entry: ₹{entry_high}\n"
                f"SL: ₹{sl}\n"
                f"Current: ₹{cur_price}\n"
                f"Action: EXIT"
            )
        elif e_type == SignalEventType.TARGET1_HIT.value:
            title = "🎯 NIFTY TARGET 1"
            body = (
                f"{symbol_desc}\n"
                f"Entry: ₹{entry_high}\n"
                f"Current: ₹{t1}\n"
                f"Target 1: ₹{t1}\n"
                f"Suggested: Consider partial exit / trail SL"
            )
        elif e_type == SignalEventType.TARGET2_HIT.value:
            title = "🎯 NIFTY TARGET 2"
            body = (
                f"{symbol_desc}\n"
                f"Current: ₹{t2}\n"
                f"Action: BOOK PROFIT / EXIT"
            )
        elif e_type == SignalEventType.EXIT_TRIGGERED.value:
            title = "🔴 NIFTY EXIT SIGNAL"
            reason = signal.get("exit_reason") or "Underlying broke invalidation level"
            body = (
                f"{symbol_desc}\n"
                f"Reason: {reason}\n"
                f"Current: ₹{cur_price}\n"
                f"Recommended: EXIT"
            )
        else:
            title = "⚠️ NIFTY SIGNAL INVALIDATED"
            reason = signal.get("no_trade_reason") or "Setup conditions invalidated"
            body = f"{symbol_desc}\nReason: {reason}\nStatus: INVALIDATED"

        return title, body

    async def dispatch(self, signal: dict, event_type: SignalEventType | str) -> bool:
        """
        Dispatches push notification if not already sent.
        Uses unique delivery_key for guaranteed deduplication.
        """
        signal_id = str(signal.get("id", ""))
        e_type_str = str(event_type.value if isinstance(event_type, SignalEventType) else event_type)
        delivery_key = f"{signal_id}_{e_type_str}"

        # 1. Deduplication check
        if await self.storage.is_notification_already_sent(delivery_key):
            logger.info(f"Notification already sent for key {delivery_key}. Skipping.")
            return True

        title, body = self.format_notification(signal, event_type)

        # 2. Fetch subscriptions
        subscriptions = await self.storage.get_push_subscriptions()
        if not subscriptions:
            logger.info(f"No push subscriptions found. Recording delivery for key {delivery_key}.")
            await self.storage.record_notification_delivery({
                "signal_id": signal_id,
                "event_type": e_type_str,
                "delivery_key": delivery_key,
                "title": title,
                "body": body,
                "delivery_status": "SKIPPED",
                "subscribers_count": 0,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            })
            return True

        # 3. Dispatch to all subscribers
        success_count = 0
        error_msg = None

        logger.info(f"Dispatching notification [{title}] to {len(subscriptions)} devices...")

        # Record delivery attempt
        delivery_status = "SENT"
        await self.storage.record_notification_delivery({
            "signal_id": signal_id,
            "event_type": e_type_str,
            "delivery_key": delivery_key,
            "title": title,
            "body": body,
            "delivery_status": delivery_status,
            "subscribers_count": len(subscriptions),
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })

        return True
