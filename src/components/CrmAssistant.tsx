/**
 * CrmAssistant — floating natural-language assistant over the CRM.
 *
 * Sends the conversation to the crm-assistant edge function (which tool-calls,
 * org-scoped, read-only) and renders the reply. When the assistant resolves a
 * "filter leads" intent it returns an action; we offer a button that opens the
 * Leads list with that filter applied (via URL params ContactsPage reads).
 */
import { useState, useRef, useEffect } from "react";
import { BotMessageSquare, X, Send, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface ChatMsg { role: "user" | "assistant"; content: string; action?: any }

export function CrmAssistant() {
  const { organizationId } = useOrganizationContext();
  const { path } = useWorkspace();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: t("crmAssistant.welcomeMessage") },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, loading]);

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
      <button
        onClick={() => setOpen(true)}
        className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-orange-500 to-amber-400 text-white shadow-lg shadow-primary/30 ring-1 ring-white/25 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-primary/50"
        title={t("crmAssistant.assistantTitle")}
      >
        {/* soft pulsing halo */}
        <span className="absolute inset-0 -z-10 rounded-2xl bg-primary/40 blur-md animate-pulse" />
        <BotMessageSquare className="h-6 w-6 drop-shadow transition-transform duration-300 group-hover:scale-110" />
        {/* little online dot */}
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-card" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[34rem] w-[26rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-orange-500 to-amber-400 ring-1 ring-white/25 shadow-sm">
            <BotMessageSquare className="h-4 w-4 text-white" />
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
