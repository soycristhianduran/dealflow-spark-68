import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  onSend: (name: string, lang: string, vars: string[], mediaId: string, campaignName?: string, scheduledAt?: string) => void;
  sending: boolean;
  /** When true (bulk send), show + require a campaign name field. */
  requireCampaignName?: boolean;
}) {
  const { t } = useTranslation();
  const { templates, fetchTemplates } = useWhatsAppTemplates();
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
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
          <DialogTitle>{t("templatePicker.sendTemplate")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {requireCampaignName && (
            <div className="space-y-1.5">
              <Label>{t("templatePicker.campaignName")} <span className="text-red-500">*</span></Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={t("templatePicker.campaignNamePlaceholder")}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("templatePicker.approvedTemplate")}</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder={t("templatePicker.selectTemplatePlaceholder")} />
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
              <p className="text-xs text-muted-foreground">{t("templatePicker.noApprovedTemplates")}</p>
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
              <Label>{t("templatePicker.variables")}</Label>
              {varNums.map((n, i) => (
                <div key={n} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{`{{${n}}}`}</span>
                    <Input
                      placeholder={requireCampaignName ? t("templatePicker.fixedTextOrField") : t("templatePicker.valueFor", { n })}
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
                      {PERSONALIZATION_TOKENS.map((tok) => (
                        <button
                          key={tok.token}
                          type="button"
                          onClick={() =>
                            setVars((v) => { const nv = [...v]; nv[i] = ((nv[i] || "") + tok.token); return nv; })
                          }
                          className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                          title={t("templatePicker.insertToken", { token: tok.token })}
                        >
                          + {t(`templatePicker.token_${tok.token.replace(/[{}]/g, "")}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {requireCampaignName && (
                <p className="text-[11px] text-muted-foreground pl-10">
                  {t("templatePicker.fieldsReplacedPrefix")} <span className="font-mono">{"{{nombre}}"}</span> {t("templatePicker.fieldsReplacedSuffix")}
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
                      ? t("templatePicker.image")
                      : tpl.header_type === "VIDEO"
                        ? t("templatePicker.video")
                        : t("templatePicker.document")}
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

          {requireCampaignName && (
            <div className="space-y-2">
              <Label>{t("templatePicker.whenToSend")}</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={sendMode === "now" ? "default" : "outline"} className="flex-1 text-xs" onClick={() => setSendMode("now")}>
                  {t("templatePicker.sendNow")}
                </Button>
                <Button type="button" size="sm" variant={sendMode === "schedule" ? "default" : "outline"} className="flex-1 text-xs" onClick={() => setSendMode("schedule")}>
                  {t("templatePicker.schedule")}
                </Button>
              </div>
              {sendMode === "schedule" && (
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="text-sm"
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("templatePicker.cancel")}
          </Button>
          <Button
            disabled={!canSend || sending || (sendMode === "schedule" && !scheduleAt)}
            onClick={() => tpl && onSend(
              tpl.name, tpl.language, vars, mediaId,
              campaignName.trim() || undefined,
              sendMode === "schedule" && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
            )}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {t("templatePicker.processing")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                {sendMode === "schedule" ? t("templatePicker.scheduleSend") : t("templatePicker.sendNow")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
