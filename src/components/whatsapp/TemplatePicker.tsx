import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import type { WaTemplateButton } from "@/hooks/useWhatsAppTemplates";
import { MediaUploadZone } from "./MediaUploadZone";
import { MEDIA_HEADER_TYPES } from "./helpers";

// Personalization tokens resolved per-contact on bulk send (see ContactsPage.handleWaBlast).
const PERSONALIZATION_TOKENS = [
  { label: "Nombre", token: "{{nombre}}" },
  { label: "Nombre completo", token: "{{nombre_completo}}" },
  { label: "Empresa", token: "{{empresa}}" },
];

/**
 * Modal that lets the user pick + send a Meta-approved WhatsApp template.
 * Used both:
 *   - From the chat panel's "📋" button (existing conversation)
 *   - When the 24h window is closed and free-form messages are blocked
 *   - When starting a brand-new conversation (NewConvDialog wraps this)
 *
 * Handles media-header templates (IMAGE/VIDEO/DOCUMENT) and variable
 * substitution ({{1}}, {{2}}, …).
 */
export function TemplatePicker({
  open,
  onClose,
  onSend,
  sending,
  requireCampaignName = false,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (name: string, lang: string, vars: string[], mediaId: string, campaignName?: string) => void;
  sending: boolean;
  /** When true (bulk send), show + require a campaign name field. */
  requireCampaignName?: boolean;
}) {
  const { templates, fetchTemplates } = useWhatsAppTemplates();
  const approved = templates.filter((t) => t.status === "APPROVED");
  const [selected, setSelected] = useState<string>("");
  const [vars, setVars] = useState<string[]>([]);
  const [mediaId, setMediaId] = useState("");
  const [campaignName, setCampaignName] = useState("");

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

  const tpl = approved.find((t) => t.name === selected);
  const needsMedia = tpl && MEDIA_HEADER_TYPES.includes(tpl.header_type || "");
  const varNums = tpl
    ? [...new Set((tpl.body_text.match(/\{\{(\d+)\}\}/g) || []).map((m) => parseInt(m.replace(/[{}]/g, ""))))].sort((a, b) => a - b)
    : [];

  useEffect(() => {
    setVars(varNums.map(() => ""));
    setMediaId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const preview = tpl
    ? varNums.reduce(
        (text, n, i) => text.replace(new RegExp(`\\{\\{${n}\\}\\}`, "g"), vars[i] || `{{${n}}}`),
        tpl.body_text,
      )
    : "";

  const canSend = selected && (!needsMedia || mediaId.trim()) && (!requireCampaignName || campaignName.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar plantilla</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {requireCampaignName && (
            <div className="space-y-1.5">
              <Label>Nombre de la campaña <span className="text-red-500">*</span></Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ej: Lanzamiento Verdanzza junio"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Plantilla aprobada</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una plantilla..." />
              </SelectTrigger>
              <SelectContent>
                {approved.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}
                    {t.header_type && MEDIA_HEADER_TYPES.includes(t.header_type) ? " 🖼" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {approved.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay plantillas aprobadas.</p>
            )}
          </div>

          {needsMedia && (
            <MediaUploadZone
              headerType={tpl!.header_type!}
              mediaId={mediaId}
              onChange={setMediaId}
            />
          )}

          {tpl && varNums.length > 0 && (
            <div className="space-y-2">
              <Label>Variables</Label>
              {varNums.map((n, i) => (
                <div key={n} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{`{{${n}}}`}</span>
                    <Input
                      placeholder={requireCampaignName ? "Texto fijo o usa un campo →" : `Valor para {{${n}}}`}
                      value={vars[i] || ""}
                      onChange={(e) =>
                        setVars((v) => {
                          const nv = [...v];
                          nv[i] = e.target.value;
                          return nv;
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  {requireCampaignName && (
                    <div className="flex flex-wrap gap-1 pl-10">
                      {PERSONALIZATION_TOKENS.map((t) => (
                        <button
                          key={t.token}
                          type="button"
                          onClick={() =>
                            setVars((v) => { const nv = [...v]; nv[i] = ((nv[i] || "") + t.token); return nv; })
                          }
                          className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                          title={`Inserta ${t.token}`}
                        >
                          + {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {requireCampaignName && (
                <p className="text-[11px] text-muted-foreground pl-10">
                  Los campos como <span className="font-mono">{"{{nombre}}"}</span> se reemplazan por el dato de cada contacto al enviar.
                </p>
              )}
            </div>
          )}

          {tpl && (
            <div className="bg-[#e5ddd5] rounded-lg p-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm text-sm space-y-1">
                {tpl.header_text && <p className="font-bold text-xs">{tpl.header_text}</p>}
                {needsMedia && (
                  <div className="bg-gray-100 rounded p-1.5 text-center text-xs text-muted-foreground">
                    {tpl.header_type === "IMAGE"
                      ? "🖼 Imagen"
                      : tpl.header_type === "VIDEO"
                        ? "🎬 Video"
                        : "📄 Documento"}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm">{preview}</p>
                {tpl.footer_text && (
                  <p className="text-xs text-gray-400 italic">{tpl.footer_text}</p>
                )}
                {tpl.buttons && (tpl.buttons as WaTemplateButton[]).length > 0 && (
                  <div className="border-t pt-1 flex flex-wrap gap-1">
                    {(tpl.buttons as WaTemplateButton[]).map((b, i) => (
                      <span key={i} className="text-xs text-blue-500 font-medium">
                        {b.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!canSend || sending}
            onClick={() => tpl && onSend(tpl.name, tpl.language, vars, mediaId, campaignName.trim() || undefined)}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Enviar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
