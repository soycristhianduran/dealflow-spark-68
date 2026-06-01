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
  wa_outgoing_count INTEGER := 0;
  wa_incoming_count INTEGER := 0;
  ig_message_count INTEGER := 0;
  call_count INTEGER := 0;
  email_open_count INTEGER := 0;
  channels_used INTEGER := 0;
  has_open_deal BOOLEAN := FALSE;
  best_prob_pts INTEGER := 0;
  has_meeting BOOLEAN := FALSE;
  last_activity_at TIMESTAMPTZ;
  days_since_activity INTEGER;
BEGIN
  SELECT * INTO c FROM contacts WHERE id = contact_uuid;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Special cases — use lead_status (not the legacy status field)
  IF c.lead_status = 'won'  THEN RETURN 100; END IF;
  IF c.lead_status = 'lost' THEN RETURN 10;  END IF;

  -- 1. Info quality (max 15 pts)
  IF c.full_name     IS NOT NULL AND LENGTH(TRIM(c.full_name))     > 0 THEN info_pts := info_pts + 3; END IF;
  IF c.primary_phone IS NOT NULL AND LENGTH(TRIM(c.primary_phone)) > 0 THEN info_pts := info_pts + 4; END IF;
  IF c.primary_email IS NOT NULL AND LENGTH(TRIM(c.primary_email)) > 0 THEN info_pts := info_pts + 4; END IF;
  IF c.company_id IS NOT NULL THEN info_pts := info_pts + 2; END IF;
  IF (c.city    IS NOT NULL AND LENGTH(TRIM(c.city))    > 0)
  OR (c.country IS NOT NULL AND LENGTH(TRIM(c.country)) > 0) THEN
    info_pts := info_pts + 2;
  END IF;

  -- 2. Engagement (max 35 pts)
  SELECT COUNT(*) INTO wa_outgoing_count FROM whatsapp_messages
    WHERE contact_id = contact_uuid AND direction = 'outgoing';
  SELECT COUNT(*) INTO wa_incoming_count FROM whatsapp_messages
    WHERE contact_id = contact_uuid AND direction = 'incoming';
  engagement_pts := engagement_pts
    + LEAST(wa_outgoing_count, 10)
    + LEAST(wa_incoming_count * 2, 10);

  SELECT COUNT(*) INTO ig_message_count
    FROM instagram_messages im
    JOIN instagram_conversations ic ON ic.id = im.conversation_id
    WHERE ic.contact_id = contact_uuid;
  engagement_pts := engagement_pts + LEAST(ig_message_count * 2, 6);

  SELECT COUNT(*) INTO call_count FROM activities
    WHERE related_entity_id = contact_uuid
      AND related_entity_type = 'contact'
      AND event_type IN ('call', 'phone_call');
  engagement_pts := engagement_pts + LEAST(call_count * 3, 9);

  SELECT COUNT(*) INTO email_open_count FROM activities
    WHERE related_entity_id = contact_uuid
      AND related_entity_type = 'contact'
      AND event_type = 'email_open';
  engagement_pts := engagement_pts + LEAST(email_open_count, 5);

  IF wa_outgoing_count + wa_incoming_count > 0 THEN channels_used := channels_used + 1; END IF;
  IF ig_message_count > 0                        THEN channels_used := channels_used + 1; END IF;
  IF email_open_count > 0                        THEN channels_used := channels_used + 1; END IF;
  IF channels_used >= 3 THEN engagement_pts := engagement_pts + 5; END IF;
  engagement_pts := LEAST(engagement_pts, 35);

  -- 3. Sales progress (max 40 pts)
  SELECT EXISTS(
    SELECT 1 FROM deals WHERE contact_id = contact_uuid AND status NOT IN ('won','lost')
  ) INTO has_open_deal;
  IF has_open_deal THEN sales_pts := sales_pts + 10; END IF;

  -- Bonus from deal close_probability (0–30 extra pts)
  SELECT COALESCE(MAX(
    CASE
      WHEN close_probability >= 75 THEN 30
      WHEN close_probability >= 50 THEN 20
      WHEN close_probability >= 25 THEN 10
      ELSE 0
    END
  ), 0) INTO best_prob_pts
  FROM deals
  WHERE contact_id = contact_uuid AND status NOT IN ('won','lost');
  sales_pts := sales_pts + best_prob_pts;

  SELECT EXISTS(
    SELECT 1 FROM meetings WHERE contact_id = contact_uuid
      AND start_at >= NOW() - INTERVAL '1 day'
  ) INTO has_meeting;
  IF has_meeting THEN sales_pts := sales_pts + 10; END IF;
  sales_pts := LEAST(sales_pts, 40);

  -- 4. Recency — only REAL interactions, NOT automated events (lead_created, merge, etc.)
  SELECT GREATEST(
    COALESCE((SELECT MAX(sent_at)    FROM whatsapp_messages WHERE contact_id = contact_uuid), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(im.created_at) FROM instagram_messages im
              JOIN instagram_conversations ic ON ic.id = im.conversation_id
              WHERE ic.contact_id = contact_uuid), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(start_at)   FROM meetings  WHERE contact_id = contact_uuid), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(cl.created_at) FROM call_logs cl
              WHERE cl.contact_id = contact_uuid AND cl.status = 'completed'), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(a.created_at)  FROM activities a
              WHERE a.related_entity_id = contact_uuid
                AND a.related_entity_type = 'contact'
                AND a.event_type IN ('note','email_open','manual')), '1970-01-01'::timestamptz)
  ) INTO last_activity_at;

  IF last_activity_at > '1970-01-01'::timestamptz THEN
    days_since_activity := EXTRACT(EPOCH FROM (NOW() - last_activity_at)) / 86400;
    IF    days_since_activity <=  7 THEN recency_pts :=  10;
    ELSIF days_since_activity <= 30 THEN recency_pts :=   5;
    ELSIF days_since_activity <= 90 THEN recency_pts :=   0;
    ELSE                                  recency_pts := -10;
    END IF;
  END IF;

  total := info_pts + engagement_pts + sales_pts + recency_pts;
  total := GREATEST(0, LEAST(100, total));
  RETURN total;
END;
$$;

-- Recalculate all scores with the fixed logic
SELECT recalculate_all_contact_scores();
