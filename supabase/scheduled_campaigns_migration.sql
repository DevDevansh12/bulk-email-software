-- ============================================================================
-- Scheduled Campaigns Migration
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER running campaigns_migration.sql.
-- Adds support for deferred/scheduled campaigns that are processed by the
-- cron job endpoint rather than sent immediately via SSE.
-- ============================================================================

-- Step 1: Add 'scheduled' value to the campaign_status enum
-- (Postgres requires ALTER TYPE — wrap in DO block to be safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'scheduled'
      AND enumtypid = 'campaign_status'::regtype
  ) THEN
    ALTER TYPE campaign_status ADD VALUE 'scheduled' BEFORE 'pending';
  END IF;
END;
$$;

-- Step 2: Add scheduled_at column to campaigns table
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Step 3: Index for fast cron queries
--   Composite index on (status, scheduled_at) efficiently serves the cron query:
--   WHERE status = 'scheduled' AND scheduled_at <= now()
--
--   NOTE: We intentionally omit a partial WHERE clause here because Postgres does
--   not allow referencing a newly-added enum value in the same transaction that
--   added it (ERROR 55P04). The plain composite index is equally efficient.
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled
  ON campaigns(status, scheduled_at);

-- Step 4: Cron job audit table
--   Each cron execution is logged here so you can review history in Supabase.
CREATE TABLE IF NOT EXISTS cron_job_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL DEFAULT 'unknown',
  campaigns_processed INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER,
  error         TEXT,
  results       JSONB
);

-- Index for recent-first queries
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_triggered_at
  ON cron_job_runs(triggered_at DESC);

-- Step 5: Add attachments column to campaigns table
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS attachments JSONB;

-- ── Notes ────────────────────────────────────────────────────────────────────
-- • The cron_job_runs table uses the service_role key (supabaseAdmin) from the
--   server, so no RLS policies are needed for the audit log.
-- • The campaigns table already has RLS enabled — scheduled campaigns are
--   still owned by the creating user and visible only to them.
-- • After applying this migration, restart your server and verify:
--     POST /api/v1/cron/process  →  { processed: 0 }  (no pending campaigns)
