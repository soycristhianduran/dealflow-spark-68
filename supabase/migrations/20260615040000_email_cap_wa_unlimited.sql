-- ─────────────────────────────────────────────────────────────────────────────
-- Cost-aligned messaging limits:
--   • WhatsApp automated messages → UNLIMITED on every plan. WhatsApp is billed
--     by Meta to the customer's own card, so it's not our cost — capping it would
--     only penalize a customer for something they already pay. (A technical
--     anti-abuse rate-limit can live in code, not as a commercial cap.)
--   • Email → finite caps. Email IS our cost (Resend, ~$0.0004/email, $0.90/1k
--     overage), so we bound the monthly volume per plan to protect our Resend
--     bill from abuse. Margins stay 73–98% even at full cap.
--
-- The email cap is enforced via consume_email_quota in BOTH the manual send-email
-- function and the automation-runner send_email step (added this release).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.plans SET monthly_automated_messages = NULL;  -- WhatsApp: unlimited

UPDATE public.plans SET monthly_email_sends = 1000  WHERE id = 'starter';
UPDATE public.plans SET monthly_email_sends = 5000  WHERE id = 'pro';
UPDATE public.plans SET monthly_email_sends = 25000 WHERE id = 'business';
UPDATE public.plans SET monthly_email_sends = 75000 WHERE id = 'agency';
