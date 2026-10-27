-- ============================================================================
-- Analytics, Tracking & Audience Management Migration
-- ============================================================================
-- Run this in the Supabase SQL Editor to enable tracking and audience features.
-- ============================================================================

-- 1. Add tracking columns to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_opens INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0;

-- 2. Add tracking columns to campaign_recipients table
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;

-- 3. Audiences table
CREATE TABLE IF NOT EXISTS audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audiences_user_id ON audiences(user_id);

-- 4. Audience Contacts table
CREATE TABLE IF NOT EXISTS audience_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id UUID NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'subscribed', -- 'subscribed', 'unsubscribed', 'bounced'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_contacts_audience_id ON audience_contacts(audience_id);
CREATE INDEX IF NOT EXISTS idx_audience_contacts_email ON audience_contacts(email);

-- 5. Row Level Security for Audiences
ALTER TABLE audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own audiences"
  ON audiences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own audience contacts"
  ON audience_contacts FOR ALL
  USING (
    audience_id IN (SELECT id FROM audiences WHERE user_id = auth.uid())
  )
  WITH CHECK (
    audience_id IN (SELECT id FROM audiences WHERE user_id = auth.uid())
  );
