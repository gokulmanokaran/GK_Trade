"""
Supabase PostgreSQL Synchronization & Persistence Layer for OptionPulse.
Communicates directly with Supabase via secure REST API using Service Role Key.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx

logger = logging.getLogger("optionpulse.monitoring.storage")


class SupabaseSync:
    """Handles all database persistence, idempotency checking, and query operations."""

    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        self.supabase_url = self.supabase_url.rstrip("/")

        if not self.supabase_url or not self.service_key:
            logger.warning("Supabase URL or Key not set. SupabaseSync operating in mock/fallback mode.")

        self.headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.supabase_url and self.service_key)

    async def record_execution(self, execution_data: dict) -> Optional[dict]:
        """Logs a monitoring execution cycle into monitor_executions."""
        if not self.is_configured:
            return None
        url = f"{self.supabase_url}/rest/v1/monitor_executions"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=self.headers, json=execution_data)
                if res.status_code in (200, 201):
                    data = res.json()
                    return data[0] if isinstance(data, list) and data else data
                else:
                    logger.error(f"Failed to record execution: {res.status_code} {res.text}")
        except Exception as e:
            logger.error(f"Supabase record_execution error: {e}")
        return None

    async def save_market_quote(self, quote_data: dict) -> None:
        """Saves a normalized quote to market_quotes table."""
        if not self.is_configured:
            return
        url = f"{self.supabase_url}/rest/v1/market_quotes"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                await client.post(url, headers=self.headers, json=quote_data)
        except Exception as e:
            logger.error(f"Error saving quote to Supabase: {e}")

    async def get_active_signals(self) -> list[dict]:
        """Fetches currently active signals (not terminal)."""
        if not self.is_configured:
            return []
        url = f"{self.supabase_url}/rest/v1/signals"
        params = {
            "select": "*",
            "status": "not.in.(EXIT,INVALIDATED,NO_TRADE)",
            "order": "created_at.desc",
            "limit": "10",
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            logger.error(f"Error fetching active signals: {e}")
        return []

    async def insert_signal(self, signal_data: dict) -> Optional[dict]:
        """Inserts a new generated signal into signals table."""
        if not self.is_configured:
            return None
        url = f"{self.supabase_url}/rest/v1/signals"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=self.headers, json=signal_data)
                if res.status_code in (200, 201):
                    data = res.json()
                    return data[0] if isinstance(data, list) and data else data
        except Exception as e:
            logger.error(f"Error inserting signal: {e}")
        return None

    async def update_signal_status(self, signal_id: str, new_status: str, extra: Optional[dict] = None) -> bool:
        """Updates signal status in signals table."""
        if not self.is_configured:
            return False
        url = f"{self.supabase_url}/rest/v1/signals?id=eq.{signal_id}"
        payload = {"status": new_status, **(extra or {})}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.patch(url, headers=self.headers, json=payload)
                return res.status_code in (200, 204)
        except Exception as e:
            logger.error(f"Error updating signal status {signal_id}: {e}")
        return False

    async def insert_signal_event(self, event_data: dict) -> bool:
        """
        Inserts a signal transition event into signal_events.
        Idempotent: uses idempotency_key with Prefer: resolution=ignore-duplicates.
        """
        if not self.is_configured:
            return False
        url = f"{self.supabase_url}/rest/v1/signal_events"
        headers = {**self.headers, "Prefer": "resolution=ignore-duplicates,return=representation"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(url, headers=headers, json=event_data)
                return res.status_code in (200, 201, 204)
        except Exception as e:
            logger.error(f"Error inserting signal event: {e}")
        return False

    async def is_notification_already_sent(self, delivery_key: str) -> bool:
        """Checks if a notification with this delivery_key was already successfully dispatched."""
        if not self.is_configured:
            return False
        url = f"{self.supabase_url}/rest/v1/notification_deliveries"
        params = {"delivery_key": f"eq.{delivery_key}", "select": "id"}
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
                if res.status_code == 200:
                    data = res.json()
                    return len(data) > 0
        except Exception as e:
            logger.error(f"Error checking notification delivery key: {e}")
        return False

    async def record_notification_delivery(self, delivery_data: dict) -> bool:
        """Records notification delivery attempt for deduplication."""
        if not self.is_configured:
            return False
        url = f"{self.supabase_url}/rest/v1/notification_deliveries"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(url, headers=self.headers, json=delivery_data)
                return res.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Error recording notification delivery: {e}")
        return False

    async def get_push_subscriptions(self) -> list[dict]:
        """Fetches all active Web Push subscriptions."""
        if not self.is_configured:
            return []
        url = f"{self.supabase_url}/rest/v1/notification_subscriptions"
        params = {"select": "id,endpoint,p256dh,auth"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, headers=self.headers, params=params)
                if res.status_code == 200:
                    return res.json()
        except Exception as e:
            logger.error(f"Error fetching push subscriptions: {e}")
        return []
