/**
 * ShopifyIntegrationCard — grid card (matches the other integrations) to connect
 * a Shopify store and see sales attributed to email/WhatsApp campaigns.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Circle, ArrowRight, Zap, RefreshCw, AlertTriangle, ShoppingCart } from "lucide-react";
import { ShopifyIcon } from "@/components/icons/PlatformBrandIcons";
import { AUTOMATION_TEMPLATES, templateToAutomation } from "@/lib/automationTemplates";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const money = (n: number, c?: string | null) =>
  `${c ? c + " " : "$"}${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ShopifyIntegrationCard() {
  const { organizationId } = useOrganizationContext();
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<{ orders: number; revenue: number; currency: string | null }>({ orders: 0, revenue: 0, currency: null });
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [cartAutomationId, setCartAutomationId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [hasVerifiedDomain, setHasVerifiedDomain] = useState(true); // assume ok until checked
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function refresh() {
    if (!organizationId) return;
    const { data: cfg } = await supabase.from("shopify_configs")
      .select("*").eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    setConfig(cfg ?? null);
    if (cfg) {
      const { data: attr } = await supabase.from("campaign_attributions").select("amount, currency").eq("organization_id", organizationId);
      setStats({ orders: attr?.length ?? 0, revenue: (attr ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0), currency: attr?.[0]?.currency ?? null });
      // Is the abandoned-cart automation already set up?
      const { data: auto } = await supabase.from("automations")
        .select("id").eq("organization_id", organizationId).eq("trigger_type", "abandoned_cart").maybeSingle();
      setCartAutomationId(auto?.id ?? null);
      // Verified custom sending domain? (emails still send via shared sender if not)
      const { count } = await supabase.from("email_domains")
        .select("domain", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("status", "verified");
      setHasVerifiedDomain((count ?? 0) > 0);
    }
  }

  // #1 — one-click: create + activate the ready-made abandoned-cart flow.
  async function activateAbandonedCart() {
    if (!organizationId) return;
    setActivating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("shopifyIntegrationCard.loginAgain")); return; }
      const tpl = AUTOMATION_TEMPLATES.find(t => t.key === "abandoned_cart")!;
      const a = templateToAutomation(tpl);
      const { data, error } = await supabase.from("automations").insert({
        name: a.name, description: a.description, is_active: true,
        trigger_type: a.trigger_type, trigger_config: a.trigger_config,
        triggers: a.triggers, trigger_types: a.triggers.map(t => t.type),
        steps: a.steps, user_id: user.id, organization_id: organizationId,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select("id").single();
      if (error) { toast.error(t("shopifyIntegrationCard.activateError", { message: error.message })); return; }
      setCartAutomationId(data.id);
      toast.success(t("shopifyIntegrationCard.cartRecoveryActivated"));
    } finally { setActivating(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [organizationId]);

  async function connect() {
    if (!domain.trim() || !token.trim()) { toast.error(t("shopifyIntegrationCard.enterDomainAndToken")); return; }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-connect", {
        body: { shop_domain: domain.trim(), access_token: token.trim(), organization_id: organizationId },
      });
      if (error || data?.error) { toast.error(data?.error || t("shopifyIntegrationCard.connectError")); return; }
      toast.success(t("shopifyIntegrationCard.connectedToast", { shopName: data.shop_name, count: data.orders_imported }));
      setToken(""); setDomain(""); await refresh(); setOpen(false);
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    if (!config) return;
    await supabase.from("shopify_configs").update({ is_active: false }).eq("id", config.id);
    setConfig(null); setOpen(false); toast.success(t("shopifyIntegrationCard.storeDisconnected"));
  }

  const connected = !!config;

  return (
    <>
      <Card className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setOpen(true)}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/30">
              <ShopifyIcon size={30} />
            </div>
            <Badge variant={connected ? "default" : "secondary"} className={`text-xs gap-1 ${connected ? "bg-green-600 hover:bg-green-600" : ""}`}>
              {connected ? <><CheckCircle2 className="h-3 w-3" /> {t("shopifyIntegrationCard.connected")}</> : <><Circle className="h-3 w-3" /> {t("shopifyIntegrationCard.available")}</>}
            </Badge>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Shopify</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("shopifyIntegrationCard.cardDescription")}</p>
          </div>

          {connected ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(stats.revenue, stats.currency)}</span> · {t("shopifyIntegrationCard.attributedOrders", { count: stats.orders })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" /> {t("shopifyIntegrationCard.salesAttributionByCampaign")}</div>
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
            {connected ? t("shopifyIntegrationCard.manage") : t("shopifyIntegrationCard.connect")} <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShopifyIcon size={22} /> {t("shopifyIntegrationCard.dialogTitle")}
            </DialogTitle>
          </DialogHeader>

          {connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">{t("shopifyIntegrationCard.store")}</div>
                  <div className="text-sm font-semibold truncate">{config.shop_name || config.shop_domain}</div>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">{t("shopifyIntegrationCard.orders")}</div>
                  <div className="text-lg font-bold tabular-nums">{stats.orders}</div>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">{t("shopifyIntegrationCard.attributedSales")}</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(stats.revenue, stats.currency)}</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("shopifyIntegrationCard.lastSync")}: {config.last_synced_at ? new Date(config.last_synced_at).toLocaleString("es") : "—"} · {t("shopifyIntegrationCard.autoSyncNote")}
              </p>

              {/* ── Abandoned cart recovery (one-click + scope health) ── */}
              <div className="rounded-xl border border-orange-200/60 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/10 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShoppingCart className="h-4 w-4 text-orange-500" /> {t("shopifyIntegrationCard.abandonedCartRecovery")}
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-start gap-1.5">
                    {config.scope_checkouts === true
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-px shrink-0" /><span>{t("shopifyIntegrationCard.cartDetectionActive")} <b>{t("shopifyIntegrationCard.active")}</b></span></>
                      : config.scope_checkouts === false
                      ? <><AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-px shrink-0" /><span>{t("shopifyIntegrationCard.missingPermissionPrefix")} <b>read_checkouts</b> {t("shopifyIntegrationCard.missingCheckoutsSuffix")}</span></>
                      : <><Circle className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" /><span>{t("shopifyIntegrationCard.reconnectToVerify")}</span></>}
                  </div>
                  <div className="flex items-start gap-1.5">
                    {config.scope_products === true
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-px shrink-0" /><span>{t("shopifyIntegrationCard.productImages")} <b>{t("shopifyIntegrationCard.availableLower")}</b></span></>
                      : config.scope_products === false
                      ? <><AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-px shrink-0" /><span>{t("shopifyIntegrationCard.missingShort")} <b>read_products</b> {t("shopifyIntegrationCard.missingProductsSuffix")}</span></>
                      : <><Circle className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" /><span>{t("shopifyIntegrationCard.productImagesUnverified")}</span></>}
                  </div>
                </div>
                {(config.scope_checkouts === false || config.scope_products === false) && (
                  <p className="text-[10px] text-amber-600">{t("shopifyIntegrationCard.addPermissionsNote")}</p>
                )}
                {cartAutomationId ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/automations?open=${cartAutomationId}`)}>
                    {t("shopifyIntegrationCard.alreadyActiveEditFlow")}
                  </Button>
                ) : (
                  <Button size="sm" className="w-full bg-orange-500 hover:bg-orange-600" disabled={activating || config.scope_checkouts === false} onClick={activateAbandonedCart}>
                    {activating ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t("shopifyIntegrationCard.activating")}</> : t("shopifyIntegrationCard.activateCartRecovery")}
                  </Button>
                )}
                {!hasVerifiedDomain && (
                  <p className="text-[10px] text-muted-foreground">
                    {t("shopifyIntegrationCard.sharedSenderNote")}{" "}
                    <button className="underline hover:text-foreground" onClick={() => navigate("/settings?tab=email")}>{t("shopifyIntegrationCard.verifyYourDomain")}</button> {t("shopifyIntegrationCard.optionalSuffix")}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />{t("shopifyIntegrationCard.refresh")}</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect}>{t("shopifyIntegrationCard.disconnect")}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("shopifyIntegrationCard.storeDomain")}</Label>
                <Input placeholder="mitienda.myshopify.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Admin API access token</Label>
                <Input placeholder="shpat_..." value={token} onChange={(e) => setToken(e.target.value)} type="password" />
              </div>
              <Button onClick={connect} disabled={connecting} className="w-full">
                {connecting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t("shopifyIntegrationCard.connecting")}</> : t("shopifyIntegrationCard.connectStore")}
              </Button>
              <div className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t("shopifyIntegrationCard.setupHeading")}</p>
                <p>{t("shopifyIntegrationCard.step1Prefix")} <b>{t("shopifyIntegrationCard.step1AppsChannels")}</b> → <b>{t("shopifyIntegrationCard.step1DevelopApps")}</b> → <b>{t("shopifyIntegrationCard.step1CreateApp")}</b>.</p>
                <p>{t("shopifyIntegrationCard.step2Prefix")} <b>read_orders</b>, <b>read_customers</b>, <b>read_checkouts</b> {t("shopifyIntegrationCard.and")} <b>read_products</b>.</p>
                <p className="text-[10px] text-muted-foreground/80 pl-3">· <b>read_checkouts</b> {t("shopifyIntegrationCard.checkoutsHelp")} · <b>read_products</b> {t("shopifyIntegrationCard.productsHelp")}</p>
                <p>3. <b>{t("shopifyIntegrationCard.install")}</b> → {t("shopifyIntegrationCard.step3Copy")} <b>Admin API access token</b> (<code>shpat_…</code>).</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
