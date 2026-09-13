"""
Automated Unit & Integration Tests for Persistent Monitoring Service,
State Machine, Market Holidays, and Idempotency.
"""

import pytest
from datetime import datetime, timezone
import pytz

from monitoring.market.session import MarketSessionManager
from backend.analysis_engine.market_holidays import get_nse_holiday, get_market_session_ist
from monitoring.signals.state_machine import (
    SignalStateMachine,
    SignalState,
    SignalEventType,
)
from monitoring.providers.streaming_provider import ResilientStreamingProvider
from monitoring.storage.supabase_sync import SupabaseSync
from monitoring.notifications.push_dispatcher import PushNotificationDispatcher

IST = pytz.timezone("Asia/Kolkata")


# ============================================================
# 1. Market Hours & Holiday Tests
# ============================================================
def test_nse_holidays():
    """Verify known NSE holidays return is_holiday=True."""
    # Republic Day 2025
    republic_day = IST.localize(datetime(2025, 1, 26, 10, 0))
    is_h, name = get_nse_holiday(republic_day)
    assert is_h is True
    assert "Republic Day" in name

    # Independence Day 2024
    indep_day = IST.localize(datetime(2024, 8, 15, 11, 0))
    is_h, name = get_nse_holiday(indep_day)
    assert is_h is True
    assert "Independence Day" in name

    # Ordinary Wednesday (not holiday)
    regular_day = IST.localize(datetime(2024, 6, 12, 11, 0))
    is_h, name = get_nse_holiday(regular_day)
    assert is_h is False
    assert name is None


def test_market_session_statuses():
    """Verify market session classification for weekends and off-hours."""
    # Saturday
    saturday = IST.localize(datetime(2024, 6, 15, 10, 30))
    res = get_market_session_ist(saturday)
    assert res["is_open"] is False
    assert res["session"] == "CLOSED_WEEKEND"

    # Weekday regular market open at 10:30 IST
    regular_open = IST.localize(datetime(2024, 6, 12, 10, 30))
    res = get_market_session_ist(regular_open)
    assert res["is_open"] is True
    assert res["session"] == "OPEN"

    # Pre-open at 09:05 IST
    pre_open = IST.localize(datetime(2024, 6, 12, 9, 5))
    res = get_market_session_ist(pre_open)
    assert res["is_open"] is False
    assert res["session"] == "PRE_OPEN"

    # Post-close at 16:00 IST
    post_close = IST.localize(datetime(2024, 6, 12, 16, 0))
    res = get_market_session_ist(post_close)
    assert res["is_open"] is False
    assert res["session"] == "POST_CLOSE"


# ============================================================
# 2. State Machine Tests
# ============================================================
def test_valid_state_transitions():
    """Verify legal state transitions emit correct event types and deterministic idempotency keys."""
    sig_id = "test-signal-uuid-123"

    # WATCH -> ENTRY_TRIGGERED
    res1 = SignalStateMachine.transition(sig_id, SignalState.WATCH, SignalState.ENTRY_TRIGGERED)
    assert res1.is_valid is True
    assert res1.to_state == SignalState.ENTRY_TRIGGERED
    assert res1.event_type == SignalEventType.ENTRY_TRIGGERED
    assert res1.idempotency_key == f"{sig_id}_ENTRY_TRIGGERED"

    # ENTRY_TRIGGERED -> POSITION_ACTIVE
    res2 = SignalStateMachine.transition(sig_id, SignalState.ENTRY_TRIGGERED, SignalState.POSITION_ACTIVE)
    assert res2.is_valid is True
    assert res2.to_state == SignalState.POSITION_ACTIVE

    # POSITION_ACTIVE -> TARGET1_HIT
    res3 = SignalStateMachine.transition(sig_id, SignalState.POSITION_ACTIVE, SignalState.TARGET1_HIT)
    assert res3.is_valid is True
    assert res3.event_type == SignalEventType.TARGET1_HIT
    assert res3.idempotency_key == f"{sig_id}_TARGET1_HIT"

    # TARGET1_HIT -> TRAILING_SL
    res4 = SignalStateMachine.transition(sig_id, SignalState.TARGET1_HIT, SignalState.TRAILING_SL)
    assert res4.is_valid is True
    assert res4.to_state == SignalState.TRAILING_SL

    # TRAILING_SL -> TARGET2_HIT
    res5 = SignalStateMachine.transition(sig_id, SignalState.TRAILING_SL, SignalState.TARGET2_HIT)
    assert res5.is_valid is True
    assert res5.event_type == SignalEventType.TARGET2_HIT

    # TARGET2_HIT -> EXIT
    res6 = SignalStateMachine.transition(sig_id, SignalState.TARGET2_HIT, SignalState.EXIT)
    assert res6.is_valid is True
    assert res6.to_state == SignalState.EXIT


def test_illegal_state_transitions():
    """Verify illegal jumps are strictly blocked."""
    sig_id = "test-signal-uuid-456"

    # WATCH cannot jump straight to TARGET1_HIT
    res = SignalStateMachine.transition(sig_id, SignalState.WATCH, SignalState.TARGET1_HIT)
    assert res.is_valid is False
    assert "Illegal transition" in res.error

    # Same state transition is rejected
    res2 = SignalStateMachine.transition(sig_id, SignalState.POSITION_ACTIVE, SignalState.POSITION_ACTIVE)
    assert res2.is_valid is False
    assert "Cannot transition to the same state" in res2.error

    # Terminal EXIT cannot transition to anything
    res3 = SignalStateMachine.transition(sig_id, SignalState.EXIT, SignalState.WATCH)
    assert res3.is_valid is False


def test_price_evaluation_sl_hit():
    """Verify Stop Loss trigger produces SL_HIT transition."""
    sig = {
        "id": "sig-sl-test-01",
        "status": "POSITION_ACTIVE",
        "entry_low": 180.0,
        "entry_high": 190.0,
        "sl": 150.0,
        "target1": 225.0,
        "target2": 270.0,
    }
    # Current option price dropped to 148 (below SL 150)
    transition = SignalStateMachine.evaluate_price_against_signal(sig, current_nifty_price=24500, current_option_price=148.0)
    assert transition is not None
    assert transition.is_valid is True
    assert transition.to_state == SignalState.SL_HIT
    assert transition.event_type == SignalEventType.SL_HIT
    assert transition.idempotency_key == "sig-sl-test-01_SL_HIT"


def test_price_evaluation_target1_hit():
    """Verify Target 1 reached produces TARGET1_HIT transition."""
    sig = {
        "id": "sig-t1-test-01",
        "status": "POSITION_ACTIVE",
        "entry_low": 180.0,
        "entry_high": 190.0,
        "sl": 150.0,
        "target1": 225.0,
        "target2": 270.0,
    }
    # Current option price reached 228 (above Target 1 225)
    transition = SignalStateMachine.evaluate_price_against_signal(sig, current_nifty_price=24600, current_option_price=228.0)
    assert transition is not None
    assert transition.is_valid is True
    assert transition.to_state == SignalState.TARGET1_HIT
    assert transition.event_type == SignalEventType.TARGET1_HIT


# ============================================================
# 3. Push Notification Formatter Tests
# ============================================================
def test_push_notification_formatting():
    """Verify notifications format strictly according to requirements."""
    storage = SupabaseSync()
    dispatcher = PushNotificationDispatcher(storage)

    signal = {
        "id": "sig-notif-01",
        "signal_type": "CALL_BUY",
        "strike": 25400,
        "option_type": "CE",
        "entry_low": 185,
        "entry_high": 190,
        "sl": 145,
        "target1": 225,
        "target2": 270,
        "signal_score": 86,
    }

    # ENTRY
    title, body = dispatcher.format_notification(signal, SignalEventType.ENTRY_TRIGGERED)
    assert "🚨 NIFTY ENTRY SIGNAL" in title
    assert "NIFTY 25400 CE" in body
    assert "Entry: ₹185–₹190" in body
    assert "SL: ₹145" in body
    assert "Score: 86/100" in body

    # STOP LOSS
    title_sl, body_sl = dispatcher.format_notification(signal, SignalEventType.SL_HIT)
    assert "🚨 NIFTY STOP LOSS" in title_sl
    assert "Action: EXIT" in body_sl

    # TARGET 1
    title_t1, body_t1 = dispatcher.format_notification(signal, SignalEventType.TARGET1_HIT)
    assert "🎯 NIFTY TARGET 1" in title_t1
    assert "Target 1: ₹225" in body_t1
    assert "trail SL" in body_t1

    # TARGET 2
    title_t2, body_t2 = dispatcher.format_notification(signal, SignalEventType.TARGET2_HIT)
    assert "🎯 NIFTY TARGET 2" in title_t2
    assert "BOOK PROFIT / EXIT" in body_t2


# ============================================================
# 4. Provider Freshness & Health Check Tests
# ============================================================
def test_provider_health_check():
    """Verify provider health check tracks data freshness and status."""
    provider = ResilientStreamingProvider()
    health = provider.health_check()
    assert health.provider_name is not None
    assert health.status in ("DISCONNECTED", "CONNECTED", "DEGRADED", "STALE")
