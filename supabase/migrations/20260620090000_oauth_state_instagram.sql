-- Allow 'instagram' as an OAuth state provider so the new Instagram Business
-- Login (Instagram API with Instagram Login → IGAA tokens) flow can use the
-- same CSRF-nonce machinery as Facebook/WhatsApp.

-- 1. Widen the table CHECK constraint.
ALTER TABLE public.oauth_state_tokens
  DROP CONSTRAINT IF EXISTS oauth_state_tokens_provider_check;
ALTER TABLE public.oauth_state_tokens
  ADD CONSTRAINT oauth_state_tokens_provider_check
  CHECK (provider = ANY (ARRAY['facebook'::text, 'whatsapp'::text, 'instagram'::text]));

-- 2. Allow 'instagram' in both create_oauth_state overloads.
CREATE OR REPLACE FUNCTION public.create_oauth_state(p_provider TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_token   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('facebook','whatsapp','instagram') THEN
    RAISE EXCEPTION 'Invalid provider: %', p_provider USING ERRCODE = '22023';
  END IF;
  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  INSERT INTO public.oauth_state_tokens (token, user_id, provider)
  VALUES (v_token, v_user_id, p_provider);
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_oauth_state(p_provider TEXT, p_organization_id UUID DEFAULT NULL::uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_token   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('facebook','whatsapp','instagram') THEN
    RAISE EXCEPTION 'Invalid provider: %', p_provider USING ERRCODE = '22023';
  END IF;
  v_token := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  INSERT INTO public.oauth_state_tokens (token, user_id, provider, organization_id)
  VALUES (v_token, v_user_id, p_provider, p_organization_id);
  RETURN v_token;
END;
$$;
