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
  // Update deal status
  const { error } = await supabase
    .from("deals")
    .update({ status: newStatus })
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
