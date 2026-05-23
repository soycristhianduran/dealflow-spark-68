-- ── WhatsApp Campaigns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  template_name   text,
  status          text DEFAULT 'sent',
  total_recipients int DEFAULT 0,
  sent_count      int DEFAULT 0,
  failed_count    int DEFAULT 0,
  delivered_count int DEFAULT 0,
  read_count      int DEFAULT 0,
  sent_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now() NOT NULL,
  updated_at      timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp_campaigns"
  ON public.whatsapp_campaigns FOR ALL USING (auth.uid() = user_id);

-- ── WhatsApp Sends (per-contact tracking) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_sends (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES auth.users(id) NOT NULL,
  phone        text NOT NULL,
  status       text DEFAULT 'sent',  -- sent | delivered | read | failed
  wa_message_id text,
  sent_at      timestamptz DEFAULT now(),
  delivered_at timestamptz,
  read_at      timestamptz,
  error_message text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own whatsapp_sends"
  ON public.whatsapp_sends FOR ALL USING (auth.uid() = user_id);

-- ── Atomic open counter ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inc_email_campaign_opened(p_campaign_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.email_campaigns
  SET opened_count = opened_count + 1, updated_at = now()
  WHERE id = p_campaign_id;
$$;

-- ── Organization-scope email_campaigns ────────────────────────────────────────
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.email_sends
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
