-- ============================================================
-- OptionPulse — Safe Re-run Migration.
-- Uses IF NOT EXISTS / exception handlers everywhere.
-- Safe to run even if tables already exist.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── STRATEGY VERSIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  weights JSONB NOT NULL DEFAULT '{}',
  min_score INTEGER NOT NULL DEFAULT 70,
  min_rr NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  time_filters JSONB NOT NULL DEFAULT '{}',
  regime_filters JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  capital NUMERIC(12,2) NOT NULL DEFAULT 100000,
  risk_per_trade_pct NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  max_daily_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  max_trades_per_day INTEGER NOT NULL DEFAULT 3,
  min_signal_score INTEGER NOT NULL DEFAULT 75,
  min_rr NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  notify_new_signal BOOLEAN NOT NULL DEFAULT TRUE,
  notify_entry BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sl BOOLEAN NOT NULL DEFAULT TRUE,
  notify_target1 BOOLEAN NOT NULL DEFAULT TRUE,
  notify_target2 BOOLEAN NOT NULL DEFAULT TRUE,
  notify_exit BOOLEAN NOT NULL DEFAULT TRUE,
  notify_invalidated BOOLEAN NOT NULL DEFAULT TRUE,
  notify_data_failure BOOLEAN NOT NULL DEFAULT FALSE,
  notify_daily_summary BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MARKET DATA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  ltp NUMERIC(10,2) NOT NULL,
  open NUMERIC(10,2),
  high NUMERIC(10,2),
  low NUMERIC(10,2),
  prev_close NUMERIC(10,2),
  change NUMERIC(10,2),
  change_pct NUMERIC(7,4),
  volume BIGINT,
  vwap NUMERIC(10,2),
  provider TEXT NOT NULL,
  data_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS option_chain_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  expiry DATE NOT NULL,
  underlying_ltp NUMERIC(10,2) NOT NULL,
  atm_strike INTEGER NOT NULL,
  pcr NUMERIC(7,4),
  max_pain INTEGER,
  total_call_oi BIGINT,
  total_put_oi BIGINT,
  provider TEXT NOT NULL,
  data_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS option_chain_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id UUID NOT NULL REFERENCES option_chain_snapshots(id) ON DELETE CASCADE,
  strike INTEGER NOT NULL,
  ce_ltp NUMERIC(10,2), ce_oi BIGINT, ce_oi_change BIGINT,
  ce_volume BIGINT, ce_iv NUMERIC(7,4), ce_delta NUMERIC(7,4),
  ce_gamma NUMERIC(10,6), ce_theta NUMERIC(10,4), ce_vega NUMERIC(10,4),
  ce_bid NUMERIC(10,2), ce_ask NUMERIC(10,2),
  pe_ltp NUMERIC(10,2), pe_oi BIGINT, pe_oi_change BIGINT,
  pe_volume BIGINT, pe_iv NUMERIC(7,4), pe_delta NUMERIC(7,4),
  pe_gamma NUMERIC(10,6), pe_theta NUMERIC(10,4), pe_vega NUMERIC(10,4),
  pe_bid NUMERIC(10,2), pe_ask NUMERIC(10,2),
  is_atm BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── TECHNICAL INDICATORS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS technical_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  timeframe TEXT NOT NULL DEFAULT '5m',
  ema9 NUMERIC(10,2), ema20 NUMERIC(10,2), ema50 NUMERIC(10,2), ema200 NUMERIC(10,2),
  vwap NUMERIC(10,2), rsi14 NUMERIC(7,4),
  macd NUMERIC(10,4), macd_signal NUMERIC(10,4), macd_hist NUMERIC(10,4),
  atr14 NUMERIC(10,4), supertrend NUMERIC(10,2), supertrend_direction TEXT,
  bb_upper NUMERIC(10,2), bb_lower NUMERIC(10,2), bb_mid NUMERIC(10,2),
  prev_day_high NUMERIC(10,2), prev_day_low NUMERIC(10,2),
  opening_range_high NUMERIC(10,2), opening_range_low NUMERIC(10,2),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MARKET REGIMES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_regimes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  regime TEXT NOT NULL,
  confidence NUMERIC(5,2),
  reason TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SIGNALS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  strategy_version_id UUID REFERENCES strategy_versions(id),
  signal_type TEXT NOT NULL,
  expiry DATE,
  strike INTEGER,
  option_type TEXT,
  nifty_price NUMERIC(10,2),
  entry_low NUMERIC(10,2),
  entry_high NUMERIC(10,2),
  entry_trigger TEXT,
  sl NUMERIC(10,2),
  sl_reason TEXT,
  target1 NUMERIC(10,2),
  target2 NUMERIC(10,2),
  target3 NUMERIC(10,2),
  rr_ratio NUMERIC(6,3),
  signal_score INTEGER,
  confidence NUMERIC(5,2),
  regime TEXT,
  trend_direction TEXT,
  technical_reason TEXT,
  oi_reason TEXT,
  chain_reason TEXT,
  liquidity_ok BOOLEAN,
  no_trade_reason TEXT,
  status TEXT NOT NULL DEFAULT 'WATCH',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  triggered_at TIMESTAMPTZ,
  exited_at TIMESTAMPTZ,
  exit_price NUMERIC(10,2),
  exit_reason TEXT,
  max_favorable_excursion NUMERIC(10,2),
  max_adverse_excursion NUMERIC(10,2),
  simulated_pnl NUMERIC(10,2)
);

-- Add updated_at if table already existed without it
ALTER TABLE signals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── SIGNAL COMPONENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  data JSONB
);

-- ── SIGNAL EVENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  nifty_price NUMERIC(10,2),
  option_price NUMERIC(10,2),
  reason TEXT,
  idempotency_key TEXT UNIQUE,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DAILY SUMMARIES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  total_signals INTEGER NOT NULL DEFAULT 0,
  triggered_signals INTEGER NOT NULL DEFAULT 0,
  target1_hits INTEGER NOT NULL DEFAULT 0,
  target2_hits INTEGER NOT NULL DEFAULT 0,
  sl_hits INTEGER NOT NULL DEFAULT 0,
  not_triggered INTEGER NOT NULL DEFAULT 0,
  no_trade_count INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(5,2),
  simulated_pnl NUMERIC(10,2),
  max_drawdown NUMERIC(10,2),
  profit_factor NUMERIC(7,3),
  best_signal_id UUID REFERENCES signals(id),
  worst_signal_id UUID REFERENCES signals(id),
  regime TEXT,
  summary_text TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PAPER TRADES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  signal_id UUID REFERENCES signals(id),
  instrument TEXT NOT NULL DEFAULT 'NIFTY',
  strike INTEGER NOT NULL,
  option_type TEXT NOT NULL,
  expiry DATE NOT NULL,
  entry_price NUMERIC(10,2) NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  sl NUMERIC(10,2) NOT NULL,
  target1 NUMERIC(10,2) NOT NULL,
  target2 NUMERIC(10,2),
  exit_price NUMERIC(10,2),
  exit_time TIMESTAMPTZ,
  exit_reason TEXT,
  quantity INTEGER NOT NULL DEFAULT 50,
  pnl NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BACKTESTING ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backtest_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_version_id UUID REFERENCES strategy_versions(id),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  training_from DATE, training_to DATE,
  validation_from DATE, validation_to DATE,
  total_trades INTEGER, winning_trades INTEGER, losing_trades INTEGER,
  win_rate NUMERIC(5,2), avg_win NUMERIC(10,2), avg_loss NUMERIC(10,2),
  profit_factor NUMERIC(7,3), expectancy NUMERIC(10,4),
  max_drawdown NUMERIC(10,2),
  max_consecutive_wins INTEGER, max_consecutive_losses INTEGER,
  sharpe_ratio NUMERIC(7,4), total_pnl NUMERIC(12,2),
  regime_performance JSONB, monthly_performance JSONB, parameters_used JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS backtest_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  entry_time TIMESTAMPTZ, exit_time TIMESTAMPTZ,
  strike INTEGER, option_type TEXT,
  entry_price NUMERIC(10,2), exit_price NUMERIC(10,2),
  sl NUMERIC(10,2), target1 NUMERIC(10,2), target2 NUMERIC(10,2),
  signal_score INTEGER, regime TEXT, exit_reason TEXT,
  pnl NUMERIC(10,2), rr_achieved NUMERIC(6,3),
  max_favorable NUMERIC(10,2), max_adverse NUMERIC(10,2)
);

-- ── NOTIFICATION LOG ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_event_id UUID REFERENCES signal_events(id),
  subscription_id UUID REFERENCES notification_subscriptions(id),
  event_type TEXT NOT NULL,
  title TEXT, body TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING',
  error TEXT, sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROVIDER HEALTH ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SYSTEM LOGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL,
  category TEXT,
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES (all IF NOT EXISTS) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signals_created_at    ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_instrument    ON signals(instrument);
CREATE INDEX IF NOT EXISTS idx_signals_status        ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_strategy      ON signals(strategy_version_id);
CREATE INDEX IF NOT EXISTS idx_signals_status_created ON signals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_events_signal_id ON signal_events(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_events_type    ON signal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_signal_events_created ON signal_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chain_snapshots_ts    ON option_chain_snapshots(data_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chain_rows_snapshot   ON option_chain_rows(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date  ON daily_summaries(date DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_created  ON paper_trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_quotes_ts      ON market_quotes(data_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_market_quotes_inst    ON market_quotes(instrument);
CREATE INDEX IF NOT EXISTS idx_system_logs_created   ON system_logs(created_at DESC);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE signals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_chain_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_chain_rows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs              ENABLE ROW LEVEL SECURITY;

-- ── POLICIES (all wrapped in DO blocks to skip if exists) ────
DO $$ BEGIN CREATE POLICY "signals_read"   ON signals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "signals_insert" ON signals FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "signals_update" ON signals FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "signals_delete" ON signals FOR DELETE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "signal_events_read"   ON signal_events FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "signal_events_insert" ON signal_events FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "signal_events_update" ON signal_events FOR UPDATE USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "daily_summaries_read" ON daily_summaries FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "market_quotes_read"   ON market_quotes   FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "chain_snapshots_read" ON option_chain_snapshots FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "chain_rows_read"      ON option_chain_rows      FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "notif_sub_insert" ON notification_subscriptions FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "notif_sub_select" ON notification_subscriptions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "paper_trades_all" ON paper_trades FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── MONITOR EXECUTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitor_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id TEXT NOT NULL UNIQUE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  market_status TEXT NOT NULL,
  data_provider TEXT,
  data_timestamp TIMESTAMPTZ,
  data_age_seconds NUMERIC(8,2),
  signal_generated BOOLEAN DEFAULT FALSE,
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  events_generated TEXT[] DEFAULT '{}',
  notifications_sent INTEGER DEFAULT 0,
  errors TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATION DELIVERIES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  signal_event_id UUID REFERENCES signal_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  delivery_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING',
  subscribers_count INTEGER DEFAULT 0,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitor_executions_created   ON monitor_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_executions_status    ON monitor_executions(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_key  ON notification_deliveries(delivery_key);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_sig  ON notification_deliveries(signal_id, event_type);

ALTER TABLE monitor_executions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "monitor_executions_read"      ON monitor_executions      FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "notification_deliveries_read" ON notification_deliveries FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: Default strategy version (skip if already seeded) ──
INSERT INTO strategy_versions (name, version, parameters, weights, min_score, min_rr, is_active)
SELECT 'NIFTY-MULTICONFLUENCE', 'V1.0',
  '{"time_filter_start":"09:20","time_filter_end":"15:00","rsi_bull_threshold":50,"rsi_bear_threshold":50,"volume_spike_multiplier":1.5,"atr_multiplier_sl":1.5,"min_liquidity_oi":50000,"min_liquidity_volume":1000,"max_bid_ask_spread_pct":5.0,"avoid_choppy_adx_threshold":20,"min_days_to_expiry":1,"max_days_to_expiry":21}',
  '{"trend":20,"price_action":15,"vwap":10,"momentum":10,"volume":10,"option_chain":15,"oi":10,"volatility":5,"liquidity":5}',
  75, 1.5, true
WHERE NOT EXISTS (SELECT 1 FROM strategy_versions WHERE name = 'NIFTY-MULTICONFLUENCE');
