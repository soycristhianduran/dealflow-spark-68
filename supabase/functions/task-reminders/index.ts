/**
 * task-reminders — cron (cada pocos minutos). Busca tareas cuyo recordatorio ya
 * venció (remind_at <= ahora), que sigan pendientes y no se hayan avisado, y
 * envía una notificación push al responsable de la tarea. Marca reminded_at para
 * no repetir.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const TYPE_LABEL: Record<string, string> = {
  call: "Llamada", follow_up: "Seguimiento", email: "Email", meeting: "Reunión", other: "Tarea",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const baseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("tasks")
      .select("id, title, task_type, owner_id, contact_id, organization_id")
      .lte("remind_at", nowIso)
      .is("reminded_at", null)
      .eq("status", "pending")
      .not("owner_id", "is", null)
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    if (!due?.length) return json({ ok: true, sent: 0 });

    let sent = 0;
    const results: any[] = [];
    for (const task of due) {
      const label = TYPE_LABEL[task.task_type] || "Tarea";
      // Notificación push al responsable.
      try {
        await fetch(`${baseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_ids: [task.owner_id],
            title: `⏰ ${label}`,
            body: task.title,
            url: task.contact_id ? `/leads/${task.contact_id}` : "/tasks",
            tag: `task-${task.id}`,
          }),
        });
      } catch (e) {
        results.push({ task: task.id, error: String(e) });
      }
      // Marcar como avisada aunque el push falle, para no spamear.
      await supabase.from("tasks").update({ reminded_at: nowIso }).eq("id", task.id);
      sent++;
    }
    return json({ ok: true, sent, results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
