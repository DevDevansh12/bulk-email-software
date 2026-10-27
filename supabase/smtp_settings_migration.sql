CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS user_smtp_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  smtp_host   TEXT NOT NULL,
  smtp_port   INTEGER NOT NULL DEFAULT 587,
  smtp_user   TEXT NOT NULL,
  smtp_pass   TEXT NOT NULL,
  from_email  TEXT NOT NULL,
  from_name   TEXT NOT NULL DEFAULT '',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_smtp_settings_user_id ON user_smtp_settings(user_id);

CREATE TRIGGER update_user_smtp_settings_updated_at
  BEFORE UPDATE ON user_smtp_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own smtp settings"
  ON user_smtp_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own smtp settings"
  ON user_smtp_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own smtp settings"
  ON user_smtp_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own smtp settings"
  ON user_smtp_settings FOR DELETE
  USING (auth.uid() = user_id);
