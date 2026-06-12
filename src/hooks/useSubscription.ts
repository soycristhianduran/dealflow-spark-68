/**
 * useSubscription — exposes the current org's billing state to the UI.
 *
 * Wraps the `get_active_subscription(org_id)` Postgres RPC (see migration
 * 20260520010000) plus derived UI flags:
 *
 *   - status        — Stripe-mirrored status (or 'trialing_internal' for
 *                     the 14-day pre-payment trial)
 *   - isActive      — user can use the app (trialing or active)
 *   - trialEndsAt   — when the internal trial expires (null after payment)
 *   - daysLeftInTrial — convenience for banner messaging
 *   - needsUpgrade  — show the "Upgrade" CTA prominently
 *   - locked        — user CANNOT use the app (trial expired without payment)
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";

export type SubscriptionStatus =
  | "trialing_internal"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

export interface SubscriptionInfo {
  subscriptionId: string;
  planId: "starter" | "pro" | "business";
  planName: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;

  // Plan limits (NULL = unlimited)
  maxUsers: number | null;
  maxContacts: number | null;
  maxActiveDeals: number | null;
  monthlyAiAnalyses: number | null;
  monthlyAiObjections: number | null;
  monthlyAutomatedMessages: number | null;
  monthlyEmailSends: number | null;
  monthlyAiAgentConversations: number | null;
  monthlyAiAssistant: number | null;

  // Feature flags
  featureMetaAds: boolean;
  featureAiAgent: boolean;
  featureEmailCampaigns: boolean;
  featureApiAccess: boolean;
}

interface UseSubscriptionReturn {
  loading: boolean;
  subscription: SubscriptionInfo | null;
  daysLeftInTrial: number | null;   // null if not in trial
  needsUpgrade: boolean;            // trial ends soon OR past_due
  locked: boolean;                  // status is canceled/incomplete_expired/unpaid → no access
  refetch: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!organizationId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "get_active_subscription",
      { p_org_id: organizationId },
    );
    if (error) {
      console.warn("get_active_subscription failed:", error);
      setSubscription(null);
      setLoading(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setSubscription({
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      planName: row.plan_name,
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: !!row.cancel_at_period_end,
      isActive: !!row.is_active,
      maxUsers: row.max_users,
      maxContacts: row.max_contacts,
      maxActiveDeals: row.max_active_deals,
      monthlyAiAnalyses: row.monthly_ai_analyses,
      monthlyAiObjections: row.monthly_ai_objections,
      monthlyAutomatedMessages: row.monthly_automated_messages,
      monthlyEmailSends: row.monthly_email_sends,
      monthlyAiAgentConversations: row.monthly_ai_agent_conversations ?? null,
      monthlyAiAssistant: row.monthly_ai_assistant ?? null,
      featureMetaAds: !!row.feature_meta_ads,
      featureAiAgent: !!row.feature_ai_agent,
      featureEmailCampaigns: !!row.feature_email_campaigns,
      featureApiAccess: !!row.feature_api_access,
    });
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Revalidate the subscription so an expired trial locks the user out WITHOUT a
  // manual page reload. Klosify is a SPA, so without this a tab opened during the
  // trial keeps its (stale) "active" state indefinitely and the lockout never
  // fires. Refetch on window focus and on a 5-minute interval.
  useEffect(() => {
    const onFocus = () => fetchSubscription();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const interval = window.setInterval(fetchSubscription, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(interval);
    };
  }, [fetchSubscription]);

  // Derived UI state
  let daysLeftInTrial: number | null = null;
  if (
    subscription &&
    subscription.status === "trialing_internal" &&
    subscription.trialEndsAt
  ) {
    const msLeft = new Date(subscription.trialEndsAt).getTime() - Date.now();
    daysLeftInTrial = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  const needsUpgrade = !!subscription && (
    (subscription.status === "trialing_internal" && (daysLeftInTrial ?? 99) <= 3) ||
    subscription.status === "past_due"
  );

  const locked = !!subscription && (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired" ||
    subscription.status === "unpaid" ||
    // Trial expired and no Stripe sub yet
    (subscription.status === "trialing_internal" &&
      subscription.trialEndsAt !== null &&
      new Date(subscription.trialEndsAt) < new Date())
  );

  return {
    loading,
    subscription,
    daysLeftInTrial,
    needsUpgrade,
    locked,
    refetch: fetchSubscription,
  };
}
