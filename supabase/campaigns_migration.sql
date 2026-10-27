-- ============================================================================
-- Campaign Persistence Tables for Supabase (Postgres)
-- ============================================================================
-- Run this in the Supabase SQL Editor to create the campaigns tables.
-- These tables store campaign metadata and per-recipient delivery results.
-- ============================================================================

-- Campaign status enum
CREATE TYPE campaign_status AS ENUM ('pending', 'sending', 'completed', 'failed');
CREATE TYPE recipient_status AS ENUM ('pending', 'sent', 'failed');

-- ── campaigns table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      campaign_status NOT NULL DEFAULT 'pending',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count  INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user-scoped queries
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- ── campaign_recipients table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  status      recipient_status NOT NULL DEFAULT 'pending',
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast campaign lookups
CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);

-- ── Auto-update updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Users can only see their own campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can CRUD their own campaigns
CREATE POLICY "Users manage own campaigns"
  ON campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can see recipients of their own campaigns
CREATE POLICY "Users view own campaign recipients"
  ON campaign_recipients FOR ALL
  USING (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
  );

-- ── Service role bypass ─────────────────────────────────────────────────────
-- The service_role key (supabaseAdmin) bypasses RLS, so server-side
-- operations work without additional policies.
