import { supabase } from "@/integrations/supabase/client";

export interface SupportAttachment { path: string; name: string; type: string; size: number; }

export const SUPPORT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = "support-attachments";

/** Upload files to the private support bucket. Throws on oversize/upload error. */
export async function uploadSupportFiles(
  files: File[], orgId: string, ticketId: string,
): Promise<SupportAttachment[]> {
  const out: SupportAttachment[] = [];
  for (const f of files) {
    if (f.size > SUPPORT_MAX_BYTES) throw new Error(`"${f.name}" supera el límite de 10 MB`);
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    const path = `${orgId}/${ticketId}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false, contentType: f.type || undefined });
    if (error) throw error;
    out.push({ path, name: f.name, type: f.type, size: f.size });
  }
  return out;
}

/** Signed URL (1h) to view/download an attachment. */
export async function signedSupportUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
