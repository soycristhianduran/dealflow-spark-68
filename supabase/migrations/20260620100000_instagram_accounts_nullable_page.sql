-- Instagram Business Login accounts (Instagram API with Instagram Login) are
-- NOT tied to a Facebook Page, so they have no page_id. Allow page_id to be
-- NULL. Page-token (Facebook Login) accounts continue to store their page_id.
ALTER TABLE public.instagram_accounts ALTER COLUMN page_id DROP NOT NULL;
