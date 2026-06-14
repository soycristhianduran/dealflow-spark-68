-- ════════════════════════════════════════════════════════════════════════════
-- Reopen invitations when the invited user account is deleted.
-- If a user who had accepted an invitation is later deleted, their membership
-- cascades away but the invitation stayed marked accepted_at, leaving a "ghost"
-- invitation that shows nowhere and can never be accepted again. Now, deleting a
-- user resets any of their accepted invitations back to pending (accepted_at
-- null) and refreshes the expiry, so the seat can be re-claimed.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.reopen_invitations_on_user_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if OLD.email is not null then
    update public.organization_invitations
       set accepted_at = null,
           expires_at  = now() + interval '7 days'
     where lower(email) = lower(OLD.email)
       and accepted_at is not null;
  end if;
  return OLD;
end;
$$;

drop trigger if exists trg_reopen_invitations_on_user_delete on auth.users;
create trigger trg_reopen_invitations_on_user_delete
  after delete on auth.users
  for each row execute function public.reopen_invitations_on_user_delete();
