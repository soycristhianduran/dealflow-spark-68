import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";

/**
 * Plays a short chime whenever a NEW incoming message arrives on any channel
 * (WhatsApp / Instagram / Messenger), org-wide, from anywhere in the app.
 * Mounted once in AppLayout. Throttled so a burst of messages produces a
 * single sound instead of a machine-gun of beeps.
 */
// Shared context, unlocked on the first user gesture — iOS suspends
// AudioContexts created outside a gesture, which made the chime silent there.
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) sharedCtx = new Ctx();
  return sharedCtx;
}
if (typeof window !== "undefined") {
  const unlock = () => { try { getCtx()?.resume(); } catch { /* ignore */ } };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true, passive: true });
}

function chime() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") { ctx.resume().catch(() => {}); }
    // Two-tone "pop" — friendlier than a flat beep
    const play = (freq: number, at: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.05);
    };
    play(660, 0, 0.18);
    play(990, 0.12, 0.22);
  } catch { /* audio blocked — ignore */ }
}

export function NewMessageSound() {
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const lastPlayedRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    const filter = organizationId
      ? `organization_id=eq.${organizationId}`
      : `user_id=eq.${user.id}`;

    const maybeChime = (incoming: boolean) => {
      if (!incoming) return;
      const now = Date.now();
      if (now - lastPlayedRef.current < 2500) return; // throttle bursts
      lastPlayedRef.current = now;
      chime();
    };

    const channel = supabase
      .channel(`msg-sound-${organizationId || user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter },
        (p: any) => maybeChime(p.new?.direction === "incoming"))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "instagram_messages", filter },
        (p: any) => maybeChime(p.new?.direction === "incoming"))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messenger_messages", filter },
        (p: any) => maybeChime(p.new?.direction === "incoming"))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, organizationId]);

  return null;
}
