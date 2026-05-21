import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadTemplateMedia } from "./helpers";

/**
 * Drag-drop + click-to-pick file uploader shown inside the TemplatePicker
 * when the chosen template's header requires an image/video/document.
 *
 * Validates size, uploads to Meta via the whatsapp-api Edge Function, and
 * reports the resulting media_id back via the `onChange` callback.
 */
export function MediaUploadZone({
  headerType,
  mediaId,
  onChange,
}: {
  headerType: string;
  mediaId: string;
  onChange: (id: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const accept =
    headerType === "IMAGE"
      ? "image/jpeg,image/png,image/webp"
      : headerType === "VIDEO"
        ? "video/mp4,video/3gpp"
        : "application/pdf";
  const label =
    headerType === "IMAGE" ? "imagen" : headerType === "VIDEO" ? "video" : "documento";
  const maxMb = headerType === "VIDEO" ? 16 : 5;

  const handleFile = async (file: File) => {
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Máximo ${maxMb}MB`);
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setUploading(true);
    try {
      const id = await uploadTemplateMedia(file);
      onChange(id);
      toast.success("Listo ✓");
    } catch (e: any) {
      setPreview("");
      onChange("");
      toast.error("Error al subir: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>
        {headerType === "IMAGE" ? "Imagen" : headerType === "VIDEO" ? "Video" : "Documento"}{" "}
        <span className="text-red-500">*</span>
      </Label>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          uploading
            ? "border-primary/40 bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent",
        )}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Subiendo...</p>
          </div>
        ) : preview && mediaId ? (
          <div className="space-y-1.5">
            {headerType === "IMAGE" ? (
              <img
                src={preview}
                alt="preview"
                className="max-h-28 mx-auto rounded object-contain"
              />
            ) : (
              <video src={preview} className="max-h-28 mx-auto rounded" controls />
            )}
            <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
              <Check className="h-3 w-3" /> Listo — haz clic para cambiar
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <div className="text-2xl">
              {headerType === "IMAGE" ? "🖼" : headerType === "VIDEO" ? "🎬" : "📄"}
            </div>
            <p className="text-sm font-medium">Haz clic o arrastra tu {label} aquí</p>
            <p className="text-xs text-muted-foreground">
              {headerType === "IMAGE"
                ? "JPG, PNG, WebP"
                : headerType === "VIDEO"
                  ? "MP4, 3GPP"
                  : "PDF"}{" "}
              · máx. {maxMb}MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
