/**
 * useOrgTags — the organization's central tag catalog (Settings → Tags).
 *
 * Single source of truth for tags shown as dropdowns when applying tags in
 * automations and in the Leads list. Reading is org-scoped via RLS; adding a tag
 * anywhere (settings, automation builder, bulk tagging) persists it here so it
 * shows up everywhere.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";

export function useOrgTags() {
  const { organizationId } = useOrganizationContext();
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!organizationId) { setTags([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("organization_tags")
      .select("name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });
    setTags((data ?? []).map((r: { name: string }) => r.name));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  // Add a tag to the catalog (idempotent). Returns the normalized tag or null.
  const addTag = useCallback(async (raw: string): Promise<string | null> => {
    const name = raw.trim();
    if (!name || !organizationId) return null;
    // Case-insensitive de-dupe against what we already have.
    const existing = tags.find(t => t.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const { error } = await supabase
      .from("organization_tags")
      .upsert({ organization_id: organizationId, name }, { onConflict: "organization_id,name" });
    if (error) return null;
    setTags(prev => [...prev, name].sort((a, b) => a.localeCompare(b)));
    return name;
  }, [organizationId, tags]);

  const removeTag = useCallback(async (name: string) => {
    if (!organizationId) return;
    await supabase
      .from("organization_tags")
      .delete()
      .eq("organization_id", organizationId)
      .eq("name", name);
    setTags(prev => prev.filter(t => t !== name));
  }, [organizationId]);

  return { tags, loading, addTag, removeTag, refetch: fetchTags };
}
