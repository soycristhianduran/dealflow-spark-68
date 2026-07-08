-- Cross-org leak fix: these views ran as owner (no security_invoker), which
-- bypasses RLS on their base tables, and were SELECT-able by anon/authenticated
-- via PostgREST — exposing every organization's AI costs and campaign ROI to
-- any logged-in (or anonymous) client. With security_invoker=on they respect
-- the caller's RLS (campaign_attributions is org-scoped; ai_usage_log denies
-- clients), and anon loses access entirely.
alter view public.ai_agent_cost_report set (security_invoker = on);
alter view public.campaign_sales_roi set (security_invoker = on);
revoke all on public.ai_agent_cost_report from anon;
revoke all on public.campaign_sales_roi from anon;
