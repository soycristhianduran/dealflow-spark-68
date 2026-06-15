/**
 * ShopifyIntegrationCard — connect a Shopify store (custom-app token method) and
 * see sales attributed to email/WhatsApp campaigns. Self-contained.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShoppingBag, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

const money = (n: number, c?: string) =>
  `${c ? c + " " : "$"}${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ShopifyIntegrationCard() {
  const { organizationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [stats, setStats] = useState<{ orders: number; revenue: number; currency: string | null }>({ orders: 0, revenue: 0, currency: null });
  const [showGuide, setShowGuide] = useState(false);

  async function refresh() {
    if (!organizationId) { setLoading(false); return; }
    const { data: cfg } = await supabase.from("shopify_configs")
      .select("*").eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
    setConfig(cfg ?? null);
    if (cfg) {
      const { data: attr } = await supabase.from("campaign_attributions")
        .select("amount, currency").eq("organization_id", organizationId);
      const revenue = (attr ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0);
      setStats({ orders: attr?.length ?? 0, revenue, currency: attr?.[0]?.currency ?? null });
    }
    setLoading(false);
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
      setToken(""); setDomain("");
      await refresh();
    } finally { setConnecting(false); }
  }

  async function disconnect() {
    if (!config) return;
    await supabase.from("shopify_configs").update({ is_active: false }).eq("id", config.id);
    setConfig(null);
    toast.success("Tienda desconectada");
  }

  if (loading) return <Card><CardContent className="p-6 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card className="rounded-2xl border border-border/60 shadow-sm dark:bg-slate-900/50 dark:border-white/[0.08]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-md shadow-emerald-500/25">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h3 className="font-semibold">Shopify · Atribución de ventas</h3>
            <p className="text-xs text-muted-foreground">Mide las ventas que generan tus campañas de email y WhatsApp.</p>
          </div>
          {config && <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Conectado</span>}
        </div>

        {config ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/60 p-3">
                <div className="text-[11px] text-muted-foreground">Tienda</div>
                <div className="text-sm font-semibold truncate">{config.shop_name || config.shop_domain}</div>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <div className="text-[11px] text-muted-foreground">Pedidos atribuidos</div>
                <div className="text-lg font-bold tabular-nums">{stats.orders}</div>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <div className="text-[11px] text-muted-foreground">Ventas atribuidas</div>
                <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(stats.revenue, stats.currency || undefined)}</div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Última sincronización: {config.last_synced_at ? new Date(config.last_synced_at).toLocaleString("es") : "—"} · se actualiza automáticamente cada 30 min.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Actualizar</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={disconnect}>Desconectar</Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Dominio de la tienda</Label>
                <Input placeholder="mitienda.myshopify.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Admin API access token</Label>
                <Input placeholder="shpat_..." value={token} onChange={(e) => setToken(e.target.value)} type="password" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={connect} disabled={connecting}>
                {connecting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Conectando...</> : "Conectar tienda"}
              </Button>
              <button className="text-xs text-primary inline-flex items-center gap-1" onClick={() => setShowGuide(!showGuide)}>
                ¿Cómo obtengo el token? <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            {showGuide && (
              <div className="rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">En tu Shopify (una sola vez):</p>
                <p>1. Configuración → <b>Apps y canales de venta</b> → <b>Desarrollar apps</b> → <b>Crear una app</b>.</p>
                <p>2. En <b>Configuración de Admin API</b>, activa los permisos: <b>read_orders</b> y <b>read_customers</b>.</p>
                <p>3. <b>Instalar la app</b> → copia el <b>Admin API access token</b> (<code>shpat_…</code>).</p>
                <p>4. Pega aquí ese token y el dominio <code>.myshopify.com</code>.</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
