import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ArrowLeft, Building2, Globe, MapPin, Users, DollarSign, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

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
  const { path } = useWorkspace();
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [deals, setDeals] = useState<LinkedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", industry: "", company_size: "", city: "", country: "", website: "" });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [companyRes, contactsRes, dealsRes] = await Promise.all([
      supabase.from("companies").select("*").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("id, full_name, primary_email, primary_phone, status").eq("company_id", id).order("full_name"),
      supabase.from("deals").select("id, title, value, currency, status, pipeline_stages(name, color)").eq("company_id", id).order("created_at", { ascending: false }),
    ]);
    const c = companyRes.data as any;
    setCompany(c);
    if (c) {
      setEditForm({
        name: c.name || "",
        industry: c.industry || "",
        company_size: c.company_size || "",
        city: c.city || "",
        country: c.country || "",
        website: c.website || "",
      });
    }
    setContacts((contactsRes.data as any) || []);
    setDeals((dealsRes.data as any) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!id || !editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("companies").update({
      name: editForm.name.trim(),
      industry: editForm.industry.trim() || null,
      company_size: editForm.company_size.trim() || null,
      city: editForm.city.trim() || null,
      country: editForm.country.trim() || null,
      website: editForm.website.trim() || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success("Empresa actualizada");
    setEditOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) { toast.error("Error al eliminar empresa"); return; }
    toast.success("Empresa eliminada");
    navigate(path("/companies"));
  };

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar empresa?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer. Los leads y deals vinculados no se eliminarán, pero perderán la asociación.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" onClick={() => navigate(path("/companies"))} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="grid gap-6 lg:grid-cols-3">
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

          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4" /> Leads vinculados ({contacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contacts.map(contact => (
                  <div key={contact.id} className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
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

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Deals vinculados ({deals.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deals.map(deal => (
                  <div key={deal.id} className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(path(`/deals/${deal.id}`))}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{deal.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {deal.pipeline_stages && <span className="text-xs" style={{ color: deal.pipeline_stages.color }}>{deal.pipeline_stages.name}</span>}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Industria</Label>
                <Input value={editForm.industry} onChange={e => setEditForm(f => ({ ...f, industry: e.target.value }))} />
              </div>
              <div>
                <Label>Tamaño</Label>
                <Input value={editForm.company_size} onChange={e => setEditForm(f => ({ ...f, company_size: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label>País</Label>
                <Input value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Website</Label>
              <Input value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
