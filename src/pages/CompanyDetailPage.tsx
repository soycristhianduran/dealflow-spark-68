import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Globe, MapPin, Users, DollarSign } from "lucide-react";
import { useEffect, useState } from "react";

type Company = {
  id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  created_at: string;
};

type LinkedContact = {
  id: string;
  full_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  status: string;
};

type LinkedDeal = {
  id: string;
  title: string;
  value: number;
  currency: string;
  status: string;
  pipeline_stages: { name: string; color: string } | null;
};

export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [deals, setDeals] = useState<LinkedDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const [companyRes, contactsRes, dealsRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", id).single(),
        supabase.from("contacts").select("id, full_name, primary_email, primary_phone, status").eq("company_id", id).order("full_name"),
        supabase.from("deals").select("id, title, value, currency, status, pipeline_stages(name, color)").eq("company_id", id).order("created_at", { ascending: false }),
      ]);
      setCompany(companyRes.data as any);
      setContacts((contactsRes.data as any) || []);
      setDeals((dealsRes.data as any) || []);
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <AppHeader title="Cargando..." />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Cargando empresa...</p>
        </main>
      </AppLayout>
    );
  }

  if (!company) {
    return (
      <AppLayout>
        <AppHeader title="Empresa no encontrada" />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">La empresa no existe.</p>
        </main>
      </AppLayout>
    );
  }

  const totalDealValue = deals.reduce((sum, d) => sum + Number(d.value), 0);

  return (
    <AppLayout>
      <AppHeader
        title={company.name}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/companies")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Company info */}
          <Card className="border-none shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{company.name}</h2>
                  {company.industry && <p className="text-sm text-muted-foreground">{company.industry}</p>}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {company.company_size && (
                  <div><span className="text-muted-foreground">Tamaño: </span><span className="text-foreground">{company.company_size}</span></div>
                )}
                {(company.city || company.country) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground">{[company.city, company.country].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {company.website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {company.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{contacts.length}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{deals.length}</p>
                  <p className="text-xs text-muted-foreground">Deals</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">${totalDealValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Valor total en deals</p>
              </div>
            </CardContent>
          </Card>

          {/* Leads & Deals */}
          <div className="lg:col-span-2 space-y-6">
            {/* Leads */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4" /> Leads vinculados ({contacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacts.map(contact => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{contact.full_name}</p>
                      <p className="text-xs text-muted-foreground">{contact.primary_email || contact.primary_phone || "Sin datos de contacto"}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs capitalize">{contact.status}</Badge>
                  </div>
                ))}
                {contacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sin leads vinculados</p>}
              </CardContent>
            </Card>

            {/* Deals */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Deals vinculados ({deals.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deals.map(deal => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/deals/${deal.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{deal.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {deal.pipeline_stages && (
                          <span className="text-xs" style={{ color: deal.pipeline_stages.color }}>{deal.pipeline_stages.name}</span>
                        )}
                        <span className="text-xs text-muted-foreground">${Number(deal.value).toLocaleString()} {deal.currency}</span>
                      </div>
                    </div>
                    <Badge variant={deal.status === "won" ? "default" : deal.status === "lost" ? "destructive" : "secondary"} className="text-xs">
                      {deal.status === "won" ? "Ganado" : deal.status === "lost" ? "Perdido" : "Abierto"}
                    </Badge>
                  </div>
                ))}
                {deals.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sin deals vinculados</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
