import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DealRow = {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  stage_id: string | null;
  contact_id: string | null;
  expected_close_date: string | null;
  contacts: { full_name: string } | null;
  pipeline_stages: { name: string; color: string } | null;
};

export default function DealsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "won" | "lost">("all");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchDeals = async () => {
    const { data, error } = await supabase
      .from("deals")
      .select("id, title, value, currency, status, stage_id, contact_id, expected_close_date, contacts(full_name), pipeline_stages(name, color)")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Error cargando deals"); return; }
    setDeals((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDeals(); }, []);

  const filtered = deals.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === "all" || d.status === statusFilter)
  );

  const counts = {
    all: deals.length,
    open: deals.filter(d => d.status === "open").length,
    won: deals.filter(d => d.status === "won").length,
    lost: deals.filter(d => d.status === "lost").length,
  };

  return (
    <AppLayout>
      <AppHeader title="Deals" subtitle={`${deals.length} oportunidades`} actions={
        <Button size="sm" className="gap-1.5" onClick={() => navigate("/pipeline")}><Plus className="h-4 w-4" /> Nuevo deal</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar deals..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-4 w-4" /> Filtrar</Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Deal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contacto</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Etapa</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((deal) => (
                  <tr key={deal.id} onClick={() => navigate(`/deals/${deal.id}`)} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{deal.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deal.contacts?.full_name || '-'}</td>
                    <td className="px-4 py-3">
                      {deal.pipeline_stages ? (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: deal.pipeline_stages.color, color: deal.pipeline_stages.color }}>
                          {deal.pipeline_stages.name}
                        </Badge>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                        {deal.status === 'won' ? 'Ganado' : deal.status === 'lost' ? 'Perdido' : 'Abierto'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">${Number(deal.value).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{deal.expected_close_date || '-'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin deals</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
