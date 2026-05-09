import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

Deno.serve(async (req) => {
  const key = req.headers.get("x-migration-key");
  if (key !== "migrate2026") return new Response("Forbidden", { status: 403 });

  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const sql = postgres(dbUrl, { max: 1 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS email_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name text NOT NULL, subject text NOT NULL, html_content text NOT NULL DEFAULT '',
        created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
      )`;
    await sql`ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY`;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_templates' AND policyname='Users manage own email_templates') THEN CREATE POLICY "Users manage own email_templates" ON email_templates FOR ALL USING (auth.uid() = user_id); END IF; END $$`;

    await sql`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name text NOT NULL, subject text NOT NULL, from_name text DEFAULT '', from_email text DEFAULT '',
        html_content text DEFAULT '', status text DEFAULT 'draft',
        recipient_filter jsonb DEFAULT '{"type":"all"}',
        scheduled_at timestamptz, sent_at timestamptz,
        total_recipients int DEFAULT 0, sent_count int DEFAULT 0,
        opened_count int DEFAULT 0, clicked_count int DEFAULT 0, failed_count int DEFAULT 0,
        created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
      )`;
    await sql`ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY`;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_campaigns' AND policyname='Users manage own email_campaigns') THEN CREATE POLICY "Users manage own email_campaigns" ON email_campaigns FOR ALL USING (auth.uid() = user_id); END IF; END $$`;

    await sql`
      CREATE TABLE IF NOT EXISTS email_sends (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid REFERENCES email_campaigns(id) ON DELETE CASCADE,
        automation_enrollment_id uuid,
        contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
        user_id uuid REFERENCES auth.users(id) NOT NULL,
        email_address text NOT NULL, status text DEFAULT 'pending',
        provider_message_id text, sent_at timestamptz, opened_at timestamptz,
        clicked_at timestamptz, error_message text,
        created_at timestamptz DEFAULT now() NOT NULL
      )`;
    await sql`ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY`;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='email_sends' AND policyname='Users manage own email_sends') THEN CREATE POLICY "Users manage own email_sends" ON email_sends FOR ALL USING (auth.uid() = user_id); END IF; END $$`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS automations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        name text NOT NULL, description text DEFAULT '', is_active boolean DEFAULT false,
        trigger_type text NOT NULL DEFAULT 'manual', trigger_config jsonb DEFAULT '{}',
        steps jsonb DEFAULT '[]',
        created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
      )`;
    await sql`ALTER TABLE automations ENABLE ROW LEVEL SECURITY`;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='automations' AND policyname='Users manage own automations') THEN CREATE POLICY "Users manage own automations" ON automations FOR ALL USING (auth.uid() = user_id); END IF; END $$`;

    await sql`
      CREATE TABLE IF NOT EXISTS automation_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id uuid REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
        contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
        user_id uuid REFERENCES auth.users(id) NOT NULL,
        status text DEFAULT 'active', current_step_index int DEFAULT 0,
        next_run_at timestamptz DEFAULT now(), context jsonb DEFAULT '{}',
        enrolled_at timestamptz DEFAULT now() NOT NULL, completed_at timestamptz,
        error_message text, logs jsonb DEFAULT '[]'
      )`;
    await sql`ALTER TABLE automation_enrollments ENABLE ROW LEVEL SECURITY`;
    await sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='automation_enrollments' AND policyname='Users manage own automation_enrollments') THEN CREATE POLICY "Users manage own automation_enrollments" ON automation_enrollments FOR ALL USING (auth.uid() = user_id); END IF; END $$`;
    await sql`CREATE INDEX IF NOT EXISTS idx_enrollments_automation ON automation_enrollments(automation_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_enrollments_contact ON automation_enrollments(contact_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_enrollments_next_run ON automation_enrollments(next_run_at) WHERE status IN ('active','waiting')`;

    await sql.end();
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    await sql.end();
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
