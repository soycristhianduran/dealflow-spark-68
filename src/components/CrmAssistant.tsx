/**
 * CrmAssistant — floating natural-language assistant over the CRM.
 *
 * Sends the conversation to the crm-assistant edge function (which tool-calls,
 * org-scoped, read-only) and renders the reply. When the assistant resolves a
 * "filter leads" intent it returns an action; we offer a button that opens the
 * Leads list with that filter applied (via URL params ContactsPage reads).
 */
import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, ArrowRight, LifeBuoy, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { pushSupported, isPushEnabled, enablePush } from "@/lib/push";

interface ChatMsg { role: "user" | "assistant"; content: string; action?: any }

// Short notification beep via the Web Audio API (no asset needed).
function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.36);
  } catch { /* ignore */ }
}

export function CrmAssistant() {
  const { organizationId } = useOrganizationContext();
  const { user } = useAuth();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  useEffect(() => { isPushEnabled().then(setPushOn); }, []);
  const activatePush = async () => {
    const r = await enablePush(organizationId);
    if (r.ok) { setPushOn(true); toast.success("Notificaciones activadas 🔔"); }
    else if (r.reason === "denied") toast.error("Permiso bloqueado. Actívalo en Ajustes → Notificaciones.");
    else if (r.reason === "unsupported") toast.error("Tu dispositivo no soporta notificaciones aquí. En iPhone, instala la app en la pantalla de inicio.");
    else toast.error("No se pudieron activar.");
  };
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: t("crmAssistant.welcomeMessage") },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, loading]);

  // In-app support alerts: when support replies to one of this org's tickets,
  // beep + badge + toast (RLS only delivers this org's ticket messages).
  useEffect(() => {
    if (!organizationId || !user) return;
    const ch = supabase.channel("support-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload: any) => {
        const m = payload.new;
        if (m?.is_staff && m?.author_id !== user.id) {
          beep();
          setSupportUnread((n) => n + 1);
          toast("Soporte respondió tu ticket", {
            description: "Toca la mascota → Soporte para ver la respuesta.",
            action: { label: "Ver", onClick: () => { setSupportUnread(0); navigate(path("/support")); } },
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, user, navigate, path]);

  const openContact = (id: string) => { navigate(path(`/contacts/${id}`)); setOpen(false); };
  const openAutomation = (id: string) => { navigate(`${path("/automations")}?open=${id}`); setOpen(false); };

  const applyAction = (action: any) => {
    if (action?.type !== "navigate_leads") return;
    const f = action.filters || {};
    const p = new URLSearchParams();
    p.set("ai", "1");
    if (f.temperature) p.set("temperature", f.temperature);
    if (f.status) p.set("status", f.status);
    if (f.source) p.set("source", f.source);
    if (f.tag) p.set("tag", f.tag);
    if (f.search) p.set("search", f.search);
    if (f.created_since_days) p.set("since_days", String(f.created_since_days));
    navigate(`${path("/contacts")}?${p.toString()}`);
    setOpen(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-assistant", {
        body: {
          organization_id: organizationId,
          messages: next.filter(m => m.role === "user" || m.role === "assistant").map(m => ({ role: m.role, content: m.content })),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || t("crmAssistant.done"), action: data.action }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: t("crmAssistant.errorMessage") }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Option menu */}
        {menuOpen && (
          <div className="w-64 overflow-hidden rounded-2xl border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={() => { setMenuOpen(false); setOpen(true); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted"
            >
              <img src="/mascot-head.png" alt="Klofy" className="h-10 w-10 shrink-0 rounded-full object-contain" />
              <div>
                <p className="text-sm font-semibold leading-tight">Hablar con Klofy</p>
                <p className="text-[11px] text-muted-foreground">Pregúntame sobre tus leads</p>
              </div>
            </button>
            {pushSupported() && !pushOn && (
              <>
                <div className="h-px bg-border" />
                <button
                  onClick={() => { setMenuOpen(false); activatePush(); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                    <Bell className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">Activar notificaciones</p>
                    <p className="text-[11px] text-muted-foreground">Avísame cuando lleguen mensajes</p>
                  </div>
                </button>
              </>
            )}
            <div className="h-px bg-border" />
            <button
              onClick={() => { setMenuOpen(false); setSupportUnread(0); navigate(path("/support")); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted"
            >
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <LifeBuoy className="h-5 w-5 text-primary" />
                {supportUnread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card" />}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Soporte {supportUnread > 0 && <span className="text-red-500">({supportUnread})</span>}</p>
                <p className="text-[11px] text-muted-foreground">Habla con nuestro equipo</p>
              </div>
            </button>
          </div>
        )}

        {/* Mascot launcher button */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="group relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary via-orange-500 to-amber-400 shadow-lg shadow-primary/30 ring-1 ring-white/25 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-primary/50"
          title="Klofy"
        >
          <span className="absolute inset-0 -z-10 rounded-full bg-primary/40 blur-md animate-pulse" />
          <img src="/mascot-head.png" alt="Klofy" className="h-12 w-12 object-contain drop-shadow transition-transform duration-300 group-hover:scale-110" />
          {supportUnread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-card">{supportUnread}</span>
          ) : (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-card" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[34rem] w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-orange-500 to-amber-400 ring-1 ring-white/25 shadow-sm overflow-hidden">
            <img src="/mascot-head.png" alt="Klofy" className="h-6 w-6 object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{t("crmAssistant.assistantTitle")}</p>
            <p className="text-[11px] text-muted-foreground">{t("crmAssistant.askAboutLeads")}</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.action?.type === "navigate_leads" && (
                <button onClick={() => applyAction(m.action)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-background/80 px-2.5 py-1 text-xs font-medium text-primary hover:bg-background">
                  {t("crmAssistant.viewLeads")} <ArrowRight className="h-3 w-3" />
                </button>
              )}
              {m.action?.type === "open_automation" && (
                <button onClick={() => openAutomation(m.action.id)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-background/80 px-2.5 py-1 text-xs font-medium text-primary hover:bg-background">
                  {t("crmAssistant.viewFlow")} <ArrowRight className="h-3 w-3" />
                </button>
              )}
              {m.action?.type === "open_contact" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(m.action.matches || []).slice(0, 5).map((c: any) => (
                    <button key={c.id} onClick={() => openContact(c.id)} className="inline-flex items-center gap-1 rounded-lg bg-background/80 px-2.5 py-1 text-xs font-medium text-primary hover:bg-background">
                      {t("crmAssistant.open", { name: c.name })} <ArrowRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start"><div className="rounded-2xl bg-muted px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") send(); }}
            placeholder={t("crmAssistant.inputPlaceholder")}
            disabled={loading}
            className="flex-1"
          />
          <Button size="icon" onClick={send} disabled={loading || !input.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
