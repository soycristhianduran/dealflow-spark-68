-- ─────────────────────────────────────────────────────────────────────────────
-- AI Agent feature
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agent configuration per organization
CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active             BOOLEAN     NOT NULL DEFAULT false,
  agent_name            TEXT        NOT NULL DEFAULT 'Asistente',
  business_name         TEXT,
  business_description  TEXT,
  products              TEXT,        -- free-text: products / services / pricing
  faqs                  TEXT,        -- free-text: Q&A pairs the agent should know
  tone                  TEXT        NOT NULL DEFAULT 'amigable',  -- amigable | formal | casual
  escalation_response   TEXT        NOT NULL DEFAULT '¡Claro! Un momento, voy a comunicarte con uno de nuestros asesores para que te ayuden mejor. 😊',
  off_topic_response    TEXT        NOT NULL DEFAULT 'Lo siento, no tengo información sobre ese tema. Un asesor te ayudará en breve.',
  channels              JSONB       NOT NULL DEFAULT '''{\"whatsapp\": true, \"instagram\": false}''',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_configs_org"
  ON public.ai_agent_configs FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- 2. Conversation sessions — 1 session per (org, channel, key) per calendar day (UTC)
--    Used for billing: a new session = a new "conversation" credit consumed.
CREATE TABLE IF NOT EXISTS public.ai_agent_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel         TEXT        NOT NULL,   -- 'whatsapp' | 'instagram' | 'messenger'
  session_key     TEXT        NOT NULL,   -- phone number or conversation id
  date_utc        DATE        NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE,
  message_count   INTEGER     NOT NULL DEFAULT 0,
  was_escalated   BOOLEAN     NOT NULL DEFAULT false,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, channel, session_key, date_utc)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_org_date
  ON public.ai_agent_sessions(organization_id, date_utc DESC);

ALTER TABLE public.ai_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_sessions_org"
  ON public.ai_agent_sessions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- 3. Paused conversations — human took over, AI stays silent
CREATE TABLE IF NOT EXISTS public.ai_agent_paused (
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel         TEXT        NOT NULL,
  session_key     TEXT        NOT NULL,   -- same key as ai_agent_sessions
  paused_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, channel, session_key)
);

ALTER TABLE public.ai_agent_paused ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_paused_org"
  ON public.ai_agent_paused FOR ALL TO authenticated
  USING  (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- 4. Add is_ai_generated flag to message tables
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.instagram_messages
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false;

-- 5. Add ai_agent_conversations_used to usage_counters
ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS ai_agent_conversations_used INTEGER NOT NULL DEFAULT 0;

-- 5. RPC: consume_ai_agent_session
--    Called by the ai-agent edge function.
--    Creates or updates the session for today, increments usage_counters,
--    and returns whether this is a NEW session (for billing purposes).
CREATE OR REPLACE FUNCTION public.consume_ai_agent_session(
  p_org_id      UUID,
  p_channel     TEXT,
  p_session_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today        DATE    := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_session_id   UUID;
  v_is_new       BOOLEAN := false;
  v_month_start  TIMESTAMPTZ := date_trunc('month', NOW() AT TIME ZONE 'UTC');
  v_month_end    TIMESTAMPTZ := v_month_start + INTERVAL '1 month';
BEGIN
  -- Upsert session
  INSERT INTO public.ai_agent_sessions
    (organization_id, channel, session_key, date_utc, message_count, last_message_at)
  VALUES
    (p_org_id, p_channel, p_session_key, v_today, 1, NOW())
  ON CONFLICT (organization_id, channel, session_key, date_utc)
  DO UPDATE SET
    message_count   = ai_agent_sessions.message_count + 1,
    last_message_at = NOW()
  RETURNING id, (xmax = 0) INTO v_session_id, v_is_new;

  -- Only count the credit on the first message of a session (new session today)
  IF v_is_new THEN
    INSERT INTO public.usage_counters
      (organization_id, period_start, period_end, ai_agent_conversations_used)
    VALUES
      (p_org_id, v_month_start, v_month_end, 1)
    ON CONFLICT (organization_id, period_start)
    DO UPDATE SET
      ai_agent_conversations_used = usage_counters.ai_agent_conversations_used + 1,
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object('session_id', v_session_id, 'is_new_session', v_is_new);
END;
$$;
