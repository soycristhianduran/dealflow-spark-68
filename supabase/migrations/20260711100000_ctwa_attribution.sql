-- Atribución de campañas de clic-a-WhatsApp (CTWA): las campañas que llevan
-- tráfico directo a WhatsApp no usan UTMs; Meta manda un objeto `referral` en
-- el primer mensaje con el id del anuncio y un identificador de clic
-- (ctwa_clid) que es la llave de atribución para la Conversions API.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;
