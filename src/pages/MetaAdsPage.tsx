import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { DollarSign, Eye, MousePointerClick, Users, TrendingUp, BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { useNavigate } from "react-router-dom";

interface Campaign {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string | null;
  objective: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  cpl: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_time: string | null;
  stop_time: string | null;
  ad_account_id: string | null;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-500",
  PAUSED: "bg-yellow-500",
  DELETED: "bg-red-500",
  ARCHIVED: "bg-muted-foreground",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  DELETED: "Eliminada",
  ARCHIVED: "Archivada",
};

const pieColors = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 340 75% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
  "hsl(var(--chart-5, 160 60% 45%))",
  "hsl(var(--accent))",
];

export default function MetaAdsPage() {
  const { user } = useAuth();
  const fb = useFacebookIntegration();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["meta-campaigns", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("meta_campaigns")
        .select("*")
        .eq("user_id", user.id)
        .order("spend", { ascending: false });
      if (error) throw error;
      return (data || []) as Campaign[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    return campaigns.filter(c => c.status === statusFilter);
  }, [campaigns, statusFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => ({
        spend: acc.spend + (c.spend || 0),
        impressions: acc.impressions + (c.impressions || 0),
        clicks: acc.clicks + (c.clicks || 0),
        leads: acc.leads + (c.leads || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    );
  }, [filtered]);

  const avgCpl = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  // Top campaigns by spend for bar chart
  const barData = useMemo(() => {
    return filtered
      .filter(c => (c.spend || 0) > 0)
      .slice(0, 10)
      .map(c => ({
        name: c.campaign_name.length > 20 ? c.campaign_name.substring(0, 20) + "…" : c.campaign_name,
        spend: c.spend || 0,
        leads: c.leads || 0,
        clicks: c.clicks || 0,
      }));
  }, [filtered]);

  // Objective distribution for pie chart
  const pieData = useMemo(() => {
    const byObjective: Record<string, number> = {};
    filtered.forEach(c => {
      const obj = c.objective || "Otro";
      byObjective[obj] = (byObjective[obj] || 0) + (c.spend || 0);
    });
    return Object.entries(byObjective)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const chartConfig = {
    spend: { label: "Gasto", color: "hsl(var(--primary))" },
    leads: { label: "Leads", color: "hsl(var(--chart-2, 142 70% 45%))" },
    clicks: { label: "Clicks", color: "hsl(var(--chart-3, 220 70% 50%))" },
  };

  if (!fb.isConnected && !fb.loading) {
    return (
      <AppLayout>
        <AppHeader title="Meta Ads" subtitle="Dashboard de campañas publicitarias" />
        <main className="flex-1 overflow-y-auto p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center space-y-4">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">Conecta Meta Ads</h3>
              <p className="text-sm text-muted-foreground">
                Para ver el dashboard de campañas, primero conecta tu cuenta de Meta desde Integraciones.
              </p>
              <Button onClick={() => navigate("/integrations")}>Ir a Integraciones</Button>
            </CardContent>
          </Card>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title="Meta Ads" subtitle="Dashboard de campañas publicitarias" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Filters */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACTIVE">Activas</SelectItem>
                <SelectItem value="PAUSED">Pausadas</SelectItem>
                <SelectItem value="DELETED">Eliminadas</SelectItem>
                <SelectItem value="ARCHIVED">Archivadas</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs">
              {filtered.length} campañas
            </Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Actualizar
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <DollarSign className="h-3.5 w-3.5" /> Gasto total
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">${totals.spend.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Eye className="h-3.5 w-3.5" /> Impresiones
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{totals.impressions.toLocaleString("es")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <MousePointerClick className="h-3.5 w-3.5" /> Clicks
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{totals.clicks.toLocaleString("es")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <Users className="h-3.5 w-3.5" /> Leads
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{totals.leads.toLocaleString("es")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <DollarSign className="h-3.5 w-3.5" /> CPL promedio
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">${avgCpl.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                <TrendingUp className="h-3.5 w-3.5" /> CTR
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{ctr.toFixed(2)}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Bar chart - Top campaigns by spend */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top campañas por gasto</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                  Sin datos de campañas
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="spend" fill="var(--color-spend)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Pie chart - Objective distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Gasto por objetivo</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                  Sin datos
                </div>
              ) : (
                <div>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="45%"
                        outerRadius={90}
                        innerRadius={50}
                        dataKey="value"
                        nameKey="name"
                        paddingAngle={2}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-wrap gap-2 justify-center -mt-4">
                    {pieData.slice(0, 5).map((item, i) => (
                      <div key={item.name} className="flex items-center gap-1.5 text-xs">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
                        <span className="text-muted-foreground">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Campaign table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Detalle de campañas</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No hay campañas importadas. Ve a Integraciones para importar campañas de Meta Ads.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Campaña</th>
                      <th className="pb-2 pr-4 font-medium">Estado</th>
                      <th className="pb-2 pr-4 font-medium">Objetivo</th>
                      <th className="pb-2 pr-4 font-medium text-right">Gasto</th>
                      <th className="pb-2 pr-4 font-medium text-right">Impresiones</th>
                      <th className="pb-2 pr-4 font-medium text-right">Clicks</th>
                      <th className="pb-2 pr-4 font-medium text-right">Leads</th>
                      <th className="pb-2 font-medium text-right">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(campaign => (
                      <tr key={campaign.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-foreground max-w-[200px] truncate">
                          {campaign.campaign_name}
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${statusColors[campaign.status || ""] || "bg-muted-foreground"}`} />
                            {statusLabels[campaign.status || ""] || campaign.status || "—"}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground text-xs">{campaign.objective || "—"}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">${(campaign.spend || 0).toLocaleString("es", { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{(campaign.impressions || 0).toLocaleString("es")}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{(campaign.clicks || 0).toLocaleString("es")}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{(campaign.leads || 0).toLocaleString("es")}</td>
                        <td className="py-2.5 text-right font-mono">
                          {campaign.cpl ? `$${campaign.cpl.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}