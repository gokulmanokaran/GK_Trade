"""
SQLAlchemy ORM Models for OptionPulse
Defines all 16 required tables covering market instruments, quotes, option chains,
Greeks, signals, technical indicators, paper trading, backtesting, and settings.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, default="trader")
    email = Column(String(100), unique=True, nullable=True)
    initial_capital = Column(Float, default=100000.0)
    current_capital = Column(Float, default=100000.0)
    max_risk_per_trade_pct = Column(Float, default=1.0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class MarketInstrument(Base):
    __tablename__ = "market_instruments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    exchange = Column(String(10), default="NSE")
    segment = Column(String(10), default="INDEX")  # INDEX or EQUITY
    lot_size = Column(Integer, default=25)
    tick_size = Column(Float, default=0.05)
    strike_step = Column(Float, default=50.0)
    is_active = Column(Boolean, default=True)


class Expiry(Base):
    __tablename__ = "expiries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_symbol = Column(String(20), index=True, nullable=False)
    expiry_date = Column(String(20), index=True, nullable=False)  # format: 'YYYY-MM-DD' or 'DD-Mon-YYYY'
    is_monthly = Column(Boolean, default=False)
    is_current = Column(Boolean, default=False)


class MarketQuote(Base):
    __tablename__ = "market_quotes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), index=True, nullable=False)
    ltp = Column(Float, nullable=False)
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=True)
    prev_close = Column(Float, nullable=True)
    change = Column(Float, nullable=True)
    p_change = Column(Float, nullable=True)
    volume = Column(Integer, default=0)
    vwap = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=utcnow, index=True)
    data_source = Column(String(50), default="COMPOSITE")


class OptionChainSnapshot(Base):
    __tablename__ = "option_chain_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), index=True, nullable=False)
    expiry_date = Column(String(20), index=True, nullable=False)
    underlying_ltp = Column(Float, nullable=False)
    pcr = Column(Float, default=1.0)
    max_pain = Column(Float, nullable=True)
    total_ce_oi = Column(Integer, default=0)
    total_pe_oi = Column(Integer, default=0)
    timestamp = Column(DateTime, default=utcnow, index=True)
    data_source = Column(String(50), default="COMPOSITE")

    rows = relationship("OptionChainRow", back_populates="snapshot", cascade="all, delete-orphan")


class OptionChainRow(Base):
    __tablename__ = "option_chain_rows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(Integer, ForeignKey("option_chain_snapshots.id"), index=True, nullable=False)
    strike_price = Column(Float, nullable=False, index=True)

    # Call Side
    ce_ltp = Column(Float, default=0.0)
    ce_change = Column(Float, default=0.0)
    ce_volume = Column(Integer, default=0)
    ce_oi = Column(Integer, default=0)
    ce_change_oi = Column(Integer, default=0)
    ce_iv = Column(Float, default=0.0)
    ce_bid = Column(Float, default=0.0)
    ce_ask = Column(Float, default=0.0)
    ce_delta = Column(Float, default=0.0)
    ce_gamma = Column(Float, default=0.0)
    ce_theta = Column(Float, default=0.0)
    ce_vega = Column(Float, default=0.0)

    # Put Side
    pe_ltp = Column(Float, default=0.0)
    pe_change = Column(Float, default=0.0)
    pe_volume = Column(Integer, default=0)
    pe_oi = Column(Integer, default=0)
    pe_change_oi = Column(Integer, default=0)
    pe_iv = Column(Float, default=0.0)
    pe_bid = Column(Float, default=0.0)
    pe_ask = Column(Float, default=0.0)
    pe_delta = Column(Float, default=0.0)
    pe_gamma = Column(Float, default=0.0)
    pe_theta = Column(Float, default=0.0)
    pe_vega = Column(Float, default=0.0)

    snapshot = relationship("OptionChainSnapshot", back_populates="rows")


class TechnicalIndicator(Base):
    __tablename__ = "technical_indicators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), index=True, nullable=False)
    timeframe = Column(String(10), default="5m")
    timestamp = Column(DateTime, default=utcnow, index=True)
    ema_9 = Column(Float, nullable=True)
    ema_20 = Column(Float, nullable=True)
    ema_50 = Column(Float, nullable=True)
    ema_200 = Column(Float, nullable=True)
    rsi_14 = Column(Float, nullable=True)
    macd = Column(Float, nullable=True)
    macd_signal = Column(Float, nullable=True)
    macd_hist = Column(Float, nullable=True)
    supertrend = Column(Float, nullable=True)
    supertrend_direction = Column(String(10), default="NEUTRAL")
    vwap = Column(Float, nullable=True)
    atr_14 = Column(Float, nullable=True)


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=utcnow, index=True)
    symbol = Column(String(20), index=True, nullable=False)
    instrument = Column(String(50), nullable=False)  # e.g., 'NIFTY 25400 CE'
    direction = Column(String(20), nullable=False)   # CALL BUY, PUT BUY, NO TRADE
    entry_low = Column(Float, nullable=False)
    entry_high = Column(Float, nullable=False)
    entry_trigger = Column(String(100), nullable=True)
    stop_loss = Column(Float, nullable=False)
    stop_loss_reason = Column(String(200), nullable=True)
    target_1 = Column(Float, nullable=False)
    target_2 = Column(Float, nullable=False)
    target_3 = Column(Float, nullable=True)
    exit_condition = Column(String(200), nullable=True)
    risk_reward = Column(Float, default=2.0)
    signal_score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    signal_strength = Column(String(20), default="MODERATE") # NO TRADE, WEAK, MODERATE, STRONG, VERY STRONG
    market_bias = Column(String(20), default="BULLISH")     # BULLISH, BEARISH, NEUTRAL
    invalidation_level = Column(String(100), nullable=True)
    reason = Column(Text, nullable=True)
    ai_explanation = Column(Text, nullable=True)
    status = Column(String(30), default="ACTIVE")          # ACTIVE, TARGET 1 HIT, TARGET 2 HIT, SL HIT, INVALIDATED, EXITED
    outcome = Column(String(50), nullable=True)
    simulated_pnl = Column(Float, default=0.0)

    components = relationship("SignalComponent", back_populates="signal", uselist=False, cascade="all, delete-orphan")


class SignalComponent(Base):
    __tablename__ = "signal_components"

    id = Column(Integer, primary_key=True, autoincrement=True)
    signal_id = Column(Integer, ForeignKey("signals.id"), index=True, nullable=False)
    trend_score = Column(Float, default=0.0)          # 0-20
    momentum_score = Column(Float, default=0.0)       # 0-15
    vwap_score = Column(Float, default=0.0)           # 0-10
    price_action_score = Column(Float, default=0.0)   # 0-15
    volume_score = Column(Float, default=0.0)         # 0-10
    option_chain_score = Column(Float, default=0.0)   # 0-20
    volatility_score = Column(Float, default=0.0)     # 0-5
    risk_reward_score = Column(Float, default=0.0)    # 0-5
    total_score = Column(Float, default=0.0)          # 0-100
    details_json = Column(JSON, nullable=True)

    signal = relationship("Signal", back_populates="components")


class SupportResistance(Base):
    __tablename__ = "support_resistance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), index=True, nullable=False)
    timestamp = Column(DateTime, default=utcnow, index=True)
    major_support = Column(Float, nullable=False)
    minor_support = Column(Float, nullable=False)
    major_resistance = Column(Float, nullable=False)
    minor_resistance = Column(Float, nullable=False)
    pivot_point = Column(Float, nullable=True)
    calculation_method = Column(String(50), default="OI_AND_PRICE_ACTION")


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, default=1)
    symbol = Column(String(20), index=True, nullable=False)
    instrument = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False)   # BUY, SELL
    entry_price = Column(Float, nullable=False)
    entry_time = Column(DateTime, default=utcnow)
    quantity = Column(Integer, default=25)
    lots = Column(Integer, default=1)
    stop_loss = Column(Float, nullable=False)
    target_1 = Column(Float, nullable=False)
    target_2 = Column(Float, nullable=False)
    trailing_sl = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="OPEN")      # OPEN, CLOSED
    pnl = Column(Float, default=0.0)
    pnl_pct = Column(Float, default=0.0)
    exit_reason = Column(String(100), nullable=True)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False)
    strategy_name = Column(String(100), default="OptionPulse Standard Engine")
    start_date = Column(String(20), nullable=False)
    end_date = Column(String(20), nullable=False)
    timeframe = Column(String(10), default="5m")
    total_trades = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    win_rate = Column(Float, default=0.0)
    avg_win = Column(Float, default=0.0)
    avg_loss = Column(Float, default=0.0)
    profit_factor = Column(Float, default=0.0)
    max_drawdown = Column(Float, default=0.0)
    net_simulated_pnl = Column(Float, default=0.0)
    consecutive_wins = Column(Integer, default=0)
    consecutive_losses = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    trades = relationship("BacktestTrade", back_populates="run", cascade="all, delete-orphan")


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    backtest_id = Column(Integer, ForeignKey("backtest_runs.id"), nullable=False, index=True)
    instrument = Column(String(50), nullable=False)
    direction = Column(String(20), nullable=False)
    entry_time = Column(String(30), nullable=False)
    entry_price = Column(Float, nullable=False)
    exit_time = Column(String(30), nullable=False)
    exit_price = Column(Float, nullable=False)
    pnl = Column(Float, default=0.0)
    pnl_pct = Column(Float, default=0.0)
    exit_reason = Column(String(100), nullable=True)

    run = relationship("BacktestRun", back_populates="trades")


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=utcnow, index=True)
    level = Column(String(10), default="INFO")
    module = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True)


class ProviderHealth(Base):
    __tablename__ = "provider_health"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_name = Column(String(50), unique=True, nullable=False)
    status = Column(String(20), default="HEALTHY")   # HEALTHY, DEGRADED, DOWN
    latency_ms = Column(Float, default=0.0)
    last_success_at = Column(DateTime, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    request_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
