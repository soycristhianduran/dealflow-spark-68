import { useEffect, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { signedSupportUrl, type SupportAttachment } from "@/lib/support-attachments";

/** Renders a message's attachments: image thumbnails + file chips (signed URLs). */
export function AttachmentChips({ items }: { items: SupportAttachment[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const a of items) {
        const u = await signedSupportUrl(a.path);
        if (u) map[a.path] = u;
      }
      if (!cancelled) setUrls(map);
    })();
    return () => { cancelled = true; };
  }, [items]);

  if (!items?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => {
        const url = urls[a.path];
        const isImg = a.type?.startsWith("image/");
        if (isImg && url) {
          return (
            <a key={a.path} href={url} target="_blank" rel="noreferrer" className="block">
              <img src={url} alt={a.name} className="h-20 w-20 rounded-lg border object-cover" />
            </a>
          );
        }
        return (
          <a key={a.path} href={url || "#"} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs hover:bg-muted">
            {isImg ? <Paperclip className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            <span className="max-w-[160px] truncate">{a.name}</span>
          </a>
        );
      })}
    </div>
  );
}
