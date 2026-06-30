-- Support module: in-app tickets + threaded messages
-- ---------------------------------------------------------------------------
-- Clients open tickets from the app (Klofy → Soporte); the platform admin
-- answers them from /admin. Org members see their org's tickets; platform
-- admins see all.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject         TEXT        NOT NULL,
  category        TEXT        NOT NULL DEFAULT 'general',
  status          TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority        TEXT        NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_org_idx ON public.support_tickets(organization_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_staff   BOOLEAN     NOT NULL DEFAULT false,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Tickets: org members see their org's; platform admins see all.
DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
CREATE POLICY support_tickets_update ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_org_member(organization_id));

-- Messages: visible/insertable to anyone who can see the parent ticket.
DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
                  AND (public.is_org_member(t.organization_id) OR public.is_platform_admin(auth.uid()))));
DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
                           AND (public.is_org_member(t.organization_id) OR public.is_platform_admin(auth.uid()))));

-- On each message: stamp is_staff from platform-admin status (anti-spoof) and
-- bump the ticket's last_message_at. A staff reply moves an open ticket to
-- in_progress; a client reply on a resolved ticket reopens it.
CREATE OR REPLACE FUNCTION public.support_message_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
    SET last_message_at = NEW.created_at,
        updated_at = now(),
        status = CASE
          WHEN NEW.is_staff AND status = 'open' THEN 'in_progress'
          WHEN NOT NEW.is_staff AND status IN ('resolved','closed') THEN 'open'
          ELSE status END
    WHERE id = NEW.ticket_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.support_message_set_staff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_staff := public.is_platform_admin(auth.uid());
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_support_msg_staff ON public.support_messages;
CREATE TRIGGER trg_support_msg_staff BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_message_set_staff();
DROP TRIGGER IF EXISTS trg_support_msg_after ON public.support_messages;
CREATE TRIGGER trg_support_msg_after AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_message_after_insert();

-- Platform inbox: all tickets with org name, requester email and message count.
DROP FUNCTION IF EXISTS public.platform_list_support_tickets();
CREATE OR REPLACE FUNCTION public.platform_list_support_tickets()
RETURNS TABLE (
  id UUID, organization_id UUID, org_name TEXT, requester_email TEXT,
  subject TEXT, category TEXT, status TEXT, priority TEXT,
  message_count BIGINT, created_at TIMESTAMPTZ, last_message_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT t.id, t.organization_id, o.name, u.email,
         t.subject, t.category, t.status, t.priority,
         (SELECT COUNT(*) FROM public.support_messages m WHERE m.ticket_id = t.id),
         t.created_at, t.last_message_at
  FROM public.support_tickets t
  JOIN public.organizations o ON o.id = t.organization_id
  LEFT JOIN auth.users u ON u.id = t.created_by
  WHERE public.is_platform_admin(auth.uid())
  ORDER BY t.last_message_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.platform_list_support_tickets() TO authenticated;
