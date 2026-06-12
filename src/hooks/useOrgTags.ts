/**
 * useOrgTags — the organization's central tag catalog (Settings → Tags) with
 * per-tag colors. Single source of truth for the tag dropdowns and colored chips
 * shown in automations and the Leads list.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";

export const TAG_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b",
];

const DEFAULT_TAG_COLOR = "#64748b";

/** Soft chip styles derived from a base hex color (8-digit hex alpha). */
export function tagChipStyle(color?: string | null): React.CSSProperties {
  const c = color || DEFAULT_TAG_COLOR;
  return { backgroundColor: `${c}22`, color: c, borderColor: `${c}55` };
}

export function useOrgTags() {
  const { organizationId } = useOrganizationContext();
  const [tags, setTags] = useState<string[]>([]);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!organizationId) { setTags([]); setTagColors({}); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("organization_tags")
      .select("name, color")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });
    const rows = (data ?? []) as { name: string; color: string | null }[];
    setTags(rows.map(r => r.name));
    setTagColors(Object.fromEntries(rows.map(r => [r.name, r.color || DEFAULT_TAG_COLOR])));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const colorOf = useCallback((name: string) => tagColors[name] || DEFAULT_TAG_COLOR, [tagColors]);

  // Add a tag to the catalog (idempotent). Auto-assigns a palette color.
  const addTag = useCallback(async (raw: string): Promise<string | null> => {
    const name = raw.trim();
    if (!name || !organizationId) return null;
    const existing = tags.find(t => t.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const color = TAG_PALETTE[tags.length % TAG_PALETTE.length];
    const { error } = await supabase
      .from("organization_tags")
      .upsert({ organization_id: organizationId, name, color }, { onConflict: "organization_id,name" });
    if (error) return null;
    setTags(prev => [...prev, name].sort((a, b) => a.localeCompare(b)));
    setTagColors(prev => ({ ...prev, [name]: color }));
    return name;
  }, [organizationId, tags]);

  const setTagColor = useCallback(async (name: string, color: string) => {
    if (!organizationId) return;
    await supabase.from("organization_tags").update({ color })
      .eq("organization_id", organizationId).eq("name", name);
    setTagColors(prev => ({ ...prev, [name]: color }));
  }, [organizationId]);

  // Rename a tag everywhere (catalog, contacts, automations) via the RPC.
  const renameTag = useCallback(async (oldName: string, rawNew: string): Promise<boolean> => {
    const newName = rawNew.trim();
    if (!newName || !organizationId || oldName === newName) return false;
    if (tags.some(t => t.toLowerCase() === newName.toLowerCase() && t.toLowerCase() !== oldName.toLowerCase())) {
      return false;
    }
    const { error } = await supabase.rpc("rename_org_tag", {
      p_org_id: organizationId, p_old: oldName, p_new: newName,
    });
    if (error) return false;
    setTags(prev => prev.map(t => (t === oldName ? newName : t)).sort((a, b) => a.localeCompare(b)));
    setTagColors(prev => {
      const next = { ...prev };
      if (oldName in next) { next[newName] = next[oldName]; delete next[oldName]; }
      return next;
    });
    return true;
  }, [organizationId, tags]);

  const removeTag = useCallback(async (name: string) => {
    if (!organizationId) return;
    await supabase.from("organization_tags").delete()
      .eq("organization_id", organizationId).eq("name", name);
    setTags(prev => prev.filter(t => t !== name));
    setTagColors(prev => { const n = { ...prev }; delete n[name]; return n; });
  }, [organizationId]);

  return { tags, tagColors, colorOf, loading, addTag, setTagColor, renameTag, removeTag, refetch: fetchTags };
}
