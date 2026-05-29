-- ============================================================
-- Extended webhook events:
--   deal.stage_changed  — stage_id cambia en un contacto
--   deal.won            — lead_status cambia a "won"
--   deal.lost           — lead_status cambia a "lost"
--   task.completed      — tarea marcada como completada
--   meeting.scheduled   — nueva reunión creada
-- ============================================================

-- ── 1. Reemplaza la función de UPDATE de contactos ────────────────────────────
-- Ahora dispara múltiples eventos según qué cambió.
CREATE OR REPLACE FUNCTION notify_webhook_contact_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url TEXT := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/webhook-dispatcher';
  v_headers JSONB := '{"Content-Type":"application/json"}'::jsonb;
BEGIN

  -- deal.stage_changed — etapa de pipeline cambiada
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'event',           'deal.stage_changed',
        'organization_id', NEW.organization_id::text,
        'data',            jsonb_build_object(
          'contact',       row_to_json(NEW),
          'previous_stage_id', OLD.stage_id,
          'new_stage_id',  NEW.stage_id
        )
      )
    );
  END IF;

  -- deal.won — lead ganado
  IF NEW.lead_status = 'won' AND OLD.lead_status IS DISTINCT FROM 'won' THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'event',           'deal.won',
        'organization_id', NEW.organization_id::text,
        'data',            row_to_json(NEW)
      )
    );
  END IF;

  -- deal.lost — lead perdido
  IF NEW.lead_status = 'lost' AND OLD.lead_status IS DISTINCT FROM 'lost' THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'event',           'deal.lost',
        'organization_id', NEW.organization_id::text,
        'data',            row_to_json(NEW)
      )
    );
  END IF;

  -- contact.updated — cambios generales relevantes para integraciones
  IF (
    NEW.lead_status    IS DISTINCT FROM OLD.lead_status   OR
    NEW.owner_id       IS DISTINCT FROM OLD.owner_id      OR
    NEW.primary_email  IS DISTINCT FROM OLD.primary_email OR
    NEW.primary_phone  IS DISTINCT FROM OLD.primary_phone OR
    NEW.first_name     IS DISTINCT FROM OLD.first_name    OR
    NEW.last_name      IS DISTINCT FROM OLD.last_name     OR
    NEW.tags           IS DISTINCT FROM OLD.tags          OR
    NEW.score          IS DISTINCT FROM OLD.score
  ) THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'event',           'contact.updated',
        'organization_id', NEW.organization_id::text,
        'data',            row_to_json(NEW)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Trigger: task.completed ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_webhook_task_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fires when status transitions TO "completed"
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    PERFORM net.http_post(
      url     := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/webhook-dispatcher',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object(
        'event',           'task.completed',
        'organization_id', NEW.organization_id::text,
        'data',            row_to_json(NEW)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_task_completed ON tasks;
CREATE TRIGGER trg_webhook_task_completed
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_task_completed();

-- ── 3. Trigger: meeting.scheduled ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_webhook_meeting_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://oqwcgvemrvimrdrzjzil.supabase.co/functions/v1/webhook-dispatcher',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'event',           'meeting.scheduled',
      'organization_id', NEW.organization_id::text,
      'data',            row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_meeting_insert ON meetings;
CREATE TRIGGER trg_webhook_meeting_insert
  AFTER INSERT ON meetings
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_meeting_insert();
