-- Trigger: normaliza custom_fields a strings planos en cada INSERT/UPDATE
-- Convierte {id,type,value,label} → "value" directamente en la DB
-- Así nunca llega formato objeto al frontend, sin importar qué código corra

CREATE OR REPLACE FUNCTION normalize_custom_fields_fn()
RETURNS TRIGGER AS $$
DECLARE
  k   TEXT;
  v   JSONB;
  out JSONB := '{}'::jsonb;
BEGIN
  IF NEW.custom_fields IS NULL
     OR jsonb_typeof(NEW.custom_fields) <> 'object'
     OR NEW.custom_fields = '{}'::jsonb
  THEN
    RETURN NEW;
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(NEW.custom_fields)
  LOOP
    IF jsonb_typeof(v) = 'object' THEN
      -- Formato legacy {id,type,value,label}: extraer .value
      IF v ? 'value' THEN
        out := out || jsonb_build_object(k, v->>'value');
      END IF;
      -- Si no tiene .value se descarta (campo inválido)
    ELSIF jsonb_typeof(v) IN ('string','number','boolean') THEN
      out := out || jsonb_build_object(k, v#>>'{}');
    END IF;
  END LOOP;

  NEW.custom_fields := CASE WHEN out = '{}'::jsonb THEN NULL ELSE out END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_custom_fields ON contacts;
CREATE TRIGGER trg_normalize_custom_fields
  BEFORE INSERT OR UPDATE OF custom_fields ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION normalize_custom_fields_fn();
