import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { mockLeads } from "@/data/mock-data";
import { Plus, Search, Filter } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  qualified: { label: "Calificado", variant: "outline" },
  converted: { label: "Convertido", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const filtered = mockLeads.filter(l =>
    l.full_name.toLowerCase().includes(search.toLowerCase()) ||
    l.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <AppHeader title="Leads" subtitle={`${mockLeads.length} leads en total`} actions={
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo lead
        </Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" /> Filtrar
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Origen</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const status = statusMap[lead.status];
                return (
                  <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{lead.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.email || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.phone || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.source || '-'}</td>
                    <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${lead.score || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{lead.score || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </AppLayout>
  );
}
