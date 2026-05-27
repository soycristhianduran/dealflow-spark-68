-- Update plans table with correct Stripe price IDs
-- Run after confirming price IDs in Stripe dashboard

UPDATE plans
SET stripe_price_id_monthly = 'price_1TZGF4RvVDvs7cXC0gJWilcd',
    stripe_price_id_annual  = 'price_1TZGF4RvVDvs7cXCaFSIXzD2'
WHERE id = 'starter';

UPDATE plans
SET stripe_price_id_monthly = 'price_1TZGG0RvVDvs7cXCN7XrJtpL',
    stripe_price_id_annual  = 'price_1TZGGQRvVDvs7cXCHzapX9EB'
WHERE id = 'pro';

UPDATE plans
SET stripe_price_id_monthly = 'price_1TZGHiRvVDvs7cXCzhZCkNic',
    stripe_price_id_annual  = 'price_1TZGJ2RvVDvs7cXCVoGGI7v4'
WHERE id = 'business';
