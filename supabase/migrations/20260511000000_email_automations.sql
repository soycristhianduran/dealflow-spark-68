-- ── Email Templates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  html_content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email_templates"
  ON email_templates FOR ALL USING (auth.uid() = user_id);

-- ── Email Campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  from_name text DEFAULT '',
  from_email text DEFAULT '',
  html_content text DEFAULT '',
  -- status: draft | scheduled | sending | sent | paused
  status text DEFAULT 'draft',
  -- recipient_filter: {"type":"all"} | {"type":"tag","value":"tag_name"} | {"type":"manual","contact_ids":["..."]}
  recipient_filter jsonb DEFAULT '{"type":"all"}',
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients int DEFAULT 0,
  sent_count int DEFAULT 0,
  opened_count int DEFAULT 0,
  clicked_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email_campaigns"
  ON email_campaigns FOR ALL USING (auth.uid() = user_id);

-- ── Email Sends (per-contact tracking) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES email_campaigns(id) ON DELETE CASCADE,
  automation_enrollment_id uuid,  -- set when sent by an automation
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  email_address text NOT NULL,
  -- status: pending | sent | failed | opened | clicked | bounced | unsubscribed
  status text DEFAULT 'pending',
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email_sends"
  ON email_sends FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id);

-- ── Automations ───────────────────────────────────────────────────────────────
-- trigger_type values:
--   contact_created | deal_stage_changed | tag_added | manual | whatsapp_incoming | scheduled
--
-- steps is a JSON array of step objects:
--   { id, type, config }
--   type values:
--     wait         → config: { delay_value: N, delay_unit: "minutes"|"hours"|"days" }
--     send_email   → config: { subject, html_content, from_name, from_email }
--     send_whatsapp→ config: { template_name, language, variables: ["{{contact.first_name}}"] }
--     condition    → config: { field, operator, value, true_next_index, false_next_index }
--     add_tag      → config: { tag }
--     update_contact→config: { field, value }
CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT false,
  trigger_type text NOT NULL DEFAULT 'manual',
  trigger_config jsonb DEFAULT '{}',
  steps jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own automations"
  ON automations FOR ALL USING (auth.uid() = user_id);

-- ── Automation Enrollments (per-contact execution) ────────────────────────────
CREATE TABLE IF NOT EXISTS automation_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  -- status: active | waiting | completed | failed | cancelled
  status text DEFAULT 'active',
  current_step_index int DEFAULT 0,
  next_run_at timestamptz DEFAULT now(),
  context jsonb DEFAULT '{}',  -- variables available to steps
  enrolled_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  error_message text,
  logs jsonb DEFAULT '[]'
);
ALTER TABLE automation_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own automation_enrollments"
  ON automation_enrollments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_automation ON automation_enrollments(automation_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_contact ON automation_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_next_run ON automation_enrollments(next_run_at) WHERE status IN ('active','waiting');
