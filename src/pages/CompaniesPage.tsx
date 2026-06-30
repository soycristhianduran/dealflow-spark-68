import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Plus, Search, Building2, Globe, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Company = {
  id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
};

const emptyForm = { name: "", industry: "", company_size: "", city: "", country: "", website: "" };

export default function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { path } = useWorkspace();
  const { isVendor, myUserId } = usePermissions();
  const { organizationId } = useOrganizationContext();
  const { t } = useTranslation();

  const fetchCompanies = useCallback(async () => {
    if (!organizationId) { setCompanies([]); setLoading(false); return; }
    let query = supabase.from("companies").select("id, name, industry, company_size, city, country, website")
      .eq("organization_id", organizationId).order("name");
    if (isVendor && myUserId) query = query.eq("owner_id", myUserId);
    const { data } = await query;
    setCompanies(data || []);
    setLoading(false);
  }, [isVendor, myUserId, organizationId]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error(t("companiesPage.nameRequired")); return; }
    setSaving(true);
    const { error } = await supabase.from("companies").insert({
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      company_size: form.company_size.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      website: form.website.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(t("companiesPage.createError")); return; }
    toast.success(t("companiesPage.createdMsg"));
    setForm(emptyForm);
    setDialogOpen(false);
    fetchCompanies();
  };

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <AppHeader title={t("companiesPage.title")} subtitle={t("companiesPage.subtitle", { count: companies.length })} actions={
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> {t("companiesPage.newCompany")}</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("companiesPage.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("companiesPage.colCompany")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("companiesPage.colIndustry")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("companiesPage.colSize")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("companiesPage.colLocation")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("companiesPage.colWebsite")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(path(`/companies/${company.id}`))}>
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
                <tr><td colSpan={5} className="px-0 py-0">
                  <EmptyState
                    variant="companies"
                    title={search ? t("companiesPage.noResultsTitle") : t("companiesPage.emptyTitle")}
                    description={
                      search
                        ? t("companiesPage.noResultsDescription")
                        : t("companiesPage.emptyDescription")
                    }
                    action={
                      !search && (
                        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
                          <Plus className="h-4 w-4" /> {t("companiesPage.createFirst")}
                        </Button>
                      )
                    }
                  />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("companiesPage.newCompany")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("companiesPage.labelName")}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("companiesPage.namePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("companiesPage.colIndustry")}</Label>
                <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder={t("companiesPage.industryPlaceholder")} />
              </div>
              <div>
                <Label>{t("companiesPage.colSize")}</Label>
                <Input value={form.company_size} onChange={e => setForm(f => ({ ...f, company_size: e.target.value }))} placeholder={t("companiesPage.sizePlaceholder")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("companiesPage.labelCity")}</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder={t("companiesPage.cityPlaceholder")} />
              </div>
              <div>
                <Label>{t("companiesPage.labelCountry")}</Label>
                <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder={t("companiesPage.countryPlaceholder")} />
              </div>
            </div>
            <div>
              <Label>{t("companiesPage.colWebsite")}</Label>
              <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("companiesPage.cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>{saving ? t("companiesPage.creating") : t("companiesPage.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
