-- ============================================================
-- AI Calling Agent — Vapi.ai integration
--   calling_agents   — AI agent config (voice, script, questions)
--   calling_campaigns — outbound campaigns with contact lists
--   call_logs         — per-call record with transcript + analysis
-- ============================================================

-- ── 1. calling_agents ────────────────────────────────────────────────────────
CREATE TABLE public.calling_agents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  -- Vapi config
  vapi_assistant_id     TEXT,               -- synced Vapi assistant ID (optional)
  voice                 TEXT DEFAULT 'Paola',
  language              TEXT DEFAULT 'es',
  -- Conversation config
  first_message         TEXT,               -- opening line the agent says
  system_prompt         TEXT,               -- personality + instructions
  objectives            TEXT[] DEFAULT '{}',-- qualify | schedule | followup | survey
  -- Structured extraction schema (JSON Schema for Vapi)
  questions             JSONB DEFAULT '[]',
  structured_data_schema JSONB DEFAULT '{}',
  -- State
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calling_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage calling_agents"
  ON public.calling_agents FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- ── 2. calling_campaigns ─────────────────────────────────────────────────────
CREATE TABLE public.calling_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  calling_agent_id  UUID REFERENCES public.calling_agents(id) ON DELETE SET NULL,
  -- Targeting
  contact_ids       UUID[] DEFAULT '{}',
  -- Status & progress
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','paused','completed','cancelled')),
  total_contacts    INTEGER NOT NULL DEFAULT 0,
  calls_initiated   INTEGER NOT NULL DEFAULT 0,
  calls_answered    INTEGER NOT NULL DEFAULT 0,
  calls_completed   INTEGER NOT NULL DEFAULT 0,
  calls_failed      INTEGER NOT NULL DEFAULT 0,
  -- Scheduling
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  -- Settings
  max_concurrent    INTEGER NOT NULL DEFAULT 1,
  retry_no_answer   BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calling_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage calling_campaigns"
  ON public.calling_campaigns FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- ── 3. call_logs ─────────────────────────────────────────────────────────────
CREATE TABLE public.call_logs (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id                 UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id                UUID REFERENCES public.calling_campaigns(id) ON DELETE SET NULL,
  calling_agent_id           UUID REFERENCES public.calling_agents(id) ON DELETE SET NULL,
  automation_enrollment_id   UUID,
  -- Vapi identifiers
  vapi_call_id               TEXT UNIQUE,
  -- Call metadata
  status                     TEXT NOT NULL DEFAULT 'initiated'
                               CHECK (status IN (
                                 'initiated','ringing','in_progress',
                                 'completed','no_answer','voicemail','failed','cancelled'
                               )),
  direction                  TEXT NOT NULL DEFAULT 'outbound',
  phone_number               TEXT,
  duration_seconds           INTEGER,
  recording_url              TEXT,
  -- Content
  transcript                 TEXT,
  transcript_json            JSONB,          -- structured transcript with speakers
  -- Claude analysis
  analysis                   JSONB,          -- full analysis object
  temperature                TEXT CHECK (temperature IN ('hot','warm','cold')),
  interest_level             TEXT CHECK (interest_level IN ('high','medium','low')),
  sentiment                  TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  next_step                  TEXT,
  ai_summary                 TEXT,           -- short summary of the call
  -- Structured data extracted by Vapi + Claude
  structured_data            JSONB DEFAULT '{}',
  -- Timestamps
  started_at                 TIMESTAMPTZ,
  ended_at                   TIMESTAMPTZ,
  analyzed_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_logs_org        ON public.call_logs (organization_id);
CREATE INDEX idx_call_logs_contact    ON public.call_logs (contact_id);
CREATE INDEX idx_call_logs_campaign   ON public.call_logs (campaign_id);
CREATE INDEX idx_call_logs_vapi_id    ON public.call_logs (vapi_call_id);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage call_logs"
  ON public.call_logs FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- ── 4. Add calling triggers to automation_enrollments context ────────────────
-- New automation trigger types: call.completed, call.no_answer, call.voicemail
-- (no schema change needed — trigger_type is TEXT)

-- ── 5. Update calling_campaigns counter helper ───────────────────────────────
CREATE OR REPLACE FUNCTION public.inc_campaign_counter(
  p_campaign_id UUID,
  p_column TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.calling_campaigns SET %I = %I + 1, updated_at = now() WHERE id = $1',
    p_column, p_column
  ) USING p_campaign_id;
END;
$$;
