-- Security audit fixes — remove two over-permissive RLS policies that leaked
-- tenant data across organizations.
--
-- 1) instagram_pending_deliveries had a `USING (true)` policy granted to `public`
--    (cmd ALL), so ANY authenticated user could read/modify every org's pending
--    Instagram deliveries (incl. dm_text, commenter_username, verify_token). The
--    service role bypasses RLS for the webhook, and ig_pending_own already scopes
--    user access, so the policy was unnecessary and dangerous.
drop policy if exists "ig_pending_service" on public.instagram_pending_deliveries;

-- 2) organization_invitations had `anyone_read_invitation_by_token USING (true)`
--    for `public` SELECT, exposing every invitation (emails + tokens) platform-wide.
--    Nothing in the app reads it directly (the accept flow uses the org-invitations
--    edge function via service role), and org members/admins keep their own scoped
--    read/manage policies.
drop policy if exists "anyone_read_invitation_by_token" on public.organization_invitations;
