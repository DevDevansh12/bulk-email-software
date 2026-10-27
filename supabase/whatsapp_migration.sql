-- ============================================================================
-- WhatsApp Marketing & Bulk Messaging Migration
-- ============================================================================
-- Run this in the Supabase SQL Editor to enable WhatsApp features.
-- ============================================================================

-- 1. WhatsApp Configuration table
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_user_id ON whatsapp_configs(user_id);

-- 2. WhatsApp Message Templates table
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'en_US',
  category TEXT DEFAULT 'MARKETING',
  body_text TEXT NOT NULL,
  variables TEXT[],
  status TEXT DEFAULT 'APPROVED', -- APPROVED, PENDING, REJECTED
  meta_template_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_user_id ON whatsapp_templates(user_id);

-- 3. WhatsApp Campaigns table
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template_id UUID REFERENCES whatsapp_templates(id),
  status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_user_id ON whatsapp_campaigns(user_id);

-- 4. WhatsApp Recipients table
CREATE TABLE IF NOT EXISTS whatsapp_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'pending', -- pending, sent, delivered, read, failed
  wamid TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_recipients_campaign_id ON whatsapp_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_recipients_wamid ON whatsapp_recipients(wamid);

-- 5. Row Level Security
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp config"
  ON whatsapp_configs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own whatsapp templates"
  ON whatsapp_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own whatsapp campaigns"
  ON whatsapp_campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own whatsapp recipients"
  ON whatsapp_recipients FOR ALL USING (
    campaign_id IN (SELECT id FROM whatsapp_campaigns WHERE user_id = auth.uid())
  ) WITH CHECK (
    campaign_id IN (SELECT id FROM whatsapp_campaigns WHERE user_id = auth.uid())
  );
