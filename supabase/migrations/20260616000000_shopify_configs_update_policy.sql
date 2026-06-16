-- Allow org members to disconnect (update is_active) their store.
DROP POLICY IF EXISTS "org_update_shopify_configs" ON public.shopify_configs;
CREATE POLICY "org_update_shopify_configs"
  ON public.shopify_configs FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
