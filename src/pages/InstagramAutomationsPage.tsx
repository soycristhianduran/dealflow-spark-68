import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { useInstagramIntegration } from "@/hooks/useInstagramIntegration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Instagram, Plus, MessageCircle, MessageSquare, Sparkles,
  Trash2, Edit3, Loader2, Zap, Filter, Image as ImageIcon, X,
  Link as LinkIcon, ChevronDown, ChevronUp, ArrowLeft, Save,
} from "lucide-react";
import { toast } from "sonner";
import { InstagramPostPicker } from "@/components/crm/InstagramPostPicker";

type TriggerType = "comment" | "story_reply" | "story_mention";
type TriggerTypes = TriggerType[];

interface IgButton { title: string; url: string; }

interface Automation {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_types: TriggerTypes;
  media_id: string | null;
  keywords: string[] | null;
  match_mode: "any" | "all" | "exact";
  require_follower: boolean;
  reply_to_comment_text: string | null;
  dm_message_text: string | null;
  dm_buttons: IgButton[] | null;
  dm_message_non_follower: string | null;
  dm_buttons_non_follower: IgButton[] | null;
  follow_keyword: string | null;
  trigger_count: number;
  last_triggered_at: string | null;
}

// ── Button builder sub-component ─────────────────────────────────────────────
function ButtonBuilder({
  buttons, onChange, label,
}: {
  buttons: IgButton[];
  onChange: (btns: IgButton[]) => void;
  label?: string;
}) {
  const add = () => {
    if (buttons.length >= 3) return;
    onChange([...buttons, { title: "", url: "" }]);
  };
  const remove = (i: number) => onChange(buttons.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof IgButton, val: string) =>
    onChange(buttons.map((b, idx) => idx === i ? { ...b, [field]: val } : b));

  return (
    <div className="space-y-2">
      {label && <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>}
      {buttons.map((btn, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="flex-1 grid grid-cols-2 gap-1.5">
            <Input
              placeholder="Texto del botón (máx 20 car.)"
              value={btn.title}
              maxLength={20}
              onChange={(e) => update(i, "title", e.target.value)}
              className="text-xs h-8"
            />
            <Input
              placeholder="https://enlace.com"
              value={btn.url}
              onChange={(e) => update(i, "url", e.target.value)}
              className="text-xs h-8"
              type="url"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {buttons.length < 3 && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <LinkIcon className="h-3 w-3" />
          Agregar botón con enlace {buttons.length > 0 ? `(${3 - buttons.length} más)` : "(máx 3)"}
        </button>
      )}
    </div>
  );
}

export default function InstagramAutomationsPage() {
  const { user } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const ig = useInstagramIntegration();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [matchMode, setMatchMode] = useState<"any" | "all" | "exact">("any");
  const [mediaId, setMediaId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ id: string; preview_url: string | null; caption: string | null } | null>(null);
  const [triggerTypes, setTriggerTypes] = useState<TriggerTypes>(["comment"]);
  const [requireFollower, setRequireFollower] = useState(false);
  const [dmText, setDmText] = useState("");
  const [dmButtons, setDmButtons] = useState<IgButton[]>([]);
  const [dmNonFollowerText, setDmNonFollowerText] = useState("");
  const [dmButtonsNonFollower, setDmButtonsNonFollower] = useState<IgButton[]>([]);
  const [followKeyword, setFollowKeyword] = useState("LISTO");
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState<Automation | null>(null);

  const loadAutomations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("instagram_comment_automations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Error al cargar automatizaciones: " + error.message);
    setAutomations((data || []) as Automation[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setKeywordsInput("");
    setMatchMode("any");
    setMediaId("");
    setMediaPreview(null);
    setTriggerTypes(["comment"]);
    setRequireFollower(false);
    setDmText("");
    setDmButtons([]);
    setDmNonFollowerText("");
    setDmButtonsNonFollower([]);
    setFollowKeyword("LISTO");
    setReplyText("");
    setDialogOpen(true);
  };

  const openEdit = (a: Automation) => {
    setEditing(a);
    setName(a.name);
    setTriggerTypes(a.trigger_types?.length ? a.trigger_types : [a.trigger_type || "comment"]);
    setKeywordsInput((a.keywords || []).join(", "));
    setMatchMode(a.match_mode);
    setMediaId(a.media_id || "");
    setMediaPreview(a.media_id ? { id: a.media_id, preview_url: null, caption: null } : null);
    setRequireFollower(a.require_follower);
    setDmText(a.dm_message_text || "");
    setDmButtons(a.dm_buttons || []);
    setDmNonFollowerText(a.dm_message_non_follower || "");
    setDmButtonsNonFollower(a.dm_buttons_non_follower || []);
    setFollowKeyword(a.follow_keyword || "LISTO");
    setReplyText(a.reply_to_comment_text || "");
    setDialogOpen(true);
  };

  // When a post is picked from the visual picker, fetch its preview metadata
  // by listing media and finding the match.  This keeps the preview accurate
  // even after refresh.
  const handleMediaPicked = async (id: string | null) => {
    setMediaId(id || "");
    if (!id) {
      setMediaPreview(null);
      return;
    }
    try {
      const all = await ig.listMedia(48);
      const match = all.find((m) => m.id === id);
      setMediaPreview(match
        ? { id: match.id, preview_url: match.preview_url, caption: match.caption }
        : { id, preview_url: null, caption: null });
    } catch (_) {
      setMediaPreview({ id, preview_url: null, caption: null });
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("La automatización necesita un nombre");
      return;
    }
    if (!replyText.trim() && !dmText.trim()) {
      toast.error("Necesitas configurar al menos una acción (responder comentario o enviar DM)");
      return;
    }

    setSaving(true);
    const keywords = keywordsInput.split(",").map((k) => k.trim()).filter(Boolean);

    // Resolve ig_account_id
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!account) {
      toast.error("Conecta Instagram primero");
      setSaving(false);
      return;
    }

    const validBtns = (btns: IgButton[]) =>
      btns.filter(b => b.title.trim() && b.url.trim());

    const payload = {
      user_id: user.id,
      ig_account_id: account.id,
      name: name.trim(),
      trigger_type: triggerTypes[0] || "comment",
      trigger_types: triggerTypes,
      keywords: keywords.length > 0 ? keywords : null,
      match_mode: matchMode,
      media_id: triggerTypes.includes("comment") ? (mediaId.trim() || null) : null,
      require_follower: requireFollower,
      dm_message_text: dmText.trim() || null,
      dm_buttons: validBtns(dmButtons).length > 0 ? validBtns(dmButtons) : null,
      dm_message_non_follower: requireFollower ? (dmNonFollowerText.trim() || null) : null,
      dm_buttons_non_follower: requireFollower && validBtns(dmButtonsNonFollower).length > 0
        ? validBtns(dmButtonsNonFollower) : null,
      follow_keyword: requireFollower ? (followKeyword.trim() || "LISTO") : null,
      reply_to_comment_text: triggerTypes.includes("comment") ? (replyText.trim() || null) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = editing
      ? await supabase.from("instagram_comment_automations").update(payload).eq("id", editing.id)
      : await supabase.from("instagram_comment_automations").insert(payload);

    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      toast.success(editing ? "Automatización actualizada" : "Automatización creada");
      setDialogOpen(false);
      loadAutomations();
    }
    setSaving(false);
  };

  const toggleActive = async (a: Automation) => {
    const newState = !a.is_active;
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: newState } : x));
    const { error } = await supabase
      .from("instagram_comment_automations")
      .update({ is_active: newState })
      .eq("id", a.id);
    if (error) {
      toast.error("Error: " + error.message);
      // revert
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !newState } : x));
    }
  };

  const handleDelete = (a: Automation) => {
    setDeletingAutomation(a);
  };

  const confirmDelete = async () => {
    if (!deletingAutomation) return;
    const { error } = await supabase
      .from("instagram_comment_automations")
      .delete()
      .eq("id", deletingAutomation.id);
    setDeletingAutomation(null);
    if (error) toast.error("Error al eliminar: " + error.message);
    else {
      toast.success("Eliminada");
      loadAutomations();
    }
  };

  // ===== Not connected ======================================================
  if (!ig.loading && !ig.isConnected) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-500/10">
                <Instagram className="h-8 w-8 text-pink-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold">Conecta Instagram</h2>
            <p className="text-sm text-muted-foreground">
              Las automatizaciones requieren tener Instagram conectado. Ve a Integraciones.
            </p>
            <Button onClick={() => navigate(path("/integrations"))} className="gap-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
              <Instagram className="h-4 w-4" /> Conectar Instagram
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ===== Main view ==========================================================
  return (
    <AppLayout>
      <div className="container max-w-5xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-pink-600" />
              <h1 className="text-2xl font-bold">Automatizaciones de Instagram</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Cuando alguien comente en una publicación con cierta palabra clave, responde automáticamente
              el comentario y/o envíale un DM. Estilo ManyChat.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
            <Plus className="h-4 w-4" /> Nueva automatización
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : automations.length === 0 ? (
          <div className="text-center py-16 rounded-xl border-2 border-dashed">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-semibold mb-1">No tienes automatizaciones aún</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Crea tu primera regla: cuando alguien comente "INFO" en una publicación, le respondes automáticamente y le envías un DM con info detallada.
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Crear automatización
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <div key={a.id} className={`rounded-xl border p-5 transition-all ${!a.is_active && "opacity-60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{a.name}</h3>
                      {a.is_active ? (
                        <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-300 bg-green-50">
                          <Zap className="h-2.5 w-2.5" /> Activa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactiva</Badge>
                      )}
                      {a.trigger_count > 0 && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {a.trigger_count} activaciones
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      {/* Trigger */}
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <Filter className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-foreground font-medium flex flex-wrap gap-1">
                            {(a.trigger_types?.length ? a.trigger_types : [a.trigger_type]).map((tt) => (
                              <span key={tt}>
                                {tt === "story_reply" ? "📖 Story reply" :
                                 tt === "story_mention" ? "📣 Mención story" :
                                 "💬 Comentario"}
                              </span>
                            ))}
                          </span>{" "}
                          {a.keywords && a.keywords.length > 0 ? (
                            <>
                              <span className="text-foreground">
                                {a.match_mode === "exact" ? "exactamente " : a.match_mode === "all" ? "con todas: " : "con alguna de: "}
                              </span>
                              {a.keywords.map((k) => (
                                <Badge key={k} variant="outline" className="text-[10px] mr-1">{k}</Badge>
                              ))}
                            </>
                          ) : (
                            <span className="text-foreground">con cualquier texto</span>
                          )}
                          {(a.trigger_types?.includes("comment") || a.trigger_type === "comment") && a.media_id && <span> en pub. <code className="text-[10px]">{a.media_id.slice(-8)}</code></span>}
                          {(a.trigger_types?.includes("comment") || a.trigger_type === "comment") && !a.media_id && <span className="text-xs"> (todas las publicaciones)</span>}
                          {a.require_follower && <span className="text-xs text-orange-600 dark:text-orange-400"> · verifica seguidor</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      {a.reply_to_comment_text && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                          <div>
                            <span className="text-foreground font-medium">Responde comentario:</span>{" "}
                            <span className="italic">"{a.reply_to_comment_text}"</span>
                          </div>
                        </div>
                      )}
                      {a.dm_message_text && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-pink-500" />
                          <div>
                            <span className="text-foreground font-medium">Envía DM:</span>{" "}
                            <span className="italic">"{a.dm_message_text}"</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)} className="h-8 w-8 p-0">
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(a)} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit — full screen editor */}
        {dialogOpen && (
          <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 md:px-8 py-3 border-b bg-background/95 backdrop-blur shrink-0">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Automatizaciones
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-semibold">{editing ? "Editar automatización" : "Nueva automatización"}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editing ? "Actualizar" : "Crear automatización"}
              </Button>
            </div>

            {/* Scrollable body — two-column on wide screens */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
            <div className="space-y-5 pt-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nombre interno</Label>
                <Input
                  placeholder="Ej: Bot de info para post de lanzamiento"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Trigger section */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> Disparador (cuándo se activa)
                </h4>

                {/* Trigger type multi-select */}
                <div className="space-y-1.5">
                  <Label className="text-xs">¿Cuándo se activa? <span className="text-muted-foreground font-normal">(selecciona uno o varios)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "comment" as TriggerType, icon: "💬", label: "Comentario en post" },
                      { value: "story_reply" as TriggerType, icon: "📖", label: "Respuesta a story" },
                      { value: "story_mention" as TriggerType, icon: "📣", label: "Mención en story" },
                    ]).map((opt) => {
                      const active = triggerTypes.includes(opt.value);
                      const toggle = () => {
                        if (active) {
                          // don't allow deselecting all
                          if (triggerTypes.length === 1) return;
                          setTriggerTypes(triggerTypes.filter(t => t !== opt.value));
                        } else {
                          setTriggerTypes([...triggerTypes, opt.value]);
                        }
                      };
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={toggle}
                          className={`relative flex flex-col items-center gap-1 rounded-lg border-2 py-2.5 px-2 text-center text-xs transition-colors ${
                            active
                              ? "border-pink-500 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 font-semibold"
                              : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                          }`}
                        >
                          {active && (
                            <span className="absolute top-1 right-1.5 text-pink-500 text-[10px]">✓</span>
                          )}
                          <span className="text-base">{opt.icon}</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Puedes activar la misma automatización con varios tipos de interacción a la vez.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Palabras clave (separadas por coma)</Label>
                  <Input
                    placeholder={
                      triggerTypes.includes("story_mention") && triggerTypes.length === 1
                        ? "Vacío = cualquier mención activa la automatización"
                        : triggerTypes.includes("comment")
                        ? "Ej: INFO, precio, link"
                        : "Ej: RECURSO, quiero, info — vacío = cualquier respuesta"
                    }
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {triggerTypes.includes("story_mention") && !triggerTypes.includes("comment")
                      ? "Para story mention normalmente se deja vacío — se activa con cualquier mención."
                      : "Deja vacío para activar con cualquier interacción."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Modo de coincidencia</Label>
                  <select
                    value={matchMode}
                    onChange={(e) => setMatchMode(e.target.value as "any" | "all" | "exact")}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="any">Contiene CUALQUIERA de las palabras</option>
                    <option value="all">Contiene TODAS las palabras</option>
                    <option value="exact">Coincide EXACTAMENTE con una palabra</option>
                  </select>
                </div>

                {triggerTypes.includes("comment") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Publicación específica (opcional)</Label>
                    {mediaId ? (
                      <div className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
                        <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                          {mediaPreview?.preview_url ? (
                            <img src={mediaPreview.preview_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {mediaPreview?.caption || "Publicación seleccionada"}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            ID: ...{mediaId.slice(-12)}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                          Cambiar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMediaPicked(null)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm text-muted-foreground hover:border-pink-500/50 hover:text-foreground transition-colors"
                      >
                        <ImageIcon className="h-4 w-4" />
                        Seleccionar publicación...
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Si no eliges ninguna, la regla aplica a comentarios en TODAS tus publicaciones.
                    </p>
                  </div>
                )}

              </div>

              {/* Action 1: reply to comment — only for post comments */}
              {triggerTypes.includes("comment") && (
                <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-blue-500" /> Responder comentario (público, opcional)
                  </h4>
                  <Textarea
                    placeholder="Ej: ¡Te envié toda la info al DM {{username}}! 📨"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{`{{username}}`}</code> para mencionar. Deja vacío para no responder públicamente.
                  </p>
                </div>
              )}

              {/* DM Messages section — two panels side by side when follower mode on */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-pink-500" /> Mensaje DM privado
                </h4>

                {/* Follower toggle — visible always, prominent */}
                <div
                  className={`rounded-xl border-2 p-3 flex items-start gap-3 cursor-pointer transition-all ${
                    requireFollower
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-950/30"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                  onClick={() => setRequireFollower(!requireFollower)}
                >
                  <Switch checked={requireFollower} onCheckedChange={setRequireFollower}
                    onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">
                      Verificar si es seguidor antes de enviar
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {requireFollower
                        ? "✅ Activo — seguidores reciben el recurso, no seguidores reciben el mensaje de abajo"
                        : "Todos reciben el mismo DM sin verificar si siguen tu cuenta"}
                    </p>
                  </div>
                </div>

                {/* Follower DM */}
                <div className={`rounded-xl border p-4 space-y-3 ${
                  requireFollower
                    ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                    : "bg-muted/20"
                }`}>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    {requireFollower
                      ? <><span className="text-base">✅</span> DM para <span className="text-green-700 dark:text-green-400">seguidores</span> — el recurso o lead magnet</>
                      : <><span className="text-base">💬</span> Mensaje DM</>
                    }
                  </p>
                  <Textarea
                    placeholder={requireFollower
                      ? "Ej: ¡Hola {{username}}! 🎉 Aquí está tu recurso:\n\n👉 https://tulink.com/recurso\n\n¡Gracias por seguirme!"
                      : "Ej: ¡Hola {{username}}! Aquí está la info:\n\n👉 https://miempresa.com/oferta"}
                    value={dmText}
                    onChange={(e) => setDmText(e.target.value)}
                    rows={3}
                  />
                  <ButtonBuilder
                    buttons={dmButtons}
                    onChange={setDmButtons}
                    label="Botones con enlace (opcional, máx 3)"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Usa <code className="bg-muted px-1 rounded">{`{{username}}`}</code> para personalizar.
                  </p>
                </div>

                {/* Non-follower DM — ALWAYS visible when require_follower is on, clearly labelled */}
                {requireFollower && (
                  <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/20 p-4 space-y-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="text-base">⏳</span> DM para <span className="text-orange-600 dark:text-orange-400">NO seguidores</span> — pídeles que te sigan primero
                    </p>
                    <p className="text-[10px] text-orange-700 dark:text-orange-400">
                      Cuando te sigan y te escriban de vuelta, recibirán el recurso de arriba <strong>automáticamente</strong>.
                    </p>
                    <Textarea
                      placeholder={"Ej: ¡Hola {{username}}! 👋\n\nPara enviarte el recurso necesito que primero me sigas 🙏\n\n👉 Sígueme @tucuenta\n\nUna vez que me sigas, escríbeme aquí y te lo mando de inmediato! 📩"}
                      value={dmNonFollowerText}
                      onChange={(e) => setDmNonFollowerText(e.target.value)}
                      rows={4}
                    />
                    <ButtonBuilder
                      buttons={dmButtonsNonFollower}
                      onChange={setDmButtonsNonFollower}
                      label="Botones con enlace (ej: enlace a tu perfil)"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Deja vacío para no enviar DM a no seguidores (solo seguidores recibirán el recurso).
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom save — visible on mobile where top bar might be off screen */}
              <div className="flex gap-2 pt-4 pb-8 md:hidden">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editing ? "Actualizar" : "Crear automatización")}
                </Button>
              </div>
            </div>
          </div>
            </div>
          </div>
        )}

        {/* Visual picker — Instagram posts */}
        <InstagramPostPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selectedMediaId={mediaId || null}
          onSelect={handleMediaPicked}
        />
      </div>

      {/* ── Delete automation confirmation ──────────────────────────── */}
      <AlertDialog open={!!deletingAutomation} onOpenChange={open => { if (!open) setDeletingAutomation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar automatización?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>"{deletingAutomation?.name}"</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
