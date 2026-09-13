-- OptionPulse PostgreSQL Production DDL Schema
-- Compatible with PostgreSQL 14+

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL DEFAULT 'trader',
    email VARCHAR(100) UNIQUE,
    initial_capital DOUBLE PRECISION DEFAULT 100000.0,
    current_capital DOUBLE PRECISION DEFAULT 100000.0,
    max_risk_per_trade_pct DOUBLE PRECISION DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_instruments (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    exchange VARCHAR(10) DEFAULT 'NSE',
    segment VARCHAR(10) DEFAULT 'INDEX',
    lot_size INTEGER DEFAULT 25,
    tick_size DOUBLE PRECISION DEFAULT 0.05,
    strike_step DOUBLE PRECISION DEFAULT 50.0,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON market_instruments(symbol);

CREATE TABLE IF NOT EXISTS expiries (
    id SERIAL PRIMARY KEY,
    instrument_symbol VARCHAR(20) NOT NULL,
    expiry_date VARCHAR(20) NOT NULL,
    is_monthly BOOLEAN DEFAULT FALSE,
    is_current BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_expiries_symbol_date ON expiries(instrument_symbol, expiry_date);

CREATE TABLE IF NOT EXISTS market_quotes (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    ltp DOUBLE PRECISION NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    prev_close DOUBLE PRECISION,
    change DOUBLE PRECISION,
    p_change DOUBLE PRECISION,
    volume BIGINT DEFAULT 0,
    vwap DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_source VARCHAR(50) DEFAULT 'COMPOSITE'
);
CREATE INDEX IF NOT EXISTS idx_quotes_symbol_time ON market_quotes(symbol, timestamp DESC);

CREATE TABLE IF NOT EXISTS option_chain_snapshots (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    expiry_date VARCHAR(20) NOT NULL,
    underlying_ltp DOUBLE PRECISION NOT NULL,
    pcr DOUBLE PRECISION DEFAULT 1.0,
    max_pain DOUBLE PRECISION,
    total_ce_oi BIGINT DEFAULT 0,
    total_pe_oi BIGINT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_source VARCHAR(50) DEFAULT 'COMPOSITE'
);
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time ON option_chain_snapshots(symbol, timestamp DESC);

CREATE TABLE IF NOT EXISTS option_chain_rows (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
    strike_price DOUBLE PRECISION NOT NULL,
    ce_ltp DOUBLE PRECISION DEFAULT 0.0,
    ce_change DOUBLE PRECISION DEFAULT 0.0,
    ce_volume BIGINT DEFAULT 0,
    ce_oi BIGINT DEFAULT 0,
    ce_change_oi BIGINT DEFAULT 0,
    ce_iv DOUBLE PRECISION DEFAULT 0.0,
    ce_bid DOUBLE PRECISION DEFAULT 0.0,
    ce_ask DOUBLE PRECISION DEFAULT 0.0,
    ce_delta DOUBLE PRECISION DEFAULT 0.0,
    ce_gamma DOUBLE PRECISION DEFAULT 0.0,
    ce_theta DOUBLE PRECISION DEFAULT 0.0,
    ce_vega DOUBLE PRECISION DEFAULT 0.0,
    pe_ltp DOUBLE PRECISION DEFAULT 0.0,
    pe_change DOUBLE PRECISION DEFAULT 0.0,
    pe_volume BIGINT DEFAULT 0,
    pe_oi BIGINT DEFAULT 0,
    pe_change_oi BIGINT DEFAULT 0,
    pe_iv DOUBLE PRECISION DEFAULT 0.0,
    pe_bid DOUBLE PRECISION DEFAULT 0.0,
    pe_ask DOUBLE PRECISION DEFAULT 0.0,
    pe_delta DOUBLE PRECISION DEFAULT 0.0,
    pe_gamma DOUBLE PRECISION DEFAULT 0.0,
    pe_theta DOUBLE PRECISION DEFAULT 0.0,
    pe_vega DOUBLE PRECISION DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_chain_rows_snapshot_strike ON option_chain_rows(snapshot_id, strike_price);

CREATE TABLE IF NOT EXISTS technical_indicators (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) DEFAULT '5m',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ema_9 DOUBLE PRECISION,
    ema_20 DOUBLE PRECISION,
    ema_50 DOUBLE PRECISION,
    ema_200 DOUBLE PRECISION,
    rsi_14 DOUBLE PRECISION,
    macd DOUBLE PRECISION,
    macd_signal DOUBLE PRECISION,
    macd_hist DOUBLE PRECISION,
    supertrend DOUBLE PRECISION,
    supertrend_direction VARCHAR(10) DEFAULT 'NEUTRAL',
    vwap DOUBLE PRECISION,
    atr_14 DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS signals (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    symbol VARCHAR(20) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    entry_low DOUBLE PRECISION NOT NULL,
    entry_high DOUBLE PRECISION NOT NULL,
    entry_trigger VARCHAR(100),
    stop_loss DOUBLE PRECISION NOT NULL,
    stop_loss_reason VARCHAR(200),
    target_1 DOUBLE PRECISION NOT NULL,
    target_2 DOUBLE PRECISION NOT NULL,
    target_3 DOUBLE PRECISION,
    exit_condition VARCHAR(200),
    risk_reward DOUBLE PRECISION DEFAULT 2.0,
    signal_score DOUBLE PRECISION DEFAULT 0.0,
    confidence DOUBLE PRECISION DEFAULT 0.0,
    signal_strength VARCHAR(20) DEFAULT 'MODERATE',
    market_bias VARCHAR(20) DEFAULT 'BULLISH',
    invalidation_level VARCHAR(100),
    reason TEXT,
    ai_explanation TEXT,
    status VARCHAR(30) DEFAULT 'ACTIVE',
    outcome VARCHAR(50),
    simulated_pnl DOUBLE PRECISION DEFAULT 0.0
);
CREATE INDEX IF NOT EXISTS idx_signals_symbol_time ON signals(symbol, timestamp DESC);

CREATE TABLE IF NOT EXISTS signal_components (
    id SERIAL PRIMARY KEY,
    signal_id INTEGER NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    trend_score DOUBLE PRECISION DEFAULT 0.0,
    momentum_score DOUBLE PRECISION DEFAULT 0.0,
    vwap_score DOUBLE PRECISION DEFAULT 0.0,
    price_action_score DOUBLE PRECISION DEFAULT 0.0,
    volume_score DOUBLE PRECISION DEFAULT 0.0,
    option_chain_score DOUBLE PRECISION DEFAULT 0.0,
    volatility_score DOUBLE PRECISION DEFAULT 0.0,
    risk_reward_score DOUBLE PRECISION DEFAULT 0.0,
    total_score DOUBLE PRECISION DEFAULT 0.0,
    details_json JSONB
);

CREATE TABLE IF NOT EXISTS support_resistance (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    major_support DOUBLE PRECISION NOT NULL,
    minor_support DOUBLE PRECISION NOT NULL,
    major_resistance DOUBLE PRECISION NOT NULL,
    minor_resistance DOUBLE PRECISION NOT NULL,
    pivot_point DOUBLE PRECISION,
    calculation_method VARCHAR(50) DEFAULT 'OI_AND_PRICE_ACTION'
);

CREATE TABLE IF NOT EXISTS paper_trades (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    symbol VARCHAR(20) NOT NULL,
    instrument VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    entry_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    quantity INTEGER DEFAULT 25,
    lots INTEGER DEFAULT 1,
    stop_loss DOUBLE PRECISION NOT NULL,
    target_1 DOUBLE PRECISION NOT NULL,
    target_2 DOUBLE PRECISION NOT NULL,
    trailing_sl DOUBLE PRECISION,
    exit_price DOUBLE PRECISION,
    exit_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'OPEN',
    pnl DOUBLE PRECISION DEFAULT 0.0,
    pnl_pct DOUBLE PRECISION DEFAULT 0.0,
    exit_reason VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS backtest_runs (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    strategy_name VARCHAR(100) DEFAULT 'OptionPulse Standard Engine',
    start_date VARCHAR(20) NOT NULL,
    end_date VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) DEFAULT '5m',
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate DOUBLE PRECISION DEFAULT 0.0,
    avg_win DOUBLE PRECISION DEFAULT 0.0,
    avg_loss DOUBLE PRECISION DEFAULT 0.0,
    profit_factor DOUBLE PRECISION DEFAULT 0.0,
    max_drawdown DOUBLE PRECISION DEFAULT 0.0,
    net_simulated_pnl DOUBLE PRECISION DEFAULT 0.0,
    consecutive_wins INTEGER DEFAULT 0,
    consecutive_losses INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backtest_trades (
    id SERIAL PRIMARY KEY,
    backtest_id INTEGER NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    instrument VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    entry_time VARCHAR(30) NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_time VARCHAR(30) NOT NULL,
    exit_price DOUBLE PRECISION NOT NULL,
    pnl DOUBLE PRECISION DEFAULT 0.0,
    pnl_pct DOUBLE PRECISION DEFAULT 0.0,
    exit_reason VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(10) DEFAULT 'INFO',
    module VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata_json JSONB
);

CREATE TABLE IF NOT EXISTS provider_health (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'HEALTHY',
    latency_ms DOUBLE PRECISION DEFAULT 0.0,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
