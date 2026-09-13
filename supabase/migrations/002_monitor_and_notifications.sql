-- ============================================================
-- OptionPulse — Migration 002: Monitor Executions & Notifications
-- ============================================================

-- 1. MONITOR EXECUTIONS TABLE
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
  status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING, SUCCESS, FAILED, SKIPPED, DATA_STALE
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. NOTIFICATION DELIVERIES TABLE (Deduplication store)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  signal_event_id UUID REFERENCES signal_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  delivery_key TEXT NOT NULL UNIQUE, -- signal_id + '_' + event_type (idempotent deduplication)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING', -- SENT, FAILED, PENDING, SKIPPED
  subscribers_count INTEGER DEFAULT 0,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ENSURE IDEMPOTENCY KEY UNIQUE CONSTRAINT ON signal_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_signal_events_idempotency_key'
  ) THEN
    ALTER TABLE signal_events ADD CONSTRAINT uq_signal_events_idempotency_key UNIQUE (idempotency_key);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_monitor_executions_created ON monitor_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_executions_status ON monitor_executions(status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_key ON notification_deliveries(delivery_key);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_signal ON notification_deliveries(signal_id, event_type);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_instrument ON signals(instrument);
CREATE INDEX IF NOT EXISTS idx_signal_events_signal_id ON signal_events(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_events_type ON signal_events(event_type);

-- 5. ROW LEVEL SECURITY
ALTER TABLE monitor_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Allow public read of monitor executions & notification logs
DO $$
BEGIN
  CREATE POLICY "monitor_executions_read" ON monitor_executions FOR SELECT USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "notification_deliveries_read" ON notification_deliveries FOR SELECT USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
