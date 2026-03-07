import { supabase } from "@/integrations/supabase/client";

/**
 * Mark a deal as won or lost, update contact status, and log activity.
 */
export async function closeDeal(
  dealId: string,
  newStatus: "won" | "lost",
  contactId: string | null,
  userId?: string
) {
  // Get deal's pipeline and value to validate
  const { data: deal } = await supabase
    .from("deals")
    .select("pipeline_id, value")
    .eq("id", dealId)
    .single();

  // Require value > 0 to mark as won
  if (newStatus === "won" && (!deal || Number(deal.value) <= 0)) {
    throw new Error("El deal debe tener un presupuesto asignado (valor > 0) para marcarse como ganado");
  }

  const updatePayload: Record<string, unknown> = { status: newStatus };

  if (deal?.pipeline_id) {
    // Find the appropriate closing stage by name convention
    const stageName = newStatus === "won" ? "Cerrado ganado" : "Cerrado perdido";
    const { data: closingStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", deal.pipeline_id)
      .eq("name", stageName)
      .single();

    if (closingStage) {
      updatePayload.stage_id = closingStage.id;
    }
  }

  const { error } = await supabase
    .from("deals")
    .update(updatePayload)
    .eq("id", dealId);

  if (error) throw error;

  // If won and has contact, update contact to "customer"
  if (newStatus === "won" && contactId) {
    await supabase
      .from("contacts")
      .update({ status: "customer" })
      .eq("id", contactId);
  }

  // Log activity
  await supabase.from("activities").insert({
    related_entity_id: dealId,
    related_entity_type: "deal",
    event_type: newStatus === "won" ? "deal_won" : "deal_lost",
    summary: newStatus === "won" ? "Deal marcado como ganado" : "Deal marcado como perdido",
    created_by: userId || null,
  });
}

/**
 * Reopen a closed deal
 */
export async function reopenDeal(dealId: string, userId?: string) {
  const { error } = await supabase
    .from("deals")
    .update({ status: "open" })
    .eq("id", dealId);

  if (error) throw error;

  await supabase.from("activities").insert({
    related_entity_id: dealId,
    related_entity_type: "deal",
    event_type: "deal_reopened",
    summary: "Deal reabierto",
    created_by: userId || null,
  });
}
