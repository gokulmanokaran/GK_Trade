-- ============================================================
-- OptionPulse — Migration 004: User Isolation, Soft/User Delete & Performance Indexes
-- ============================================================

-- 1. Add user_id column to signals (nullable for system/market-wide signals)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 2. Create user_deleted_signals table for per-user signal deletion isolation
CREATE TABLE IF NOT EXISTS user_deleted_signals (
  user_id UUID NOT NULL,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, signal_id)
);

-- 3. High-performance indexes for fast signal history queries & filtering
CREATE INDEX IF NOT EXISTS idx_signals_created_at_desc ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status_created ON signals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user_created ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type_created ON signals(signal_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_deleted_signals_lookup ON user_deleted_signals(user_id, signal_id);

-- 4. Enable Row Level Security on user_deleted_signals
ALTER TABLE user_deleted_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "user_deleted_signals_select"
    ON user_deleted_signals FOR SELECT USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "user_deleted_signals_insert"
    ON user_deleted_signals FOR INSERT WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "user_deleted_signals_delete"
    ON user_deleted_signals FOR DELETE USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
