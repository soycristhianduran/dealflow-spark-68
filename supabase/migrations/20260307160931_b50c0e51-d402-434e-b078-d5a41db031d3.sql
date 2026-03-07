
DROP POLICY IF EXISTS "Users manage own meta campaigns" ON public.meta_campaigns;
CREATE POLICY "Users manage own meta campaigns"
ON public.meta_campaigns
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
