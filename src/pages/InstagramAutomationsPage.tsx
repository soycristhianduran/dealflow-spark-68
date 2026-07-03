import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
import { useTranslation } from "react-i18next";
import { InstagramPostPicker } from "@/components/crm/InstagramPostPicker";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Facebook } from "lucide-react";
import { FacebookPostPicker } from "@/components/crm/FacebookPostPicker";

type TriggerType = "comment" | "story_reply" | "story_mention" | "new_follower";
type TriggerTypes = TriggerType[];
type Network = "instagram" | "facebook";

interface IgButton { title: string; url: string; }

interface Automation {
  networks: Network[] | null;
  fb_page_id: string | null;
  fb_post_ids: string[] | null;
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_types: TriggerTypes;
  media_id: string | null;
  media_ids: string[] | null;
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
  const { t } = useTranslation();
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
              placeholder={t("instagramAutomationsPage.buttonTextPlaceholder")}
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
          {t("instagramAutomationsPage.addLinkButton")} {buttons.length > 0 ? t("instagramAutomationsPage.moreCount", { count: 3 - buttons.length }) : t("instagramAutomationsPage.maxThree")}
        </button>
      )}
    </div>
  );
}

// Variables disponibles para personalizar mensajes
const IG_VARS = [
  { labelKey: "varNameLabel", tag: "{{nombre}}", descKey: "varNameDesc" },
  { labelKey: "varUsernameLabel", tag: "{{username}}", descKey: "varUsernameDesc" },
];

// Textarea con chips de variables clicables — estilo ManyChat
function VarTextarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);

  const insertVar = (tag: string) => {
    const el = ref.current;
    if (!el) { onChange(value + tag); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tag + value.slice(end);
    onChange(next);
    // Restore cursor after inserted tag
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  return (
    <div className="space-y-1.5">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-none"
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">{t("instagramAutomationsPage.insert")}</span>
        {IG_VARS.map((v) => (
          <button
            key={v.tag}
            type="button"
            title={t(`instagramAutomationsPage.${v.descKey}`)}
            onClick={() => insertVar(v.tag)}
            className="inline-flex items-center gap-1 rounded-full border border-pink-300 dark:border-pink-700 bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 px-2 py-0.5 text-[11px] font-medium hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-colors"
          >
            + {t(`instagramAutomationsPage.${v.labelKey}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InstagramAutomationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const ig = useInstagramIntegration();
  const { organizationId } = useOrganizationContext();

  // Facebook pages connected to this org (for the Facebook network)
  const [fbPages, setFbPages] = useState<{ page_id: string; page_name: string }[]>([]);
  useEffect(() => {
    if (!organizationId) { setFbPages([]); return; }
    supabase.from("facebook_pages")
      .select("page_id, page_name")
      .eq("organization_id", organizationId)
      .then(({ data }) => setFbPages(data || []));
  }, [organizationId]);

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [networks, setNetworks] = useState<Network[]>(["instagram"]);
  const [fbPageId, setFbPageId] = useState<string>("");
  const [fbPostIds, setFbPostIds] = useState<string[]>([]);
  const [fbPickerOpen, setFbPickerOpen] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState("");
  const [matchMode, setMatchMode] = useState<"any" | "all" | "exact">("any");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
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
    if (error) toast.error(t("instagramAutomationsPage.loadError") + error.message);
    setAutomations((data || []) as Automation[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setNetworks(["instagram"]);
    setFbPageId(fbPages[0]?.page_id || "");
    setFbPostIds([]);
    setKeywordsInput("");
    setMatchMode("any");
    setMediaIds([]);
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
    setNetworks(a.networks?.length ? a.networks : ["instagram"]);
    setFbPageId(a.fb_page_id || fbPages[0]?.page_id || "");
    setFbPostIds(a.fb_post_ids || []);
    setTriggerTypes(a.trigger_types?.length ? a.trigger_types : [a.trigger_type || "comment"]);
    setKeywordsInput((a.keywords || []).join(", "));
    setMatchMode(a.match_mode);
    // Support legacy single media_id and new media_ids array
    const ids = a.media_ids?.length ? a.media_ids : (a.media_id ? [a.media_id] : []);
    setMediaIds(ids);
    setRequireFollower(a.require_follower);
    setDmText(a.dm_message_text || "");
    setDmButtons(a.dm_buttons || []);
    setDmNonFollowerText(a.dm_message_non_follower || "");
    setDmButtonsNonFollower(a.dm_buttons_non_follower || []);
    setFollowKeyword(a.follow_keyword || "LISTO");
    setReplyText(a.reply_to_comment_text || "");
    setDialogOpen(true);
  };

  const handleMediaPicked = (ids: string[]) => {
    setMediaIds(ids);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error(t("instagramAutomationsPage.needNameError"));
      return;
    }
    if (!replyText.trim() && !dmText.trim()) {
      toast.error(t("instagramAutomationsPage.needActionError"));
      return;
    }

    const hasIg = networks.includes("instagram");
    const hasFb = networks.includes("facebook");
    if (hasFb && !fbPageId && fbPages.length === 0) {
      toast.error(t("instagramAutomationsPage.needFbPageError"));
      return;
    }

    setSaving(true);
    const keywords = keywordsInput.split(",").map((k) => k.trim()).filter(Boolean);

    // Resolve ig_account_id (required only when the automation runs on Instagram)
    let igAccountId: string | null = null;
    if (hasIg) {
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!account) {
        toast.error(t("instagramAutomationsPage.connectFirstError"));
        setSaving(false);
        return;
      }
      igAccountId = account.id;
    }

    const validBtns = (btns: IgButton[]) =>
      btns.filter(b => b.title.trim() && b.url.trim());

    const payload = {
      user_id: user.id,
      ig_account_id: igAccountId,
      organization_id: organizationId,
      networks,
      fb_page_id: hasFb ? (fbPageId || fbPages[0]?.page_id || null) : null,
      fb_post_ids: hasFb && triggerTypes.includes("comment") ? fbPostIds : [],
      name: name.trim(),
      trigger_type: triggerTypes[0] || "comment",
      trigger_types: triggerTypes,
      keywords: keywords.length > 0 ? keywords : null,
      match_mode: matchMode,
      media_id: triggerTypes.includes("comment") ? (mediaIds[0] || null) : null,
      media_ids: triggerTypes.includes("comment") ? mediaIds : [],
      // Follower gate only exists on Instagram — force off for FB-only automations
      require_follower: hasIg && requireFollower,
      dm_message_text: dmText.trim() || null,
      dm_buttons: validBtns(dmButtons).length > 0 ? validBtns(dmButtons) : null,
      dm_message_non_follower: hasIg && requireFollower ? (dmNonFollowerText.trim() || null) : null,
      dm_buttons_non_follower: hasIg && requireFollower && validBtns(dmButtonsNonFollower).length > 0
        ? validBtns(dmButtonsNonFollower) : null,
      follow_keyword: hasIg && requireFollower ? (followKeyword.trim() || "LISTO") : null,
      reply_to_comment_text: triggerTypes.includes("comment") ? (replyText.trim() || null) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = editing
      ? await supabase.from("instagram_comment_automations").update(payload).eq("id", editing.id)
      : await supabase.from("instagram_comment_automations").insert(payload);

    if (error) {
      toast.error(t("instagramAutomationsPage.saveError") + error.message);
    } else {
      // Make sure the FB page is subscribed to feed events so comments arrive.
      if (hasFb) {
        const pid = fbPageId || fbPages[0]?.page_id;
        if (pid) {
          supabase.functions.invoke("facebook-api", {
            body: { action: "subscribe_page_feed", page_id: pid, organization_id: organizationId },
          }).then(({ data }) => {
            if (data && data.success === false) {
              toast.warning(t("instagramAutomationsPage.fbFeedSubscribeWarning") + (data.error ? `: ${data.error}` : ""));
            }
          }).catch(() => {});
        }
      }
      toast.success(editing ? t("instagramAutomationsPage.updatedMsg") : t("instagramAutomationsPage.createdMsg"));
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
      toast.error(t("instagramAutomationsPage.genericError") + error.message);
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
    if (error) toast.error(t("instagramAutomationsPage.deleteError") + error.message);
    else {
      toast.success(t("instagramAutomationsPage.deletedMsg"));
      loadAutomations();
    }
  };

  // ===== Not connected (neither IG nor a FB page) ===========================
  if (!ig.loading && !ig.isConnected && fbPages.length === 0) {
    return (
      <AppLayout>
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-500/10">
                <Instagram className="h-8 w-8 text-pink-600" />
              </div>
            </div>
            <h2 className="text-lg font-bold">{t("instagramAutomationsPage.connectTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("instagramAutomationsPage.connectDescription")}
            </p>
            <Button onClick={() => navigate(path("/integrations"))} className="gap-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
              <Instagram className="h-4 w-4" /> {t("instagramAutomationsPage.connectInstagram")}
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
              <h1 className="text-2xl font-bold">{t("instagramAutomationsPage.pageTitle")}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t("instagramAutomationsPage.pageDescription")}
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
            <Plus className="h-4 w-4" /> {t("instagramAutomationsPage.newAutomation")}
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
            <h3 className="font-semibold mb-1">{t("instagramAutomationsPage.emptyTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {t("instagramAutomationsPage.emptyDescription")}
            </p>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> {t("instagramAutomationsPage.createAutomation")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <div key={a.id} className={`rounded-xl border p-5 transition-all ${!a.is_active && "opacity-60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold">{a.name}</h3>
                      <span className="flex items-center gap-1">
                        {(a.networks?.length ? a.networks : ["instagram"]).includes("instagram") && (
                          <span title="Instagram" className="flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br from-pink-500/15 to-orange-500/15">
                            <Instagram className="h-3 w-3 text-pink-600" />
                          </span>
                        )}
                        {(a.networks || []).includes("facebook") && (
                          <span title="Facebook" className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/15">
                            <Facebook className="h-3 w-3 text-blue-600" />
                          </span>
                        )}
                      </span>
                      {a.is_active ? (
                        <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-300 bg-green-50">
                          <Zap className="h-2.5 w-2.5" /> {t("instagramAutomationsPage.active")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("instagramAutomationsPage.inactive")}</Badge>
                      )}
                      {a.trigger_count > 0 && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {t("instagramAutomationsPage.triggerCount", { count: a.trigger_count })}
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
                                {tt === "story_reply" ? t("instagramAutomationsPage.triggerStoryReply") :
                                 tt === "story_mention" ? t("instagramAutomationsPage.triggerStoryMention") :
                                 tt === "new_follower" ? t("instagramAutomationsPage.triggerNewFollower") :
                                 t("instagramAutomationsPage.triggerComment")}
                              </span>
                            ))}
                          </span>{" "}
                          {a.keywords && a.keywords.length > 0 ? (
                            <>
                              <span className="text-foreground">
                                {a.match_mode === "exact" ? t("instagramAutomationsPage.matchExactly") : a.match_mode === "all" ? t("instagramAutomationsPage.matchAll") : t("instagramAutomationsPage.matchAny")}
                              </span>
                              {a.keywords.map((k) => (
                                <Badge key={k} variant="outline" className="text-[10px] mr-1">{k}</Badge>
                              ))}
                            </>
                          ) : (
                            <span className="text-foreground">{t("instagramAutomationsPage.withAnyText")}</span>
                          )}
                          {(a.trigger_types?.includes("comment") || a.trigger_type === "comment") && (a.media_ids?.length || a.media_id) && <span> {t("instagramAutomationsPage.inNPosts", { count: a.media_ids?.length || 1 })}</span>}
                          {(a.trigger_types?.includes("comment") || a.trigger_type === "comment") && !a.media_ids?.length && !a.media_id && <span className="text-xs"> {t("instagramAutomationsPage.allPostsHint")}</span>}
                          {a.require_follower && <span className="text-xs text-orange-600 dark:text-orange-400"> {t("instagramAutomationsPage.verifiesFollower")}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      {a.reply_to_comment_text && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                          <div>
                            <span className="text-foreground font-medium">{t("instagramAutomationsPage.repliesComment")}</span>{" "}
                            <span className="italic">"{a.reply_to_comment_text}"</span>
                          </div>
                        </div>
                      )}
                      {a.dm_message_text && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-pink-500" />
                          <div>
                            <span className="text-foreground font-medium">{t("instagramAutomationsPage.sendsDm")}</span>{" "}
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

        {/* Create / Edit — full screen editor (portal ensures it's above AppHeader stacking context) */}
        {dialogOpen && createPortal(
          <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 md:px-8 py-3 border-b bg-background/95 backdrop-blur shrink-0">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> {t("instagramAutomationsPage.breadcrumbAutomations")}
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-semibold">{editing ? t("instagramAutomationsPage.editAutomation") : t("instagramAutomationsPage.newAutomation")}</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>{t("instagramAutomationsPage.cancel")}</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editing ? t("instagramAutomationsPage.update") : t("instagramAutomationsPage.createAutomation")}
              </Button>
            </div>

            {/* Scrollable body — two-column on wide screens */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 md:px-8 py-6">
            <div className="space-y-5 pt-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("instagramAutomationsPage.internalName")}</Label>
                <Input
                  placeholder={t("instagramAutomationsPage.internalNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Networks */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("instagramAutomationsPage.networksLabel")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "instagram" as Network, icon: <Instagram className="h-4 w-4" />, label: "Instagram", disabled: false },
                    { value: "facebook" as Network, icon: <Facebook className="h-4 w-4" />, label: "Facebook", disabled: fbPages.length === 0 },
                  ]).map((opt) => {
                    const active = networks.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (active) {
                            if (networks.length === 1) return; // keep at least one
                            setNetworks(networks.filter(n => n !== opt.value));
                          } else {
                            setNetworks([...networks, opt.value]);
                          }
                        }}
                        className={`relative flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 px-2 text-xs transition-colors ${
                          active
                            ? "border-pink-500 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 font-semibold"
                            : "border-border text-muted-foreground hover:border-muted-foreground/40"
                        } ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {active && <span className="absolute top-1 right-1.5 text-pink-500 text-[10px]">✓</span>}
                        {opt.icon} {opt.label}
                      </button>
                    );
                  })}
                </div>
                {fbPages.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">{t("instagramAutomationsPage.fbNotConnectedHint")}</p>
                )}
                {networks.includes("facebook") && fbPages.length > 1 && (
                  <select
                    value={fbPageId}
                    onChange={(e) => setFbPageId(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {fbPages.map(p => <option key={p.page_id} value={p.page_id}>{p.page_name}</option>)}
                  </select>
                )}
                {networks.includes("facebook") && (
                  <p className="text-[10px] text-muted-foreground">{t("instagramAutomationsPage.fbScopeHint")}</p>
                )}
              </div>

              {/* Trigger section */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5" /> {t("instagramAutomationsPage.triggerSectionTitle")}
                </h4>

                {/* Trigger type multi-select */}
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("instagramAutomationsPage.whenActivates")} <span className="text-muted-foreground font-normal">{t("instagramAutomationsPage.selectOneOrMore")}</span></Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([
                      { value: "comment" as TriggerType, icon: "💬", label: t("instagramAutomationsPage.optCommentOnPost") },
                      { value: "story_reply" as TriggerType, icon: "📖", label: t("instagramAutomationsPage.optStoryReply") },
                      { value: "story_mention" as TriggerType, icon: "📣", label: t("instagramAutomationsPage.optStoryMention") },
                      { value: "new_follower" as TriggerType, icon: "🤝", label: t("instagramAutomationsPage.optNewFollower") },
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
                  <p className="text-[10px] text-muted-foreground">{t("instagramAutomationsPage.multiTriggerHint")}</p>
                  {networks.includes("facebook") && (
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">{t("instagramAutomationsPage.fbTriggersNote")}</p>
                  )}
                </div>

                {/* Keywords & match mode hidden when only new_follower */}
                {!(triggerTypes.length === 1 && triggerTypes[0] === "new_follower") && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("instagramAutomationsPage.keywordsLabel")}</Label>
                      <Input
                        placeholder={
                          triggerTypes.includes("story_mention") && triggerTypes.length === 1
                            ? t("instagramAutomationsPage.keywordsPlaceholderMention")
                            : triggerTypes.includes("comment")
                            ? t("instagramAutomationsPage.keywordsPlaceholderComment")
                            : t("instagramAutomationsPage.keywordsPlaceholderReply")
                        }
                        value={keywordsInput}
                        onChange={(e) => setKeywordsInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("instagramAutomationsPage.matchModeLabel")}</Label>
                      <select
                        value={matchMode}
                        onChange={(e) => setMatchMode(e.target.value as "any" | "all" | "exact")}
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="any">{t("instagramAutomationsPage.matchOptionAny")}</option>
                        <option value="all">{t("instagramAutomationsPage.matchOptionAll")}</option>
                        <option value="exact">{t("instagramAutomationsPage.matchOptionExact")}</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* IG post picker — hidden for Facebook-only automations (FB always
                    listens on all page posts; only the keyword filters there) */}
                {triggerTypes.includes("comment") && networks.includes("instagram") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("instagramAutomationsPage.specificPostsLabel")} <span className="text-muted-foreground font-normal">{networks.includes("facebook") ? t("instagramAutomationsPage.igOnlyTag") : ""}</span></Label>
                    {mediaIds.length > 0 ? (
                      <div className="rounded-xl border bg-background p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {mediaIds.length > 1
                              ? t("instagramAutomationsPage.postsSelectedPlural", { count: mediaIds.length })
                              : t("instagramAutomationsPage.postsSelectedSingular", { count: mediaIds.length })}
                          </span>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                              {t("instagramAutomationsPage.change")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setMediaIds([])}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {mediaIds.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              ID: ...{id.slice(-8)}
                              <button type="button" onClick={() => setMediaIds((prev) => prev.filter((x) => x !== id))}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm text-muted-foreground hover:border-pink-500/50 hover:text-foreground transition-colors"
                      >
                        <ImageIcon className="h-4 w-4" />
                        {t("instagramAutomationsPage.selectPosts")}
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {t("instagramAutomationsPage.allPostsRuleHint")}
                    </p>
                  </div>
                )}

                {/* Facebook post picker — same idea as the IG one, for the page */}
                {triggerTypes.includes("comment") && networks.includes("facebook") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {t("instagramAutomationsPage.specificFbPostsLabel")}
                    </Label>
                    {fbPostIds.length > 0 ? (
                      <div className="rounded-xl border bg-background p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {t("instagramAutomationsPage.fbPostsSelected", { count: fbPostIds.length })}
                          </span>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setFbPickerOpen(true)}>
                              {t("instagramAutomationsPage.change")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setFbPostIds([])}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {fbPostIds.map((id) => (
                            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              ID: ...{id.slice(-8)}
                              <button type="button" onClick={() => setFbPostIds(prev => prev.filter(x => x !== id))}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFbPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm text-muted-foreground hover:border-blue-500/50 hover:text-foreground transition-colors"
                      >
                        <Facebook className="h-4 w-4" />
                        {t("instagramAutomationsPage.selectFbPosts")}
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {t("instagramAutomationsPage.allPostsRuleHint")}
                    </p>
                  </div>
                )}

              </div>

              {/* Action 1: reply to comment — only for post comments */}
              {triggerTypes.includes("comment") && (
                <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 p-4 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-blue-500" /> {t("instagramAutomationsPage.replyCommentSectionTitle")}
                  </h4>
                  <VarTextarea
                    placeholder={t("instagramAutomationsPage.replyCommentPlaceholder")}
                    value={replyText}
                    onChange={setReplyText}
                    rows={2}
                  />
                </div>
              )}

              {/* DM Messages section — two panels side by side when follower mode on */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-pink-500" /> {t("instagramAutomationsPage.dmSectionTitle")}
                </h4>

                {/* Follower toggle — Instagram only (Facebook's API can't verify follows) */}
                {networks.includes("instagram") ? (
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
                        {t("instagramAutomationsPage.verifyFollowerTitle")}
                        {networks.includes("facebook") && (
                          <span className="ml-1.5 text-[10px] font-normal text-orange-600 dark:text-orange-400">
                            {t("instagramAutomationsPage.igOnlyTag")}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {requireFollower
                          ? t("instagramAutomationsPage.verifyFollowerActive")
                          : t("instagramAutomationsPage.verifyFollowerInactive")}
                      </p>
                      {requireFollower && networks.includes("facebook") && (
                        <p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1">
                          {t("instagramAutomationsPage.fbNoGateNote")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border p-3 bg-muted/30">
                    <p className="text-[10px] text-muted-foreground">
                      {t("instagramAutomationsPage.fbNoGateNote")}
                    </p>
                  </div>
                )}

                {/* Follower DM */}
                <div className={`rounded-xl border p-4 space-y-3 ${
                  requireFollower
                    ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                    : "bg-muted/20"
                }`}>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    {requireFollower
                      ? <><span className="text-base">✅</span> {t("instagramAutomationsPage.dmForFollowersPre")} <span className="text-green-700 dark:text-green-400">{t("instagramAutomationsPage.followersWord")}</span> {t("instagramAutomationsPage.dmForFollowersPost")}</>
                      : <><span className="text-base">💬</span> {t("instagramAutomationsPage.dmMessageLabel")}</>
                    }
                  </p>
                  <VarTextarea
                    value={dmText}
                    onChange={setDmText}
                    placeholder={requireFollower
                      ? t("instagramAutomationsPage.dmFollowerPlaceholder")
                      : t("instagramAutomationsPage.dmDefaultPlaceholder")}
                    rows={4}
                  />
                  <ButtonBuilder
                    buttons={dmButtons}
                    onChange={setDmButtons}
                    label={t("instagramAutomationsPage.linkButtonsLabel")}
                  />
                </div>

                {/* Non-follower DM — ALWAYS visible when require_follower is on, clearly labelled */}
                {requireFollower && (
                  <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/20 p-4 space-y-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <span className="text-base">⏳</span> {t("instagramAutomationsPage.dmForNonFollowersPre")} <span className="text-orange-600 dark:text-orange-400">{t("instagramAutomationsPage.nonFollowersWord")}</span> {t("instagramAutomationsPage.dmForNonFollowersPost")}
                    </p>
                    <p className="text-[10px] text-orange-700 dark:text-orange-400">
                      {t("instagramAutomationsPage.nonFollowerExplainPre")} <strong>{t("instagramAutomationsPage.automaticallyWord")}</strong>.
                    </p>
                    <VarTextarea
                      value={dmNonFollowerText}
                      onChange={setDmNonFollowerText}
                      placeholder={t("instagramAutomationsPage.dmNonFollowerPlaceholder")}
                      rows={4}
                    />
                    <ButtonBuilder
                      buttons={dmButtonsNonFollower}
                      onChange={setDmButtonsNonFollower}
                      label={t("instagramAutomationsPage.linkButtonsProfileLabel")}
                    />
                  </div>
                )}
              </div>

              {/* Bottom save — visible on mobile where top bar might be off screen */}
              <div className="flex gap-2 pt-4 pb-8 md:hidden">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">{t("instagramAutomationsPage.cancel")}</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editing ? t("instagramAutomationsPage.update") : t("instagramAutomationsPage.createAutomation"))}
                </Button>
              </div>
            </div>
          </div>
            </div>
          </div>
        , document.body)}

        {/* Visual picker — Instagram posts */}
        <FacebookPostPicker
          open={fbPickerOpen}
          onOpenChange={setFbPickerOpen}
          pageId={fbPageId || fbPages[0]?.page_id || ""}
          organizationId={organizationId}
          selectedPostIds={fbPostIds}
          onSelect={setFbPostIds}
        />

        <InstagramPostPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selectedMediaIds={mediaIds}
          onSelect={handleMediaPicked}
        />
      </div>

      {/* ── Delete automation confirmation ──────────────────────────── */}
      <AlertDialog open={!!deletingAutomation} onOpenChange={open => { if (!open) setDeletingAutomation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("instagramAutomationsPage.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("instagramAutomationsPage.deleteConfirmPre")} <strong>"{deletingAutomation?.name}"</strong>. {t("instagramAutomationsPage.deleteConfirmPost")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("instagramAutomationsPage.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("instagramAutomationsPage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
