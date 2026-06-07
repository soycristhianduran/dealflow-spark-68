-- Auto-populate organization_id in whatsapp_configs where it's NULL
-- Joins with organization_members to find the user's default organization
UPDATE public.whatsapp_configs wc
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE wc.user_id = om.user_id
  AND wc.organization_id IS NULL;

-- Also sync channels table
UPDATE public.channels c
SET organization_id = om.organization_id  
FROM public.organization_members om
WHERE c.user_id = om.user_id
  AND c.organization_id IS NULL
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='channels' AND column_name='organization_id');
