-- AI Lead Analysis
--
-- Augments the quantitative scoring system with sentiment + intent analysis
-- via GPT-4o-mini.  The final contact.score becomes a 60/40 hybrid of the
-- quantitative components and the AI-derived "temperature".

-- ===== contact_ai_analyses ===================================================
-- One row per contact.  Replaced (upserted) every time we re-analyze.
CREATE TABLE IF NOT EXISTS contact_ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- AI verdict
  temperature INT CHECK (temperature BETWEEN 0 AND 100),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  buying_intent TEXT CHECK (buying_intent IN ('high', 'medium', 'low', 'none')),

  -- Structured insights
  signals_detected JSONB DEFAULT '[]'::jsonb,   -- array of short strings
  objections JSONB DEFAULT '[]'::jsonb,         -- array of short strings
  next_best_action TEXT,
  reasoning TEXT,

  -- Metadata
  messages_analyzed INT DEFAULT 0,
  model_used TEXT,
  tokens_used INT DEFAULT 0,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_ai_analyses_user_id
  ON contact_ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_ai_analyses_temp
  ON contact_ai_analyses(temperature DESC);
CREATE INDEX IF NOT EXISTS idx_contact_ai_analyses_analyzed_at
  ON contact_ai_analyses(analyzed_at DESC);

ALTER TABLE contact_ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_ai_analyses_own ON contact_ai_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Updated score calculation (hybrid) ====================================
-- Replace the previous calculate_contact_score with a version that blends
-- quantitative + AI temperature when an AI analysis exists.
--
-- Weighting: 60% quantitative, 40% AI.  When no AI analysis is available
-- yet (or it's > 30 days old), uses 100% quantitative.

CREATE OR REPLACE FUNCTION calculate_contact_score(contact_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  ai RECORD;
  total INTEGER := 0;
  quantitative INTEGER := 0;
  info_pts INTEGER := 0;
  engagement_pts INTEGER := 0;
  sales_pts INTEGER := 0;
  recency_pts INTEGER := 0;
  wa_outgoing_count INTEGER := 0;
  wa_incoming_count INTEGER := 0;
  ig_message_count INTEGER := 0;
  call_count INTEGER := 0;
  email_open_count INTEGER := 0;
  channels_used INTEGER := 0;
  has_open_deal BOOLEAN := FALSE;
  best_stage_pts INTEGER := 0;
  has_meeting BOOLEAN := FALSE;
  last_activity_at TIMESTAMPTZ;
  days_since_activity INTEGER;
BEGIN
  SELECT * INTO c FROM contacts WHERE id = contact_uuid;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Special-case overrides
  IF c.status = 'client' THEN RETURN 100; END IF;
  IF c.status = 'lost'   THEN RETURN 10;  END IF;

  -- ── Quantitative (same as v1) ─────────────────────────────────────────────
  -- 1. Info quality
  IF c.full_name IS NOT NULL AND LENGTH(TRIM(c.full_name)) > 0 THEN
    info_pts := info_pts + 3; END IF;
  IF c.primary_phone IS NOT NULL AND LENGTH(TRIM(c.primary_phone)) > 0 THEN
    info_pts := info_pts + 4; END IF;
  IF c.primary_email IS NOT NULL AND LENGTH(TRIM(c.primary_email)) > 0 THEN
    info_pts := info_pts + 4; END IF;
  IF c.company_id IS NOT NULL THEN
    info_pts := info_pts + 2; END IF;
  IF (c.city IS NOT NULL AND LENGTH(TRIM(c.city)) > 0)
     OR (c.country IS NOT NULL AND LENGTH(TRIM(c.country)) > 0) THEN
    info_pts := info_pts + 2; END IF;

  -- 2. Engagement
  SELECT COUNT(*) INTO wa_outgoing_count
    FROM whatsapp_messages WHERE contact_id = contact_uuid AND direction = 'outgoing';
  SELECT COUNT(*) INTO wa_incoming_count
    FROM whatsapp_messages WHERE contact_id = contact_uuid AND direction = 'incoming';

  engagement_pts := engagement_pts
                   + LEAST(wa_outgoing_count, 10)
                   + LEAST(wa_incoming_count * 2, 10);

  SELECT COUNT(*) INTO ig_message_count
    FROM instagram_messages im
    JOIN instagram_conversations ic ON ic.id = im.conversation_id
    WHERE ic.contact_id = contact_uuid;
  engagement_pts := engagement_pts + LEAST(ig_message_count * 2, 6);

  SELECT COUNT(*) INTO call_count
    FROM activities
    WHERE related_entity_id = contact_uuid
      AND related_entity_type = 'contact'
      AND event_type IN ('call', 'phone_call');
  engagement_pts := engagement_pts + LEAST(call_count * 3, 9);

  SELECT COUNT(*) INTO email_open_count
    FROM activities
    WHERE related_entity_id = contact_uuid
      AND related_entity_type = 'contact'
      AND event_type = 'email_open';
  engagement_pts := engagement_pts + LEAST(email_open_count, 5);

  IF wa_outgoing_count + wa_incoming_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF ig_message_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF email_open_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF channels_used >= 3 THEN engagement_pts := engagement_pts + 5; END IF;
  engagement_pts := LEAST(engagement_pts, 35);

  -- 3. Sales progress
  SELECT EXISTS(
    SELECT 1 FROM deals
    WHERE contact_id = contact_uuid AND status NOT IN ('won', 'lost')
  ) INTO has_open_deal;
  IF has_open_deal THEN sales_pts := sales_pts + 10; END IF;

  SELECT COALESCE(MAX(
    CASE
      WHEN LOWER(stage) IN ('qualified', 'calificado') THEN 10
      WHEN LOWER(stage) IN ('proposal', 'propuesta', 'propuesta_enviada') THEN 15
      WHEN LOWER(stage) IN ('negotiation', 'negociacion', 'negociación') THEN 20
      ELSE 0
    END
  ), 0) INTO best_stage_pts
    FROM deals WHERE contact_id = contact_uuid AND status NOT IN ('won', 'lost');
  sales_pts := sales_pts + best_stage_pts;

  SELECT EXISTS(
    SELECT 1 FROM meetings
    WHERE contact_id = contact_uuid AND start_at >= NOW() - INTERVAL '1 day'
  ) INTO has_meeting;
  IF has_meeting THEN sales_pts := sales_pts + 10; END IF;
  sales_pts := LEAST(sales_pts, 40);

  -- 4. Recency
  SELECT GREATEST(
    COALESCE(c.last_contact_at, '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM activities
              WHERE related_entity_id = contact_uuid
                AND related_entity_type = 'contact'), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(sent_at) FROM whatsapp_messages
              WHERE contact_id = contact_uuid), '1970-01-01'::timestamptz)
  ) INTO last_activity_at;

  IF last_activity_at > '1970-01-01'::timestamptz THEN
    days_since_activity := EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 86400;
    IF days_since_activity <= 7 THEN recency_pts := 10;
    ELSIF days_since_activity <= 30 THEN recency_pts := 5;
    ELSIF days_since_activity <= 90 THEN recency_pts := 0;
    ELSE recency_pts := -10;
    END IF;
  END IF;

  quantitative := info_pts + engagement_pts + sales_pts + recency_pts;
  quantitative := GREATEST(0, LEAST(100, quantitative));

  -- ── Hybrid: blend with AI temperature when available and fresh ────────────
  SELECT * INTO ai
    FROM contact_ai_analyses
    WHERE contact_id = contact_uuid
      AND analyzed_at > NOW() - INTERVAL '30 days'
    LIMIT 1;

  IF FOUND AND ai.temperature IS NOT NULL THEN
    -- 60% quantitative, 40% AI
    total := ROUND(quantitative * 0.6 + ai.temperature * 0.4);
  ELSE
    total := quantitative;
  END IF;

  total := GREATEST(0, LEAST(100, total));
  RETURN total;
END;
$$;

COMMENT ON FUNCTION calculate_contact_score(UUID)
  IS 'Hybrid 0-100 lead score combining quantitative signals (60%) with the latest AI sentiment analysis (40%) when available.';
