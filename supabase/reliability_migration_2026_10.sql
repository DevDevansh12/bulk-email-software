-- ============================================================================
-- Reliability Migration (2026-10): SMTP, duplicates, WhatsApp, analytics
-- ============================================================================
-- Run in the Supabase SQL Editor AFTER all earlier migrations:
--   campaigns_migration.sql, scheduled_campaigns_migration.sql,
--   analytics_and_audiences_migration.sql, smtp_settings_migration.sql,
--   whatsapp_migration.sql, email_templates_migration.sql
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / guarded updates).
-- The whole script runs in one transaction — if any step fails, nothing changes.
--
-- BEFORE RUNNING (optional) — see what the de-duplication steps will touch:
--
--   -- Duplicate contacts inside the same audience (case/whitespace-insensitive)
--   SELECT audience_id, lower(btrim(email)) AS email, count(*)
--   FROM audience_contacts GROUP BY 1, 2 HAVING count(*) > 1;
--
--   -- Users with more than one WhatsApp config row
--   SELECT user_id, count(*) FROM whatsapp_configs GROUP BY 1 HAVING count(*) > 1;
-- ============================================================================

BEGIN;

-- ── 1. Email campaigns ──────────────────────────────────────────────────────

-- Campaign-level failure reason shown in the UI (e.g. "SMTP authentication failed")
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Unique opens/clicks (recipients with ≥1 event). total_opens/total_clicks stay raw counters.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unique_opens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unique_clicks INTEGER NOT NULL DEFAULT 0;

UPDATE campaigns c SET
  unique_opens = (
    SELECT count(*) FROM campaign_recipients r
    WHERE r.campaign_id = c.id AND (r.opened_at IS NOT NULL OR COALESCE(r.open_count, 0) > 0)
  ),
  unique_clicks = (
    SELECT count(*) FROM campaign_recipients r
    WHERE r.campaign_id = c.id AND (r.clicked_at IS NOT NULL OR COALESCE(r.click_count, 0) > 0)
  );

-- Per-recipient merge variables, so scheduled campaigns keep custom CSV columns
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS merge_data JSONB;

-- Keyset pagination used by the sender: WHERE campaign_id = ? AND status = 'pending' ORDER BY id
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status_id
  ON campaign_recipients (campaign_id, status, id);

-- NOTE: no unique constraint on campaign_recipients(campaign_id, email): historical
-- campaigns may legitimately contain repeats. New campaigns are de-duplicated by the
-- server before insert, and every status update targets the recipient's unique id.

-- ── 2. Audience contacts: one row per address per audience ──────────────────

-- 2a. Normalize stored addresses (trim + lower-case) — matches the app's comparison rule
UPDATE audience_contacts
SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

-- 2b. Merge duplicates into the earliest row of each (audience, email) group:
--     keep the first non-empty name and the MOST RESTRICTIVE status, so an
--     unsubscribe or bounce recorded on any duplicate is never lost.
WITH groups AS (
  SELECT
    audience_id,
    email,
    (array_agg(id ORDER BY created_at NULLS LAST, id))[1] AS keeper_id,
    (array_agg(name ORDER BY created_at NULLS LAST, id) FILTER (WHERE name IS NOT NULL AND btrim(name) <> ''))[1] AS merged_name,
    CASE
      WHEN bool_or(status = 'bounced') THEN 'bounced'
      WHEN bool_or(status = 'unsubscribed') THEN 'unsubscribed'
      ELSE 'subscribed'
    END AS merged_status
  FROM audience_contacts
  GROUP BY audience_id, email
  HAVING count(*) > 1
)
UPDATE audience_contacts ac
SET name = COALESCE(NULLIF(btrim(ac.name), ''), g.merged_name),
    status = g.merged_status
FROM groups g
WHERE ac.id = g.keeper_id;

-- 2c. Remove the now-redundant duplicates (only within the same audience —
--     contacts in different audiences are never merged)
DELETE FROM audience_contacts a
USING audience_contacts b
WHERE a.audience_id = b.audience_id
  AND a.email = b.email
  AND (COALESCE(a.created_at, 'infinity'::timestamptz), a.id) > (COALESCE(b.created_at, 'infinity'::timestamptz), b.id);

-- 2d. Enforce it going forward
CREATE UNIQUE INDEX IF NOT EXISTS audience_contacts_audience_email_key
  ON audience_contacts (audience_id, email);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audience_contacts_email_normalized') THEN
    ALTER TABLE audience_contacts
      ADD CONSTRAINT audience_contacts_email_normalized CHECK (email = lower(btrim(email)));
  END IF;
END;
$$;

-- 2e. Recompute stored counts (the old import added counts without checking duplicates)
UPDATE audiences a
SET contact_count = (SELECT count(*) FROM audience_contacts c WHERE c.audience_id = a.id);

-- ── 3. WhatsApp configuration ───────────────────────────────────────────────

-- "Saved" vs "verified with Meta" are separate states
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS verified_phone_number TEXT;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS verified_name TEXT;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS last_verification_error TEXT;

-- One config per user: keep the most recently updated row
DELETE FROM whatsapp_configs a
USING whatsapp_configs b
WHERE a.user_id = b.user_id
  AND (COALESCE(a.updated_at, a.created_at, '-infinity'::timestamptz), a.id)
    < (COALESCE(b.updated_at, b.created_at, '-infinity'::timestamptz), b.id);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_configs_user_id_key ON whatsapp_configs (user_id);

-- ── 4. WhatsApp templates: only Meta-synced templates can be APPROVED ───────

ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS parameter_format TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS components JSONB;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE whatsapp_templates ALTER COLUMN status SET DEFAULT 'LOCAL_DRAFT';

-- Rows created locally were labeled APPROVED without Meta ever seeing them
UPDATE whatsapp_templates SET status = 'LOCAL_DRAFT' WHERE meta_template_id IS NULL;

-- Upsert target for "Sync from Meta" (NULLs are distinct, so local drafts are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_user_meta_id_key
  ON whatsapp_templates (user_id, meta_template_id);

-- ── 5. WhatsApp campaigns & recipients ──────────────────────────────────────

ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS message_mode TEXT;      -- 'template' | 'text'
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS template_language TEXT;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS body_text TEXT;

ALTER TABLE whatsapp_recipients ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE whatsapp_recipients ADD COLUMN IF NOT EXISTS variables JSONB;

-- Old "simulation mode" stored fake message ids and counted them as sent.
-- Re-label those campaigns/recipients so they never show as real deliveries.
UPDATE whatsapp_campaigns c
SET is_simulation = TRUE,
    error_message = COALESCE(c.error_message, 'Simulation only — no WhatsApp messages were sent.')
WHERE EXISTS (
  SELECT 1 FROM whatsapp_recipients r
  WHERE r.campaign_id = c.id AND r.wamid LIKE 'wamid.simulated.%'
);

UPDATE whatsapp_recipients
SET status = 'simulated',
    wamid = NULL,
    error = 'Simulation only — no message was sent'
WHERE wamid LIKE 'wamid.simulated.%';

-- Recompute counters from recipient rows (the old webhook incremented on every
-- callback, so duplicate deliveries inflated delivered/read counts)
UPDATE whatsapp_campaigns c SET
  sent_count      = (SELECT count(*) FROM whatsapp_recipients r WHERE r.campaign_id = c.id AND r.wamid IS NOT NULL),
  delivered_count = (SELECT count(*) FROM whatsapp_recipients r WHERE r.campaign_id = c.id AND r.status IN ('delivered', 'read')),
  read_count      = (SELECT count(*) FROM whatsapp_recipients r WHERE r.campaign_id = c.id AND r.status = 'read'),
  failed_count    = (SELECT count(*) FROM whatsapp_recipients r WHERE r.campaign_id = c.id AND r.status = 'failed');

CREATE INDEX IF NOT EXISTS idx_whatsapp_recipients_campaign_status
  ON whatsapp_recipients (campaign_id, status);

COMMIT;

-- ── After running ───────────────────────────────────────────────────────────
-- • Set WHATSAPP_WEBHOOK_VERIFY_TOKEN and WHATSAPP_APP_SECRET on the server
--   (see WHATSAPP-SETUP-GUIDE.md), then re-verify the webhook in the Meta App Dashboard.
-- • In the app: Settings → WhatsApp Config → "Test Connection", then
--   WhatsApp → Templates → "Sync from Meta".
