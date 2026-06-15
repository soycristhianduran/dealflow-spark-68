-- ─────────────────────────────────────────────────────────────────────────────
-- Platform monitor — founder-level visibility into the whole SaaS.
-- platform_admins gate (separate from org roles); helpers for the platform-stats
-- edge function to compute infra cost and DB size.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_uid);
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- Only platform admins can see the admin list.
DROP POLICY IF EXISTS "platform_admins_self_read" ON public.platform_admins;
CREATE POLICY "platform_admins_self_read"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Seed the founder as the first platform admin.
INSERT INTO public.platform_admins (user_id, email)
VALUES ('035dd746-1476-421f-9b7b-77672399bc22', 'marketing@cristhianduran.com')
ON CONFLICT (user_id) DO NOTHING;

-- Landing pages are generated with Sonnet ($3/M in, $15/M out). Cost helper for
-- the monitor (agent uses ai_agent_token_cost_usd, already defined for Haiku).
CREATE OR REPLACE FUNCTION public.landing_token_cost_usd(p_in BIGINT, p_out BIGINT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND((COALESCE(p_in,0)::NUMERIC/1000000)*3.0 + (COALESCE(p_out,0)::NUMERIC/1000000)*15.0, 4);
$$;

-- DB size (service-role only; the edge function gates the caller).
CREATE OR REPLACE FUNCTION public.platform_db_size_bytes()
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT pg_database_size(current_database()); $$;
GRANT EXECUTE ON FUNCTION public.platform_db_size_bytes() TO service_role;
GRANT EXECUTE ON FUNCTION public.landing_token_cost_usd(bigint, bigint) TO authenticated, service_role;
