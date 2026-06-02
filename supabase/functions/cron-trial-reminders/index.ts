// Daily trial reminder cron
// -------------------------
// Invoked once per day by pg_cron. Two responsibilities:
//
//   1. trial_ending  — for subscriptions whose trial expires in 3 days,
//                       send the "Tu prueba acaba en 3 días" email
//   2. trial_ended   — for subscriptions whose trial has just expired
//                       (status='trialing_internal' AND trial_ends_at < NOW()),
//                       transition them to status='canceled' AND send the
//                       "Tu prueba terminó" email
//
// Idempotency: every email send uses a `dedupe_key` keyed on
// (template, user_id, trial_ends_at), so even if the cron fires twice on
// the same day, the user only gets one email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReminderResult {
  ending_emails_dispatched: number;
  ended_emails_dispatched: number;
  trials_locked_out: number;
  errors: string[];
}

async function sendEmail(
  supabaseUrl: string,
  serviceKey: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Email dispatch failed (${res.status}):`, errText.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("Email dispatch threw:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APP_URL = (Deno.env.get("APP_URL") || "https://app.klosify.com").replace(/\/$/, "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const result: ReminderResult = {
      ending_emails_dispatched: 0,
      ended_emails_dispatched: 0,
      trials_locked_out: 0,
      errors: [],
    };

    // ════════════════════════════════════════════════════════════════════════
    // 1. trial_ending — trials that expire in approximately 3 days
    // ════════════════════════════════════════════════════════════════════════
    // We pick a window of 24h centered around the "exactly 3 days" mark so
    // that even with clock drift / cron timing, every user gets exactly one
    // reminder. The dedupe_key prevents double-sends if the window is hit twice.
    {
      const { data: trials, error } = await supabase
        .from("subscriptions")
        .select(`
          id, organization_id, trial_ends_at,
          organizations:organization_id(name, slug, organization_members(user_id, role))
        `)
        .eq("status", "trialing_internal")
        .gte("trial_ends_at", new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString())
        .lt("trial_ends_at",  new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        result.errors.push(`fetch trial_ending: ${error.message}`);
      } else {
        for (const sub of trials || []) {
          const org = (sub as any).organizations;
          const owner = org?.organization_members?.find((m: any) => m.role === "owner");
          if (!owner) continue;

          // Look up owner's email + first name from auth
          const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
          const email = userData?.user?.email;
          if (!email) continue;
          const firstName =
            (userData?.user?.user_metadata?.first_name as string | undefined) ||
            (userData?.user?.user_metadata?.full_name as string | undefined)?.split(" ")[0];

          const dedupeKey = `trial_ending:${owner.user_id}:${sub.trial_ends_at}`;
          const upgradeUrl = `${APP_URL}/w/${org.slug}/billing`;

          const ok = await sendEmail(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            to: email,
            template: "trial_ending",
            data: { first_name: firstName, days_left: 3, upgrade_url: upgradeUrl },
            dedupe_key: dedupeKey,
            user_id: owner.user_id,
            organization_id: sub.organization_id,
          });
          if (ok) result.ending_emails_dispatched++;
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. trial_ended — trials whose expiry has passed AND haven't been
    //    transitioned yet (still status='trialing_internal')
    // ════════════════════════════════════════════════════════════════════════
    {
      const { data: trials, error } = await supabase
        .from("subscriptions")
        .select(`
          id, organization_id, trial_ends_at,
          organizations:organization_id(name, slug, organization_members(user_id, role))
        `)
        .eq("status", "trialing_internal")
        .lt("trial_ends_at", new Date().toISOString());

      if (error) {
        result.errors.push(`fetch trial_ended: ${error.message}`);
      } else {
        for (const sub of trials || []) {
          const org = (sub as any).organizations;
          const owner = org?.organization_members?.find((m: any) => m.role === "owner");

          // Transition to canceled status — this triggers the LockoutScreen
          // in the frontend on the user's next page load
          const { error: updateErr } = await supabase
            .from("subscriptions")
            .update({
              status: "canceled",
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);
          if (updateErr) {
            result.errors.push(`update sub ${sub.id}: ${updateErr.message}`);
            continue;
          }
          result.trials_locked_out++;

          if (!owner) continue;
          const { data: userData } = await supabase.auth.admin.getUserById(owner.user_id);
          const email = userData?.user?.email;
          if (!email) continue;
          const firstName =
            (userData?.user?.user_metadata?.first_name as string | undefined) ||
            (userData?.user?.user_metadata?.full_name as string | undefined)?.split(" ")[0];

          const dedupeKey = `trial_ended:${owner.user_id}:${sub.trial_ends_at}`;
          const upgradeUrl = `${APP_URL}/w/${org.slug}/billing`;

          const ok = await sendEmail(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            to: email,
            template: "trial_ended",
            data: { first_name: firstName, upgrade_url: upgradeUrl },
            dedupe_key: dedupeKey,
            user_id: owner.user_id,
            organization_id: sub.organization_id,
          });
          if (ok) result.ended_emails_dispatched++;
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cron-trial-reminders error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
