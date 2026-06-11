-- Facebook tokens: one token per (user, organization), not one per user.
--
-- The table previously had UNIQUE (user_id), which meant a single Facebook token
-- per user account across the whole platform. In a multi-tenant setup the same
-- user account can belong to several organizations, each needing its own token.
-- With only UNIQUE(user_id), the upsert used by the OAuth callback / fb_exchange_code
-- (ON CONFLICT user_id,organization_id) had no matching constraint and FAILED
-- SILENTLY — the connection looked successful but no token was saved.
--
-- Replace the constraint so each (user_id, organization_id) pair is unique and the
-- per-org upsert works for all orgs, present and future.

ALTER TABLE facebook_tokens DROP CONSTRAINT IF EXISTS facebook_tokens_user_id_key;

ALTER TABLE facebook_tokens
  ADD CONSTRAINT facebook_tokens_user_org_key UNIQUE (user_id, organization_id);
