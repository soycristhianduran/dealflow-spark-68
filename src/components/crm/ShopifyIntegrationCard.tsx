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
import { Loader2, CheckCircle2, Circle, ArrowRight, Zap, RefreshCw } from "lucide-react";
import { ShopifyIcon } from "@/components/icons/PlatformBrandIcons";

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

  async function refresh() {
    if (!organizationId) return;
    const { data: cfg } = await supabase.from("shopify_configs")
      .select("*").eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    setConfig(cfg ?? null);
    if (cfg) {
      const { data: attr } = await supabase.from("campaign_attributions").select("amount, currency").eq("organization_id", organizationId);
      setStats({ orders: attr?.length ?? 0, revenue: (attr ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0), currency: attr?.[0]?.currency ?? null });
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [organizationId]);

  async function connect() {
    if (!domain.trim() || !token.trim()) { toast.error("Ingresa el dominio y el token"); return; }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-connect", {
        body: { shop_domain: domain.trim(), access_token: token.trim(), organization_id: organizationId },
      });
      if (error || data?.error) { toast.error(data?.error || "No se pudo conectar. Revisa el token y el dominio."); return; }
      toast.success(`Conectado a ${data.shop_name} · ${data.orders_imported} pedidos importados`);
      setToken(""); setDomain(""); await refresh(); setOpen(false);
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    if (!config) return;
    await supabase.from("shopify_configs").update({ is_active: false }).eq("id", config.id);
    setConfig(null); setOpen(false); toast.success("Tienda desconectada");
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
              {connected ? <><CheckCircle2 className="h-3 w-3" /> Conectado</> : <><Circle className="h-3 w-3" /> Disponible</>}
            </Badge>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Shopify</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Mide las ventas que generan tus campañas de email y WhatsApp.</p>
          </div>

          {connected ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money(stats.revenue, stats.currency)}</span> · {stats.orders} pedidos atribuidos
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5 text-primary" /> Atribución de ventas por campaña</div>
          )}

          <Button variant="outline" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
            {connected ? "Gestionar" : "Conectar"} <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShopifyIcon size={22} /> Shopify · Atribución de ventas
            </DialogTitle>
          </DialogHeader>

          {connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">Tienda</div>
                  <div className="text-sm font-semibold truncate">{config.shop_name || config.shop_domain}</div>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">Pedidos</div>
                  <div className="text-lg font-bold tabular-nums">{stats.orders}</div>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <div className="text-[11px] text-muted-foreground">Ventas atribuidas</div>
                  <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(stats.revenue, stats.currency)}</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Última sincronización: {config.last_synced_at ? new Date(config.last_synced_at).toLocaleString("es") : "—"} · se actualiza cada 30 min automáticamente.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Actualizar</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect}>Desconectar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Dominio de la tienda</Label>
                <Input placeholder="mitienda.myshopify.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Admin API access token</Label>
                <Input placeholder="shpat_..." value={token} onChange={(e) => setToken(e.target.value)} type="password" />
              </div>
              <Button onClick={connect} disabled={connecting} className="w-full">
                {connecting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Conectando...</> : "Conectar tienda"}
              </Button>
              <div className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">En tu Shopify (una sola vez):</p>
                <p>1. Configuración → <b>Apps y canales de venta</b> → <b>Desarrollar apps</b> → <b>Crear una app</b>.</p>
                <p>2. Permisos Admin API: <b>read_orders</b>, <b>read_customers</b>, <b>read_checkouts</b> y <b>read_products</b>.</p>
                <p className="text-[10px] text-muted-foreground/80 pl-3">· <b>read_checkouts</b> activa la recuperación de carritos abandonados · <b>read_products</b> muestra las imágenes de los productos en los emails.</p>
                <p>3. <b>Instalar</b> → copia el <b>Admin API access token</b> (<code>shpat_…</code>).</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
