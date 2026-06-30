// ══════════════════════════════════════════════════════════════════════
//  PlatformSupportPage — support inbox for the platform admin (/admin/soporte).
//  See every org's tickets, open the thread, reply, change status.
// ══════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, ArrowLeft, Send, Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Ticket {
  id: string; organization_id: string; org_name: string; requester_email: string;
  subject: string; category: string; status: string; priority: string;
  message_count: number; created_at: string; last_message_at: string;
}
interface Msg { id: string; body: string; is_staff: boolean; created_at: string; }

const STATUS_LABEL: Record<string, string> = { open: "Abierto", in_progress: "En proceso", resolved: "Resuelto", closed: "Cerrado" };
const STATUS_CLASS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700", closed: "bg-slate-100 text-slate-600",
};

export default function PlatformSupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [active, setActive] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("platform_list_support_tickets");
    if (error) { setDenied(true); setLoading(false); return; }
    // Empty can mean "no tickets" OR "not a platform admin" (the RPC is gated and
    // returns [] for non-admins). Disambiguate so we don't show an empty inbox to
    // someone who simply isn't logged in as the platform admin.
    if (!data || data.length === 0) {
      const { data: pa } = await supabase.from("platform_admins").select("user_id").maybeSingle();
      if (!pa) { setDenied(true); setLoading(false); return; }
    }
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: new tickets/messages appear without reloading.
  useEffect(() => {
    const ch = supabase.channel("support-admin-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload: any) => {
        load();
        if (active && payload.new?.ticket_id === active.id) {
          supabase.from("support_messages").select("*").eq("ticket_id", active.id)
            .order("created_at", { ascending: true }).then(({ data }) => setMsgs((data ?? []) as Msg[]));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active, load]);

  const openThread = async (t: Ticket) => {
    setActive(t); setMsgs([]);
    const { data } = await supabase.from("support_messages").select("*")
      .eq("ticket_id", t.id).order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
  };

  const sendReply = async () => {
    if (!reply.trim() || !active || !user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages")
      .insert({ ticket_id: active.id, author_id: user.id, body: reply.trim() });
    setSending(false);
    if (error) return;
    supabase.functions.invoke("support-notify", { body: { ticket_id: active.id } }).catch(() => {});
    setReply("");
    const { data } = await supabase.from("support_messages").select("*")
      .eq("ticket_id", active.id).order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
  };

  const setStatus = async (status: string) => {
    if (!active) return;
    await supabase.from("support_tickets").update({ status }).eq("id", active.id);
    setActive({ ...active, status });
    load();
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (denied) return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center px-6">
      <Shield className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Acceso restringido</h1>
      <p className="text-sm text-muted-foreground">Solo administradores de plataforma.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <LifeBuoy className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Soporte — Bandeja</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{tickets.length} ticket{tickets.length === 1 ? "" : "s"} de todas las organizaciones</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-6 md:grid-cols-[340px_1fr]">
        {/* List */}
        <div className="space-y-2">
          {tickets.length === 0 && <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">Sin tickets aún.</div>}
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openThread(t)}
              className={`flex w-full flex-col items-start gap-1 rounded-lg border bg-white p-3 text-left transition hover:bg-slate-50 ${active?.id === t.id ? "ring-2 ring-primary" : ""}`}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="font-medium text-slate-900 truncate">{t.subject}</span>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLASS[t.status] ?? ""}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
              </div>
              <div className="text-xs text-muted-foreground">{t.org_name} · {t.requester_email}</div>
              <div className="text-[11px] text-muted-foreground">{new Date(t.last_message_at).toLocaleString("es")}</div>
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className="rounded-lg border bg-white">
          {!active ? (
            <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-muted-foreground">Selecciona un ticket</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b p-4">
                <button onClick={() => setActive(null)} className="md:hidden text-muted-foreground"><ArrowLeft className="h-4 w-4" /></button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{active.subject}</div>
                  <div className="text-xs text-muted-foreground">{active.org_name} · {active.requester_email}</div>
                </div>
                <Select value={active.status} onValueChange={setStatus}>
                  <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-[55vh] flex-1 space-y-3 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={m.is_staff ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.is_staff ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <div className="mb-0.5 text-[10px] font-semibold opacity-70">{m.is_staff ? "Soporte (tú)" : active.requester_email}</div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <div className="mt-1 text-[10px] opacity-60">{new Date(m.created_at).toLocaleString("es")}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t p-3">
                <Input value={reply} onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendReply())}
                  placeholder="Responder al cliente…" />
                <Button size="icon" onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
