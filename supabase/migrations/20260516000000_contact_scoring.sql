-- Contact Scoring System
--
-- A 0-100 score that quantifies how "hot" a lead is, recomputed periodically
-- (every hour by default) or on demand via recalculate_contact_score().
--
-- Formula breakdown:
--   1. Info quality        (max 15 pts)   profile completeness
--   2. Engagement          (max 35 pts)   activity volume across channels
--   3. Sales progress      (max 40 pts)   deals & meetings
--   4. Recency             (max 10 pts, min -10 pts)
--
-- Special cases (override formula):
--   - Status = 'client' (won)  → score = 100
--   - Status = 'lost'          → score = 10

-- ===== Score column metadata =================================================
-- score already exists (INTEGER DEFAULT 0) — add timestamp for last calculation
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_calculated_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_tier TEXT;  -- cold/warm/hot/ready

CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_score_calculated_at ON contacts(score_calculated_at);

-- ===== Core scoring function =================================================
CREATE OR REPLACE FUNCTION calculate_contact_score(contact_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  total INTEGER := 0;
  info_pts INTEGER := 0;
  engagement_pts INTEGER := 0;
  sales_pts INTEGER := 0;
  recency_pts INTEGER := 0;
  -- counters
  wa_outgoing_count INTEGER := 0;
  wa_incoming_count INTEGER := 0;
  ig_message_count INTEGER := 0;
  call_count INTEGER := 0;
  email_open_count INTEGER := 0;
  channels_used INTEGER := 0;
  -- deals
  has_open_deal BOOLEAN := FALSE;
  best_stage_pts INTEGER := 0;
  has_meeting BOOLEAN := FALSE;
  -- recency
  last_activity_at TIMESTAMPTZ;
  days_since_activity INTEGER;
BEGIN
  -- Fetch contact row
  SELECT * INTO c FROM contacts WHERE id = contact_uuid;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- ── Special cases ─────────────────────────────────────────────────────────
  IF c.status = 'client' THEN
    RETURN 100;
  END IF;
  IF c.status = 'lost' THEN
    RETURN 10;
  END IF;

  -- ── 1. Info quality (max 15 pts) ──────────────────────────────────────────
  IF c.full_name IS NOT NULL AND LENGTH(TRIM(c.full_name)) > 0 THEN
    info_pts := info_pts + 3;
  END IF;
  IF c.primary_phone IS NOT NULL AND LENGTH(TRIM(c.primary_phone)) > 0 THEN
    info_pts := info_pts + 4;
  END IF;
  IF c.primary_email IS NOT NULL AND LENGTH(TRIM(c.primary_email)) > 0 THEN
    info_pts := info_pts + 4;
  END IF;
  IF c.company_id IS NOT NULL THEN
    info_pts := info_pts + 2;
  END IF;
  IF (c.city IS NOT NULL AND LENGTH(TRIM(c.city)) > 0)
     OR (c.country IS NOT NULL AND LENGTH(TRIM(c.country)) > 0) THEN
    info_pts := info_pts + 2;
  END IF;

  -- ── 2. Engagement (max 35 pts) ────────────────────────────────────────────
  -- WhatsApp messages
  SELECT COUNT(*) INTO wa_outgoing_count
    FROM whatsapp_messages
    WHERE contact_id = contact_uuid AND direction = 'outgoing';
  SELECT COUNT(*) INTO wa_incoming_count
    FROM whatsapp_messages
    WHERE contact_id = contact_uuid AND direction = 'incoming';

  engagement_pts := engagement_pts
                   + LEAST(wa_outgoing_count, 10)     -- 1 pt each, max 10
                   + LEAST(wa_incoming_count * 2, 10); -- 2 pts each, max 10

  -- Instagram messages — count by joining via contact_id once we link IG conversations to contacts
  SELECT COUNT(*) INTO ig_message_count
    FROM instagram_messages im
    JOIN instagram_conversations ic ON ic.id = im.conversation_id
    WHERE ic.contact_id = contact_uuid;
  engagement_pts := engagement_pts + LEAST(ig_message_count * 2, 6);

  -- Calls and email opens from activities
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

  -- Channel-diversity bonus
  IF wa_outgoing_count + wa_incoming_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF ig_message_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF email_open_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF channels_used >= 3 THEN
    engagement_pts := engagement_pts + 5;
  END IF;

  -- Cap engagement at 35
  engagement_pts := LEAST(engagement_pts, 35);

  -- ── 3. Sales progress (max 40 pts) ────────────────────────────────────────
  -- Open deal
  SELECT EXISTS(
    SELECT 1 FROM deals
    WHERE contact_id = contact_uuid
      AND status NOT IN ('won', 'lost')
  ) INTO has_open_deal;
  IF has_open_deal THEN
    sales_pts := sales_pts + 10;
  END IF;

  -- Best (highest) stage of any open deal
  SELECT COALESCE(MAX(
    CASE
      WHEN LOWER(stage) IN ('qualified', 'calificado') THEN 10
      WHEN LOWER(stage) IN ('proposal', 'propuesta', 'propuesta_enviada') THEN 15
      WHEN LOWER(stage) IN ('negotiation', 'negociacion', 'negociación') THEN 20
      ELSE 0
    END
  ), 0) INTO best_stage_pts
    FROM deals
    WHERE contact_id = contact_uuid
      AND status NOT IN ('won', 'lost');
  sales_pts := sales_pts + best_stage_pts;

  -- Upcoming meeting
  SELECT EXISTS(
    SELECT 1 FROM meetings
    WHERE contact_id = contact_uuid
      AND start_at >= NOW() - INTERVAL '1 day'
  ) INTO has_meeting;
  IF has_meeting THEN
    sales_pts := sales_pts + 10;
  END IF;

  sales_pts := LEAST(sales_pts, 40);

  -- ── 4. Recency (10 pts, can be negative) ──────────────────────────────────
  -- Use the most recent of: contact.last_contact_at, latest activity timestamp,
  -- latest WhatsApp message, latest IG message.
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
    IF days_since_activity <= 7 THEN
      recency_pts := 10;
    ELSIF days_since_activity <= 30 THEN
      recency_pts := 5;
    ELSIF days_since_activity <= 90 THEN
      recency_pts := 0;
    ELSE
      recency_pts := -10;
    END IF;
  END IF;

  -- ── Sum + clamp ───────────────────────────────────────────────────────────
  total := info_pts + engagement_pts + sales_pts + recency_pts;
  total := GREATEST(0, LEAST(100, total));
  RETURN total;
END;
$$;

COMMENT ON FUNCTION calculate_contact_score(UUID)
  IS 'Computes a 0-100 lead score for the given contact based on info quality, engagement, sales progress, and recency.';

-- ===== Helper to derive the tier label from a numeric score ==================
CREATE OR REPLACE FUNCTION contact_score_tier(score_value INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF score_value IS NULL THEN RETURN 'cold'; END IF;
  IF score_value >= 86 THEN RETURN 'ready';
  ELSIF score_value >= 61 THEN RETURN 'hot';
  ELSIF score_value >= 31 THEN RETURN 'warm';
  ELSE RETURN 'cold';
  END IF;
END;
$$;

-- ===== Bulk recalc procedure ================================================
-- Called by the hourly cron job (or on demand).  Recomputes scores for ALL
-- contacts (or just those updated in the last N hours if since_hours given).
CREATE OR REPLACE FUNCTION recalculate_all_contact_scores(
  since_hours INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
  c RECORD;
  new_score INTEGER;
BEGIN
  FOR c IN
    SELECT id FROM contacts
    WHERE since_hours IS NULL
       OR updated_at >= NOW() - (since_hours || ' hours')::INTERVAL
  LOOP
    new_score := calculate_contact_score(c.id);
    UPDATE contacts
       SET score = new_score,
           score_tier = contact_score_tier(new_score),
           score_calculated_at = NOW()
     WHERE id = c.id;
    updated_count := updated_count + 1;
  END LOOP;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION recalculate_all_contact_scores(INTEGER)
  IS 'Recomputes lead scores for all contacts (or recently-updated ones if since_hours given). Returns count of contacts updated.';

-- ===== Single-contact convenience wrapper ====================================
CREATE OR REPLACE FUNCTION recalculate_contact_score(contact_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_score INTEGER;
BEGIN
  new_score := calculate_contact_score(contact_uuid);
  UPDATE contacts
     SET score = new_score,
         score_tier = contact_score_tier(new_score),
         score_calculated_at = NOW()
   WHERE id = contact_uuid;
  RETURN new_score;
END;
$$;

COMMENT ON FUNCTION recalculate_contact_score(UUID)
  IS 'Recomputes the score for a single contact and returns the new value.';

-- ===== Schedule the hourly cron =============================================
-- Requires pg_cron extension.  Recalculates scores once an hour for contacts
-- updated in the last 25 hours (a slight overlap to catch anything missed).
DO $$
BEGIN
  -- Only schedule if pg_cron is available and we don't already have the job
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any previous version
    PERFORM cron.unschedule('recalculate-contact-scores-hourly')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'recalculate-contact-scores-hourly'
      );
    PERFORM cron.schedule(
      'recalculate-contact-scores-hourly',
      '0 * * * *',  -- every hour at :00
      $cron$SELECT public.recalculate_all_contact_scores(25);$cron$
    );
  END IF;
END;
$$;

-- Backfill scores immediately on migration
SELECT recalculate_all_contact_scores();
