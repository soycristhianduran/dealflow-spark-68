import { Paperclip, X } from "lucide-react";

const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

/** Attach-files control: a button + chips for the currently selected files. */
export function FilePicker({
  id, files, onPick, onRemove,
}: {
  id: string;
  files: File[];
  onPick: (list: FileList | null) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
        <Paperclip className="h-3.5 w-3.5" /> Adjuntar archivo
      </label>
      <input id={id} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => { onPick(e.target.files); e.currentTarget.value = ""; }} />
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded border bg-muted px-2 py-1 text-[11px]">
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
