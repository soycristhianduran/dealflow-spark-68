import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Building2, Globe, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Company = {
  id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
};

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("companies").select("id, name, industry, company_size, city, country, website").order("name");
      setCompanies((data as any) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <AppHeader title="Empresas" subtitle={`${companies.length} empresas`} actions={
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva empresa</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar empresas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Industria</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tamaño</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ubicación</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Website</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/companies/${company.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{company.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{company.industry || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{company.company_size || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {company.city || company.country ? (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[company.city, company.country].filter(Boolean).join(', ')}</span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {company.website ? (
                      <span className="flex items-center gap-1 text-primary"><Globe className="h-3 w-3" />{company.website.replace(/^https?:\/\//, '')}</span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin empresas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </AppLayout>
  );
}
