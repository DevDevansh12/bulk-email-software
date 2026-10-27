-- Email Templates Table Migration

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index by user_id for fast queries
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage their own templates
CREATE POLICY "Users manage own templates"
  ON email_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
