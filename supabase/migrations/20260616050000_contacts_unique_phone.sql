-- Hard guarantee against duplicate leads: one contact per (org, normalized phone).
-- Partial unique index over digits-only phone so "+57 3244..." and "+573244..."
-- cannot coexist in the same organization. Complements match_contact() (which
-- prevents the duplicate at the application layer) as a database-level backstop.
create unique index if not exists contacts_org_norm_phone_uniq
  on contacts (organization_id, regexp_replace(primary_phone, '[^0-9]', '', 'g'))
  where primary_phone is not null
    and length(regexp_replace(primary_phone, '[^0-9]', '', 'g')) >= 7;
