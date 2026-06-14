import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const CRON_SECRET = "klosify-cron-2026";

Deno.serve(async (req) => {
  // ── Security: require cron secret header ─────────────────────────────────
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader !== CRON_SECRET) {
    console.warn("meta-auto-sync: unauthorized request — missing or invalid x-cron-secret");
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  console.log("meta-auto-sync: job started");

  // ── 1. Fetch all users with a valid (non-expired, not needs_reconnect) FB token ──
  const now = new Date().toISOString();
  const { data: tokens, error: tokensErr } = await supabase
    .from("facebook_tokens")
    .select("user_id, organization_id, access_token, token_expires_at, needs_reconnect")
    .or(`token_expires_at.is.null,token_expires_at.gt.${now}`)
    .neq("needs_reconnect", true);

  if (tokensErr) {
    console.error("meta-auto-sync: failed to fetch tokens:", tokensErr.message);
    return new Response(JSON.stringify({ error: "Failed to fetch tokens", detail: tokensErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validTokens = tokens ?? [];
  console.log(`meta-auto-sync: found ${validTokens.length} users with valid tokens`);

  const results: {
    user_id: string;
    ad_accounts: string[];
    campaigns_synced: number;
    error?: string;
  }[] = [];

  // ── 2. Process each user ──────────────────────────────────────────────────
  for (const tokenRow of validTokens) {
    const { user_id, organization_id, access_token } = tokenRow;

    try {
      // ── 2a. Find distinct ad_account_ids for this user from meta_campaigns ──
      const { data: existingCampaigns, error: acctErr } = await supabase
        .from("meta_campaigns")
        .select("ad_account_id")
        .eq("user_id", user_id)
        .not("ad_account_id", "is", null);

      if (acctErr) {
        console.error(`meta-auto-sync [${user_id}]: error fetching ad accounts:`, acctErr.message);
        results.push({ user_id, ad_accounts: [], campaigns_synced: 0, error: acctErr.message });
        continue;
      }

      // Deduplicate ad_account_ids
      let adAccountIds: string[] = [
        ...new Set((existingCampaigns ?? []).map((r: any) => r.ad_account_id as string).filter(Boolean)),
      ];

      // BOOTSTRAP: if we have no ad accounts yet (first sync), discover them from
      // the Graph API. Without this the sync never starts (it only knew accounts
      // already in meta_campaigns, which is empty on a fresh connection).
      if (adAccountIds.length === 0) {
        try {
          const accRes = await fetch(`${GRAPH_API}/me/adaccounts?fields=id&limit=100&access_token=${access_token}`);
          const accData = await accRes.json();
          if (accData.error) {
            console.warn(`meta-auto-sync [${user_id}]: adaccounts error:`, JSON.stringify(accData.error));
          }
          adAccountIds = (accData.data || []).map((a: any) => a.id).filter(Boolean);
          console.log(`meta-auto-sync [${user_id}]: discovered ${adAccountIds.length} ad account(s) from token`);
        } catch (e) {
          console.warn(`meta-auto-sync [${user_id}]: failed to discover ad accounts:`, e);
        }
      }

      if (adAccountIds.length === 0) {
        console.log(`meta-auto-sync [${user_id}]: no ad accounts found, skipping`);
        results.push({ user_id, ad_accounts: [], campaigns_synced: 0 });
        continue;
      }

      console.log(`meta-auto-sync [${user_id}]: syncing ${adAccountIds.length} ad account(s):`, adAccountIds);

      let totalCampaignsSynced = 0;
      const accountErrors: string[] = [];

      // ── 2b. Sync campaigns for each ad account ──────────────────────────
      for (const ad_account_id of adAccountIds) {
        try {
          const url =
            `${GRAPH_API}/${ad_account_id}/campaigns` +
            `?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time` +
            `,insights.date_preset(maximum){spend,impressions,clicks,actions}` +
            `&limit=100&access_token=${access_token}`;

          const res  = await fetch(url);
          const data = await res.json();

          if (!res.ok || data.error) {
            const errMsg = data.error?.message || data.error?.error_user_msg || JSON.stringify(data);
            console.error(`meta-auto-sync [${user_id}] [${ad_account_id}]: Meta API error:`, errMsg);
            accountErrors.push(`${ad_account_id}: ${errMsg}`);

            // If the token is invalid / expired according to Meta, mark it for reconnect
            const fbCode = data.error?.code;
            if (fbCode === 190 || fbCode === 102 || fbCode === 104) {
              await supabase
                .from("facebook_tokens")
                .update({ needs_reconnect: true })
                .eq("user_id", user_id);
              console.warn(`meta-auto-sync [${user_id}]: token marked for reconnect (Meta error code ${fbCode})`);
            }
            continue;
          }

          const rawCampaigns = data.data || [];

          // Parse campaigns into DB rows
          const campaigns = rawCampaigns.map((c: any) => {
            const insights    = c.insights?.data?.[0] || {};
            const leadActions = (insights.actions || []).find((a: any) => a.action_type === "lead");
            const leads       = leadActions ? Number(leadActions.value) : 0;
            const spend       = insights.spend ? Number(insights.spend) : 0;
            return {
              user_id,
              organization_id,
              campaign_id:     c.id,
              campaign_name:   c.name,
              status:          c.status,
              objective:       c.objective,
              daily_budget:    c.daily_budget    ? Number(c.daily_budget)    / 100 : null,
              lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
              spend,
              impressions:     insights.impressions ? Number(insights.impressions) : 0,
              clicks:          insights.clicks      ? Number(insights.clicks)      : 0,
              leads,
              cpl:             leads > 0 ? spend / leads : null,
              start_time:      c.start_time || null,
              stop_time:       c.stop_time  || null,
              ad_account_id,
            };
          });

          // Replace stale campaigns for this account (same pattern as facebook-api)
          await supabase
            .from("meta_campaigns")
            .delete()
            .eq("user_id", user_id)
            .eq("organization_id", organization_id)
            .eq("ad_account_id", ad_account_id);

          for (const campaign of campaigns) {
            await supabase
              .from("meta_campaigns")
              .upsert(campaign, { onConflict: "user_id,campaign_id" });
          }

          console.log(
            `meta-auto-sync [${user_id}] [${ad_account_id}]: synced ${campaigns.length} campaign(s)`
          );
          totalCampaignsSynced += campaigns.length;

          // ── 2c. Sync ADS (individual) with insights for ad-level ROAS ──────
          try {
            const adsUrl =
              `${GRAPH_API}/${ad_account_id}/ads` +
              `?fields=id,name,adset_id,campaign_id,status` +
              `,insights.date_preset(maximum){spend,impressions,clicks,actions}` +
              `&limit=300&access_token=${access_token}`;
            const adsRes = await fetch(adsUrl);
            const adsData = await adsRes.json();
            if (adsRes.ok && !adsData.error) {
              const ads = (adsData.data || []).map((a: any) => {
                const ins = a.insights?.data?.[0] || {};
                const leadAct = (ins.actions || []).find((x: any) => x.action_type === "lead");
                const leads = leadAct ? Number(leadAct.value) : 0;
                const spend = ins.spend ? Number(ins.spend) : 0;
                return {
                  user_id, organization_id,
                  ad_id: a.id, ad_name: a.name, adset_id: a.adset_id, campaign_id: a.campaign_id,
                  status: a.status, spend,
                  impressions: ins.impressions ? Number(ins.impressions) : 0,
                  clicks: ins.clicks ? Number(ins.clicks) : 0,
                  leads, cpl: leads > 0 ? spend / leads : null,
                  ad_account_id,
                };
              });
              await supabase.from("meta_ads").delete()
                .eq("user_id", user_id).eq("organization_id", organization_id).eq("ad_account_id", ad_account_id);
              for (const ad of ads) {
                await supabase.from("meta_ads").upsert(ad, { onConflict: "user_id,ad_id" });
              }
              console.log(`meta-auto-sync [${user_id}] [${ad_account_id}]: synced ${ads.length} ad(s)`);
            } else if (adsData.error) {
              console.warn(`meta-auto-sync [${user_id}] [${ad_account_id}]: ads error:`, adsData.error?.message);
            }
          } catch (adErr) {
            console.warn(`meta-auto-sync [${user_id}] [${ad_account_id}]: ads sync failed:`, adErr);
          }

        } catch (accountErr: any) {
          const msg = accountErr?.message || String(accountErr);
          console.error(`meta-auto-sync [${user_id}] [${ad_account_id}]: unexpected error:`, msg);
          accountErrors.push(`${ad_account_id}: ${msg}`);
        }
      }

      results.push({
        user_id,
        ad_accounts: adAccountIds,
        campaigns_synced: totalCampaignsSynced,
        ...(accountErrors.length > 0 ? { error: accountErrors.join("; ") } : {}),
      });

    } catch (userErr: any) {
      const msg = userErr?.message || String(userErr);
      console.error(`meta-auto-sync [${user_id}]: unexpected error processing user:`, msg);
      results.push({ user_id, ad_accounts: [], campaigns_synced: 0, error: msg });
    }
  }

  // ── 3. Build summary ──────────────────────────────────────────────────────
  const usersWithErrors  = results.filter(r => r.error).length;
  const usersSucceeded   = results.filter(r => !r.error && r.campaigns_synced >= 0).length;
  const totalCampaigns   = results.reduce((sum, r) => sum + r.campaigns_synced, 0);

  const summary = {
    run_at:            new Date().toISOString(),
    users_processed:   validTokens.length,
    users_succeeded:   usersSucceeded,
    users_with_errors: usersWithErrors,
    total_campaigns_synced: totalCampaigns,
    details: results,
  };

  console.log("meta-auto-sync: job complete —", JSON.stringify({
    users_processed:        summary.users_processed,
    users_succeeded:        summary.users_succeeded,
    users_with_errors:      summary.users_with_errors,
    total_campaigns_synced: summary.total_campaigns_synced,
  }));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
