-- The signup provisioning (provision_new_user) calls public.slugify(text), but
-- the function was never created in the live DB (the original migration depended
-- on the `unaccent` extension, which is not installed → creation was skipped).
-- Result: provision_new_user threw "function public.slugify(text) does not exist"
-- for EVERY new signup, leaving users with no organization.
--
-- This version is dependency-free: it folds common Spanish accents via translate()
-- then slugifies. IMMUTABLE so it can be used anywhere.
CREATE OR REPLACE FUNCTION public.slugify(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        lower(translate(
          coalesce(p_text, ''),
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
        )),
        '[^a-z0-9]+', '-', 'g'   -- non-alphanumerics → dash
      ),
      '-+', '-', 'g'             -- collapse repeats
    )
  );
$$;
