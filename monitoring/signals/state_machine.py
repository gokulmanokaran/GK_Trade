"""
Controlled Signal State Machine & Transition Engine.
Enforces valid state transitions and idempotent event emission for NIFTY 50 options.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class SignalState(str, Enum):
    WATCH = "WATCH"
    WAITING_FOR_ENTRY = "WAITING_FOR_ENTRY"
    ENTRY_TRIGGERED = "ENTRY_TRIGGERED"
    POSITION_ACTIVE = "POSITION_ACTIVE"
    TARGET1_HIT = "TARGET1_HIT"
    TRAILING_SL = "TRAILING_SL"
    TARGET2_HIT = "TARGET2_HIT"
    SL_HIT = "SL_HIT"
    EXIT_TRIGGERED = "EXIT_TRIGGERED"
    INVALIDATED = "INVALIDATED"
    EXIT = "EXIT"


class SignalEventType(str, Enum):
    NEW_SIGNAL = "NEW_SIGNAL"
    ENTRY_TRIGGERED = "ENTRY_TRIGGERED"
    TARGET1_HIT = "TARGET1_HIT"
    TARGET2_HIT = "TARGET2_HIT"
    SL_HIT = "SL_HIT"
    EXIT_TRIGGERED = "EXIT_TRIGGERED"
    SIGNAL_INVALIDATED = "SIGNAL_INVALIDATED"


# Strict legal transition table
LEGAL_TRANSITIONS: dict[SignalState, set[SignalState]] = {
    SignalState.WATCH: {
        SignalState.WAITING_FOR_ENTRY,
        SignalState.ENTRY_TRIGGERED,
        SignalState.INVALIDATED,
        SignalState.EXIT,
    },
    SignalState.WAITING_FOR_ENTRY: {
        SignalState.ENTRY_TRIGGERED,
        SignalState.INVALIDATED,
        SignalState.EXIT,
    },
    SignalState.ENTRY_TRIGGERED: {
        SignalState.POSITION_ACTIVE,
        SignalState.SL_HIT,
        SignalState.EXIT,
    },
    SignalState.POSITION_ACTIVE: {
        SignalState.TARGET1_HIT,
        SignalState.SL_HIT,
        SignalState.EXIT_TRIGGERED,
        SignalState.EXIT,
    },
    SignalState.TARGET1_HIT: {
        SignalState.TRAILING_SL,
        SignalState.TARGET2_HIT,
        SignalState.SL_HIT,
        SignalState.EXIT_TRIGGERED,
        SignalState.EXIT,
    },
    SignalState.TRAILING_SL: {
        SignalState.TARGET2_HIT,
        SignalState.SL_HIT,
        SignalState.EXIT_TRIGGERED,
        SignalState.EXIT,
    },
    SignalState.TARGET2_HIT: {
        SignalState.EXIT_TRIGGERED,
        SignalState.EXIT,
    },
    SignalState.SL_HIT: {
        SignalState.EXIT,
    },
    SignalState.EXIT_TRIGGERED: {
        SignalState.EXIT,
    },
    SignalState.INVALIDATED: set(),  # Terminal
    SignalState.EXIT: set(),         # Terminal
}


class SignalTransitionResult(BaseModel):
    is_valid: bool
    from_state: SignalState
    to_state: SignalState
    event_type: Optional[SignalEventType] = None
    idempotency_key: str
    error: Optional[str] = None


class SignalStateMachine:
    """Validates and applies state transitions for active signals."""

    @staticmethod
    def is_terminal(state: SignalState | str) -> bool:
        s = SignalState(state) if isinstance(state, str) else state
        return s in (SignalState.EXIT, SignalState.INVALIDATED)

    @classmethod
    def transition(
        cls,
        signal_id: str,
        current_state: SignalState | str,
        next_state: SignalState | str,
        reason: str = "",
    ) -> SignalTransitionResult:
        """
        Validates transition from current_state to next_state.
        Returns a SignalTransitionResult with the appropriate SignalEventType and idempotency_key.
        """
        curr = SignalState(current_state) if isinstance(current_state, str) else current_state
        target = SignalState(next_state) if isinstance(next_state, str) else next_state

        if curr == target:
            return SignalTransitionResult(
                is_valid=False,
                from_state=curr,
                to_state=target,
                idempotency_key=f"{signal_id}_{curr.value}",
                error=f"Cannot transition to the same state: {curr.value}",
            )

        valid_targets = LEGAL_TRANSITIONS.get(curr, set())
        if target not in valid_targets:
            return SignalTransitionResult(
                is_valid=False,
                from_state=curr,
                to_state=target,
                idempotency_key=f"{signal_id}_{target.value}",
                error=f"Illegal transition: {curr.value} -> {target.value}. Valid next states: {[s.value for s in valid_targets]}",
            )

        # Map target state to EventType
        event_type_map = {
            SignalState.ENTRY_TRIGGERED: SignalEventType.ENTRY_TRIGGERED,
            SignalState.TARGET1_HIT: SignalEventType.TARGET1_HIT,
            SignalState.TARGET2_HIT: SignalEventType.TARGET2_HIT,
            SignalState.SL_HIT: SignalEventType.SL_HIT,
            SignalState.EXIT_TRIGGERED: SignalEventType.EXIT_TRIGGERED,
            SignalState.INVALIDATED: SignalEventType.SIGNAL_INVALIDATED,
        }
        event_type = event_type_map.get(target)

        # Deterministic idempotency key: signal_id + event_type
        idempotency_key = f"{signal_id}_{event_type.value if event_type else target.value}"

        return SignalTransitionResult(
            is_valid=True,
            from_state=curr,
            to_state=target,
            event_type=event_type,
            idempotency_key=idempotency_key,
        )

    @classmethod
    def evaluate_price_against_signal(
        cls,
        signal: dict,
        current_nifty_price: float,
        current_option_price: Optional[float] = None,
    ) -> Optional[SignalTransitionResult]:
        """
        Evaluates current prices against signal's entry, target, and SL levels.
        Returns transition result if a state change occurred.
        """
        signal_id = str(signal["id"])
        status = SignalState(signal.get("status", "WATCH"))

        if cls.is_terminal(status):
            return None

        opt_price = current_option_price or signal.get("entry_high") or 100.0
        entry_low = float(signal.get("entry_low") or 0.0)
        entry_high = float(signal.get("entry_high") or 0.0)
        sl = float(signal.get("sl") or 0.0)
        t1 = float(signal.get("target1") or 0.0)
        t2 = float(signal.get("target2") or 0.0)

        # 1. WATCH / WAITING_FOR_ENTRY -> ENTRY_TRIGGERED
        if status in (SignalState.WATCH, SignalState.WAITING_FOR_ENTRY):
            if entry_low > 0 and entry_high > 0:
                if entry_low <= opt_price <= entry_high * 1.02:
                    return cls.transition(signal_id, status, SignalState.ENTRY_TRIGGERED, "Price entered entry range")
            return None

        # 2. ENTRY_TRIGGERED -> POSITION_ACTIVE
        if status == SignalState.ENTRY_TRIGGERED:
            return cls.transition(signal_id, status, SignalState.POSITION_ACTIVE, "Position activated")

        # 3. POSITION_ACTIVE / TARGET1_HIT / TRAILING_SL evaluations
        if status in (SignalState.POSITION_ACTIVE, SignalState.TARGET1_HIT, SignalState.TRAILING_SL):
            # Check Stop Loss
            if sl > 0 and opt_price <= sl:
                return cls.transition(signal_id, status, SignalState.SL_HIT, f"Stop loss hit: {opt_price} <= {sl}")

            # Check Target 2
            if t2 > 0 and opt_price >= t2:
                return cls.transition(signal_id, status, SignalState.TARGET2_HIT, f"Target 2 hit: {opt_price} >= {t2}")

            # Check Target 1
            if status == SignalState.POSITION_ACTIVE and t1 > 0 and opt_price >= t1:
                return cls.transition(signal_id, status, SignalState.TARGET1_HIT, f"Target 1 hit: {opt_price} >= {t1}")

            # Move from TARGET1_HIT to TRAILING_SL
            if status == SignalState.TARGET1_HIT:
                return cls.transition(signal_id, status, SignalState.TRAILING_SL, "Trailing stop loss activated")

        # 4. SL_HIT or TARGET2_HIT -> EXIT
        if status in (SignalState.SL_HIT, SignalState.TARGET2_HIT, SignalState.EXIT_TRIGGERED):
            return cls.transition(signal_id, status, SignalState.EXIT, "Trade finalized")

        return None
