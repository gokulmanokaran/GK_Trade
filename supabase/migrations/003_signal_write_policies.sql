-- ============================================================
-- OptionPulse — Migration 003: Signal Write Policies & Soft Delete
-- ============================================================

-- 1. Add updated_at column to signals (needed by soft-delete API)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 2. Allow server-side (service role) INSERT/UPDATE on signals
--    The service role key bypasses RLS by default in Supabase, but we
--    add explicit anon/service policies here for belt-and-suspenders.

-- Allow backend (service role) to insert new signals
DO $$
BEGIN
  CREATE POLICY "signals_insert"
    ON signals FOR INSERT WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow backend (service role) to update signals (e.g., status -> DELETED)
DO $$
BEGIN
  CREATE POLICY "signals_update"
    ON signals FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow backend (service role) to delete signals if needed
DO $$
BEGIN
  CREATE POLICY "signals_delete"
    ON signals FOR DELETE USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Same write policies for signal_events
DO $$
BEGIN
  CREATE POLICY "signal_events_insert"
    ON signal_events FOR INSERT WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "signal_events_update"
    ON signal_events FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Index on status to make DELETED filter fast
CREATE INDEX IF NOT EXISTS idx_signals_status_created
  ON signals(status, created_at DESC);
