-- Migrate ia_landings_credits from flat integer credits → actual token counts (BIGINT)
-- Starter pack ($9)  → 300,000 tokens
-- Pro pack ($35)     → 1,100,000 tokens

ALTER TABLE public.ia_landings_credits
  ALTER COLUMN credits_initial   TYPE BIGINT,
  ALTER COLUMN credits_remaining TYPE BIGINT;

-- Upgrade any existing test rows (50 flat credits) to a starter-pack token amount
UPDATE public.ia_landings_credits
SET    credits_initial   = 300000,
       credits_remaining = 300000,
       updated_at        = now()
WHERE  credits_remaining <= 50;
