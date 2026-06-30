// ══════════════════════════════════════════════════════════════════════
//  SupportPage — in-app support tickets for the client (Klofy → Soporte).
//  List your org's tickets, open a new one, view the thread and reply.
// ══════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LifeBuoy, Plus, Send, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";

interface Ticket {
  id: string; subject: string; category: string; status: string;
  priority: string; created_at: string; last_message_at: string;
}
interface Msg { id: string; body: string; is_staff: boolean; created_at: string; }

const STATUS_LABEL: Record<string, string> = {
  open: "Abierto", in_progress: "En proceso", resolved: "Resuelto", closed: "Cerrado",
};
const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700", closed: "bg-slate-100 text-slate-600",
};
const CATEGORIES = [
  { v: "general", l: "General" }, { v: "bug", l: "Problema / error" },
  { v: "billing", l: "Facturación" }, { v: "feature", l: "Sugerencia" },
];

export default function SupportPage() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "new" | "thread">("list");
  const [active, setActive] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // new ticket form
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [body, setBody] = useState("");

  const loadTickets = useCallback(async () => {
    if (!organizationId) { setTickets([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*")
      .eq("organization_id", organizationId).order("last_message_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openThread = async (t: Ticket) => {
    setActive(t); setView("thread"); setMsgs([]);
    const { data } = await supabase.from("support_messages").select("*")
      .eq("ticket_id", t.id).order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
  };

  const createTicket = async () => {
    if (!subject.trim() || !body.trim() || !organizationId || !user) return;
    setSending(true);
    const { data: ticket, error } = await supabase.from("support_tickets").insert({
      organization_id: organizationId, created_by: user.id, subject: subject.trim(), category,
    }).select().single();
    if (error || !ticket) { setSending(false); toast.error(error?.message || "No se pudo crear"); return; }
    await supabase.from("support_messages").insert({ ticket_id: ticket.id, author_id: user.id, body: body.trim() });
    supabase.functions.invoke("support-notify", { body: { ticket_id: ticket.id } }).catch(() => {});
    setSending(false); setSubject(""); setBody(""); setCategory("general");
    toast.success("Ticket creado. Te responderemos pronto.");
    await loadTickets();
    openThread(ticket as Ticket);
  };

  const sendReply = async () => {
    if (!reply.trim() || !active || !user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages")
      .insert({ ticket_id: active.id, author_id: user.id, body: reply.trim() });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    supabase.functions.invoke("support-notify", { body: { ticket_id: active.id } }).catch(() => {});
    setReply("");
    const { data } = await supabase.from("support_messages").select("*")
      .eq("ticket_id", active.id).order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
  };

  return (
    <AppLayout>
      <AppHeader title="Soporte" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-3xl">
          {/* ── List ── */}
          {view === "list" && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LifeBuoy className="h-4 w-4 text-primary" /> Tus tickets de soporte
                </div>
                <Button size="sm" onClick={() => setView("new")}><Plus className="h-4 w-4 mr-1.5" /> Nuevo ticket</Button>
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : tickets.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                  Aún no tienes tickets. Crea uno y nuestro equipo te ayudará.
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <button key={t.id} onClick={() => openThread(t)}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition hover:bg-muted">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{t.subject}</div>
                        <div className="text-xs text-muted-foreground">{new Date(t.last_message_at).toLocaleString("es")}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CLASS[t.status] ?? ""}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── New ticket ── */}
          {view === "new" && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Volver
              </button>
              <h2 className="text-lg font-semibold">Nuevo ticket</h2>
              <div>
                <label className="text-sm font-medium">Asunto</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Resumen breve" />
              </div>
              <div>
                <label className="text-sm font-medium">Categoría</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Describe tu solicitud</label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Cuéntanos qué necesitas…" />
              </div>
              <Button onClick={createTicket} disabled={sending || !subject.trim() || !body.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar ticket"}
              </Button>
            </div>
          )}

          {/* ── Thread ── */}
          {view === "thread" && active && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center gap-3 border-b p-4">
                <button onClick={() => { setView("list"); loadTickets(); }} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{active.subject}</div>
                  <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CLASS[active.status] ?? ""}`}>
                    {STATUS_LABEL[active.status] ?? active.status}
                  </span>
                </div>
              </div>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={m.is_staff ? "flex justify-start" : "flex justify-end"}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.is_staff ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                      {m.is_staff && <div className="mb-0.5 text-[10px] font-semibold opacity-70">Soporte Klosify</div>}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <div className="mt-1 text-[10px] opacity-60">{new Date(m.created_at).toLocaleString("es")}</div>
                    </div>
                  </div>
                ))}
              </div>
              {active.status !== "closed" && (
                <div className="flex items-center gap-2 border-t p-3">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendReply())}
                    placeholder="Escribe una respuesta…" />
                  <Button size="icon" onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
