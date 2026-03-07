import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { mockDeals } from "@/data/mock-data";
import { Plus, Search, Filter } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function DealsPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const filtered = mockDeals.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <AppHeader title="Deals" subtitle={`${mockDeals.length} oportunidades`} actions={
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nuevo deal</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar deals..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-4 w-4" /> Filtrar</Button>
        </div>

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
                  <td className="px-4 py-3 text-muted-foreground">{deal.contact?.full_name || '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs" style={{ borderColor: deal.stage?.color, color: deal.stage?.color }}>
                      {deal.stage?.name}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                      {deal.status === 'won' ? 'Ganado' : deal.status === 'lost' ? 'Perdido' : 'Abierto'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">${deal.value.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{deal.expected_close_date || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppLayout>
  );
}
