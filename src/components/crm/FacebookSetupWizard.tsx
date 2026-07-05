import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Facebook, FileText, MessageCircle, BarChart3, ArrowRight, ArrowLeft, RefreshCw, Settings2, Plus, Search, Download } from "lucide-react";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { MessengerIcon } from "@/components/icons/BrandIcons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface FacebookSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "pages" | "forms" | "mapping" | "messenger" | "campaigns" | "done";

interface PageItem { id: string; name: string; access_token: string; category?: string; selected: boolean; connected_org_name?: string | null }
interface FormItem { id: string; name: string; status: string; selected: boolean; pipeline_id?: string; page_id?: string; page_name?: string; questions?: { key: string; label: string; type: string }[] }
interface PipelineOption { id: string; name: string }
interface AdAccountItem { id: string; name: string; selected: boolean }
interface FieldMapping { fb_field_name: string; fb_field_label: string; contact_field: string; is_custom_field: boolean }

// Standard contact fields available for mapping
const STANDARD_CONTACT_FIELDS = [
  { value: "first_name", label: "Nombre" },
  { value: "last_name", label: "Apellido" },
  { value: "primary_email", label: "Email" },
  { value: "primary_phone", label: "Teléfono" },
  { value: "birthday", label: "Fecha de nacimiento" },
  { value: "city", label: "Ciudad" },
  { value: "country", label: "País" },
  { value: "language", label: "Idioma" },
  { value: "notes", label: "Notas" },
  { value: "utm_source", label: "UTM Source" },
  { value: "utm_medium", label: "UTM Medium" },
  { value: "utm_campaign", label: "UTM Campaign" },
  { value: "utm_content", label: "UTM Content" },
  { value: "landing_page", label: "Landing Page" },
  { value: "adset", label: "Ad Set" },
  { value: "ad", label: "Ad" },
];

export function FacebookSetupWizard({ open, onOpenChange }: FacebookSetupWizardProps) {
  const { t } = useTranslation();
  const fb = useFacebookIntegration();
  const { user } = useAuth();
  const { organizationId } = useOrganizationContext();
  const [step, setStep] = useState<Step>("pages");
  const [loading, setLoading] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);

  // Pages
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Forms
  const [forms, setForms] = useState<FormItem[]>([]);

  // Field mapping
  const [currentFormIndex, setCurrentFormIndex] = useState(0);
  const [allFormMappings, setAllFormMappings] = useState<Record<string, FieldMapping[]>>({});
  const [newCustomField, setNewCustomField] = useState("");
  // Custom fields defined by the org in Configuración → Campos (mapping targets)
  const [orgCustomFields, setOrgCustomFields] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => {
    if (!organizationId) { setOrgCustomFields([]); return; }
    supabase.from("custom_field_definitions")
      .select("key, label").eq("organization_id", organizationId).order("position")
      .then(({ data }) => setOrgCustomFields((data as { key: string; label: string }[]) || []));
  }, [organizationId]);

  // Ad accounts & campaigns
  const [adAccounts, setAdAccounts] = useState<AdAccountItem[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [formSearch, setFormSearch] = useState("");
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [leadsImported, setLeadsImported] = useState<{ contacts: number; deals: number } | null>(null);

  const selectedForms = useMemo(() => forms.filter(f => f.selected), [forms]);
  const filteredForms = useMemo(() => {
    if (!formSearch.trim()) return forms;
    const q = formSearch.toLowerCase();
    return forms.filter(f => f.name.toLowerCase().includes(q));
  }, [forms, formSearch]);
  const allFormsSelected = forms.length > 0 && forms.every(f => f.selected);
  const currentForm = selectedForms[currentFormIndex] || null;
  const currentMappings = currentForm ? (allFormMappings[currentForm.id] || []) : [];

  useEffect(() => {
    if (open) {
      setStep("pages");
      loadPages();
      // Fetch pipelines scoped to the current org
      if (user && organizationId) {
        supabase
          .from("pipelines")
          .select("id, name")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true })
          .then(({ data }) => setPipelines((data || []).map(p => ({ id: p.id, name: p.name }))));
      }
    }
  }, [open, user, organizationId]);

  const loadPages = async () => {
    setLoading(true);
    const fetchedPages = await fb.getPages();
    setPages(fetchedPages.map(p => ({ id: p.id, name: p.name, access_token: p.access_token, category: p.category, selected: false, connected_org_name: (p as any).connected_org_name ?? null })));
    setLoading(false);
  };

  const handleSavePages = async () => {
    const selected = pages.filter(p => p.selected);
    if (selected.length === 0) return;
    setLoading(true);
    await fb.savePages(selected.map(p => ({ page_id: p.id, page_name: p.name, page_access_token: p.access_token })));
    setSelectedPageId(selected[0].id);

    // Fetch forms for EVERY selected page (not just the first), tagging each form
    // with the page it belongs to, so multi-page connections show all forms.
    const allForms: FormItem[] = [];
    for (const pg of selected) {
      const pageForms = await fb.getLeadForms(pg.id);
      for (const f of pageForms) {
        allForms.push({ id: f.id, name: f.name, status: f.status, selected: false, page_id: pg.id, page_name: pg.name, questions: f.questions });
      }
    }

    // Merge the saved pipeline mapping so previously-chosen pipelines are kept
    // (getLeadForms returns the LIVE FB forms, without the saved pipeline_id).
    const { data: savedForms } = await supabase
      .from("facebook_lead_forms")
      .select("form_id, pipeline_id");
    const savedMap = new Map<string, string | null>((savedForms || []).map((s: any) => [s.form_id, s.pipeline_id]));
    // Pre-select ONLY the forms that were already integrated (saved). On a
    // first-time setup nothing is pre-selected so the user picks what they want.
    const hasSaved = savedMap.size > 0;
    setForms(allForms.map(f => ({
      ...f,
      selected: hasSaved ? savedMap.has(f.id) : false,
      pipeline_id: savedMap.get(f.id) ?? undefined,
    })));
    setLoading(false);
    setStep("forms");
  };

  const handleSaveForms = async () => {
    setLoading(true);
    const selected = forms.filter(f => f.selected);
    // Save grouped BY PAGE so each page's deselected forms are correctly removed
    // (the backend replaces the selection per page). Iterate every page that has
    // forms — even with none selected — so deselecting all of a page un-integrates it.
    const pageIds = [...new Set(forms.map(f => f.page_id).filter(Boolean) as string[])];
    const pagesToSave = pageIds.length ? pageIds : (selectedPageId ? [selectedPageId] : []);
    for (const pid of pagesToSave) {
      const pageForms = selected.filter(f => (f.page_id ?? selectedPageId) === pid);
      await fb.saveLeadForms(pid, pageForms.map(f => ({ form_id: f.id, form_name: f.name, form_status: f.status, pipeline_id: f.pipeline_id })));
    }

    // Initialize mappings for each selected form from its questions
    const mappingsInit: Record<string, FieldMapping[]> = {};
    for (const form of selected) {
      if (form.questions && form.questions.length > 0) {
        mappingsInit[form.id] = form.questions.map(q => ({
          fb_field_name: q.key,
          fb_field_label: q.label || q.key,
          contact_field: autoMapField(q.key),
          is_custom_field: false,
        }));
      }
    }
    setAllFormMappings(mappingsInit);
    setCurrentFormIndex(0);
    setLoading(false);

    // If any form has questions, go to mapping step
    const hasQuestions = selected.some(f => f.questions && f.questions.length > 0);
    if (hasQuestions) {
      setStep("mapping");
    } else {
      setStep("messenger");
    }
  };

  // Auto-map common FB field keys to contact fields
  function autoMapField(key: string): string {
    const k = key.toLowerCase();
    if (k === "first_name" || k === "nombre") return "first_name";
    if (k === "last_name" || k === "apellido" || k === "apellidos") return "last_name";
    if (k === "full_name" || k === "nombre_completo" || k === "name") return "first_name";
    if (k === "email" || k === "correo" || k === "correo_electrónico") return "primary_email";
    if (k === "phone_number" || k === "telefono" || k === "teléfono" || k === "phone" || k === "número_de_teléfono") return "primary_phone";
    if (k === "date_of_birth" || k === "fecha_de_nacimiento" || k === "birthday" || k === "cumpleaños") return "birthday";
    if (k === "city" || k === "ciudad") return "city";
    if (k === "country" || k === "país") return "country";
    return "__skip__";
  }

  const updateMapping = (formId: string, fbFieldName: string, contactField: string, isCustom: boolean) => {
    setAllFormMappings(prev => ({
      ...prev,
      [formId]: (prev[formId] || []).map(m =>
        m.fb_field_name === fbFieldName ? { ...m, contact_field: contactField, is_custom_field: isCustom } : m
      ),
    }));
  };

  // Create a REAL custom field (persisted to custom_field_definitions, like
  // Configuración → Campos) and map it to the first unmapped Meta question.
  const createAndMapCustomField = async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || !organizationId) return;
    const fieldKey = trimmed.toLowerCase().replace(/\s+/g, "_");
    // Persist the definition (idempotent — skip if the key already exists)
    if (!orgCustomFields.some(cf => cf.key === fieldKey)) {
      const { error } = await supabase.from("custom_field_definitions").insert({
        organization_id: organizationId,
        key: fieldKey,
        label: trimmed,
        field_type: "text",
        position: orgCustomFields.length,
      });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        toast.error(t("facebookSetupWizard.customFieldCreateError"));
        return;
      }
      setOrgCustomFields(prev => [...prev, { key: fieldKey, label: trimmed }]);
    }
    setNewCustomField("");
    // Auto-assign to the first still-unmapped Meta question, if any
    if (currentForm) {
      const firstUnmapped = currentMappings.find(m => m.contact_field === "__skip__");
      if (firstUnmapped) updateMapping(currentForm.id, firstUnmapped.fb_field_name, fieldKey, true);
    }
  };

  const handleSaveMappings = async () => {
    // If no form or no mappings, just move on
    if (!currentForm) {
      if (currentFormIndex < selectedForms.length - 1) {
        setCurrentFormIndex(prev => prev + 1);
      } else {
        setStep("messenger");
      }
      return;
    }
    setLoading(true);

    const mappingsToSave = currentMappings
      .filter(m => m.contact_field !== "__skip__")
      .map(m => ({
        fb_field_name: m.fb_field_name,
        contact_field: m.contact_field,
        is_custom_field: m.is_custom_field,
      }));

    await fb.saveFieldMappings(currentForm.id, mappingsToSave);

    // Move to next form or next step
    if (currentFormIndex < selectedForms.length - 1) {
      setCurrentFormIndex(prev => prev + 1);
    } else {
      setStep("messenger");
    }
    setLoading(false);
  };

  const handleMessengerNext = () => {
    // Subscribe every connected page to Messenger webhook fields so incoming
    // messages reach the CRM inbox (fire-and-forget, additive to leadgen/feed).
    for (const p of fb.status?.pages || []) {
      supabase.functions.invoke("facebook-api", {
        body: { action: "subscribe_page_messages", page_id: p.page_id, organization_id: organizationId },
      }).catch(() => {});
    }
    setStep("campaigns");
    loadAdAccounts();
  };

  const loadAdAccounts = async () => {
    setLoading(true);
    const accounts = await fb.getAdAccounts();
    setAdAccounts(accounts.map(a => ({ id: a.id, name: a.name, selected: false })));
    setLoading(false);
  };

  const handleImportCampaigns = async () => {
    const selected = adAccounts.filter(a => a.selected);
    if (selected.length === 0) return;
    setLoading(true);
    let total = 0;
    for (const account of selected) {
      const result = await fb.importCampaigns(account.id);
      if (result) total += result.total;
    }
    setImportedCount(total);
    setLoading(false);
    setStep("done");
  };

  // Collect all custom fields defined across mappings for dropdown options
  const customFieldOptions = useMemo(() => {
    const map = new Map<string, string>(); // key -> label
    // Org-defined custom fields (from Settings) come first as proper targets.
    orgCustomFields.forEach(cf => map.set(cf.key, cf.label || cf.key));
    // Plus any ad-hoc custom fields already chosen in mappings.
    Object.values(allFormMappings).forEach(mappings => {
      mappings.forEach(m => {
        if (m.is_custom_field && m.contact_field !== "__skip__" && !map.has(m.contact_field)) {
          map.set(m.contact_field, m.contact_field);
        }
      });
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [allFormMappings, orgCustomFields]);

  const stepIndex: Record<Step, number> = { pages: 0, forms: 1, mapping: 2, messenger: 3, campaigns: 4, done: 5 };
  const steps = [
    { key: "pages", label: t("facebookSetupWizard.stepPages"), icon: Facebook },
    { key: "forms", label: t("facebookSetupWizard.stepForms"), icon: FileText },
    { key: "mapping", label: t("facebookSetupWizard.stepMapping"), icon: Settings2 },
    { key: "campaigns", label: t("facebookSetupWizard.stepCampaigns"), icon: BarChart3 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(221,44%,41%)]/10">
              <Facebook className="h-4 w-4" style={{ color: "hsl(221, 44%, 41%)" }} />
            </div>
            {t("facebookSetupWizard.title")}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1 mb-4">
          {steps.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
              <div className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                i <= stepIndex[step] ? "bg-primary" : "bg-muted"
              )} />
              <span className={cn(
                "text-[10px] font-medium",
                i <= stepIndex[step] ? "text-primary" : "text-muted-foreground"
              )}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">
          {/* PAGES */}
          {step === "pages" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.pagesIntro")}</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.noPages")}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={loadPages}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> {t("facebookSetupWizard.retry")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {pages.map((page) => {
                    const takenElsewhere = !!page.connected_org_name;
                    return (
                      <label key={page.id} className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                        takenElsewhere ? "opacity-60 cursor-not-allowed bg-muted/30"
                          : page.selected ? "border-primary/30 bg-primary/5 cursor-pointer" : "hover:bg-muted/50 cursor-pointer"
                      )}>
                        <Checkbox
                          checked={page.selected}
                          disabled={takenElsewhere}
                          onCheckedChange={(checked) =>
                            setPages(prev => prev.map(p => p.id === page.id ? { ...p, selected: !!checked } : p))
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{page.name}</p>
                          {takenElsewhere ? (
                            <p className="text-xs text-amber-600">{t("facebookSetupWizard.alreadyConnected", { org: page.connected_org_name })}</p>
                          ) : page.category && <p className="text-xs text-muted-foreground">{page.category}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <Button
                className="w-full"
                disabled={!pages.some(p => p.selected) || loading}
                onClick={handleSavePages}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t("facebookSetupWizard.continue")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* FORMS */}
          {step === "forms" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.formsIntro")}</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : forms.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.noForms")}</p>
                </div>
              ) : (
                <>
                  {/* Search + Select all */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder={t("facebookSetupWizard.searchFormPlaceholder")}
                        value={formSearch}
                        onChange={(e) => setFormSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 px-1 cursor-pointer">
                      <Checkbox
                        checked={allFormsSelected}
                        onCheckedChange={(checked) =>
                          setForms(prev => prev.map(f => ({ ...f, selected: !!checked })))
                        }
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        {allFormsSelected ? t("facebookSetupWizard.deselectAll") : t("facebookSetupWizard.selectAll")}
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">{forms.filter(f => f.selected).length}/{forms.length}</Badge>
                    </label>
                  </div>

                  <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
                    {filteredForms.map((form) => (
                      <div key={form.id} className={cn(
                        "rounded-lg border p-3 transition-colors",
                        form.selected ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"
                      )}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={form.selected}
                            onCheckedChange={(checked) =>
                              setForms(prev => prev.map(f => f.id === form.id ? { ...f, selected: !!checked } : f))
                            }
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{form.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Badge variant="outline" className="text-xs">{form.status}</Badge>
                              {form.questions && <span className="text-xs text-muted-foreground">{t("facebookSetupWizard.fieldsCount", { count: form.questions.length })}</span>}
                              {form.page_name && <span className="text-xs text-blue-500/80">· {form.page_name}</span>}
                            </div>
                          </div>
                        </label>
                        {form.selected && pipelines.length > 0 && (
                          <div className="mt-2 ml-7">
                            <Select
                              value={form.pipeline_id || "__default__"}
                              onValueChange={(val) =>
                                setForms(prev => prev.map(f => f.id === form.id ? { ...f, pipeline_id: val === "__default__" ? undefined : val } : f))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder={t("facebookSetupWizard.targetPipelinePlaceholder")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__" className="text-xs text-muted-foreground">{t("facebookSetupWizard.defaultPipeline")}</SelectItem>
                                {pipelines.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    ))}
                    {filteredForms.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">{t("facebookSetupWizard.noFormsMatch", { query: formSearch })}</p>
                    )}
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("pages")} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t("facebookSetupWizard.back")}
                </Button>
                <Button className="flex-1" onClick={handleSaveForms} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {t("facebookSetupWizard.continue")} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* FIELD MAPPING */}
          {step === "mapping" && !currentForm && (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.noFieldsToMap")}</p>
              </div>
              <Button className="w-full" onClick={() => setStep("messenger")}>
                {t("facebookSetupWizard.continue")} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {step === "mapping" && currentForm && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{t("facebookSetupWizard.fieldMapping")}</p>
                  {selectedForms.length > 1 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {currentFormIndex + 1} / {selectedForms.length}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-primary font-medium mt-0.5 truncate">{currentForm.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {t("facebookSetupWizard.mappingHelp")}
                </p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>{t("facebookSetupWizard.fbFieldHeader")}</span>
                <span></span>
                <span>{t("facebookSetupWizard.contactFieldHeader")}</span>
              </div>

              {/* Mapping rows */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-thin pr-0.5">
                {currentMappings.map((mapping) => {
                  const isMapped = mapping.contact_field !== "__skip__";
                  return (
                    <div
                      key={mapping.fb_field_name}
                      className={cn(
                        "grid grid-cols-[1fr_auto_1fr] gap-2 items-center rounded-lg border p-2.5 transition-colors",
                        isMapped ? "border-primary/20 bg-primary/5" : "border-border"
                      )}
                    >
                      {/* FB field */}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{mapping.fb_field_label}</p>
                        <p className="text-[9px] text-muted-foreground font-mono truncate mt-0.5">{mapping.fb_field_name}</p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className={cn("h-3 w-3 shrink-0", isMapped ? "text-primary" : "text-muted-foreground/40")} />

                      {/* Contact field selector */}
                      <Select
                        value={mapping.contact_field}
                        onValueChange={(value) => {
                          const isCustom = !STANDARD_CONTACT_FIELDS.some(f => f.value === value);
                          updateMapping(currentForm.id, mapping.fb_field_name, value, isCustom);
                        }}
                      >
                        <SelectTrigger className={cn(
                          "h-8 text-xs w-full",
                          !isMapped && "text-muted-foreground"
                        )}>
                          <SelectValue placeholder={t("facebookSetupWizard.selectPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">
                            <span className="text-muted-foreground">{t("facebookSetupWizard.skipOption")}</span>
                          </SelectItem>
                          {STANDARD_CONTACT_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                          {customFieldOptions.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">{t("facebookSetupWizard.customFieldsLabel")}</div>
                              {customFieldOptions.map(cf => (
                                <SelectItem key={`custom_${cf.key}`} value={cf.key}>
                                  <span className="flex items-center gap-1">
                                    <Plus className="h-3 w-3 text-primary" /> {cf.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Add custom field */}
              <div className="rounded-lg border border-dashed p-2.5 space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground">{t("facebookSetupWizard.createCustomField")}</p>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("facebookSetupWizard.customFieldPlaceholder")}
                    value={newCustomField}
                    onChange={(e) => setNewCustomField(e.target.value)}
                    className="text-xs h-8"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createAndMapCustomField(newCustomField);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={!newCustomField.trim()}
                    onClick={() => createAndMapCustomField(newCustomField)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> {t("facebookSetupWizard.create")}
                  </Button>
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <span>{t("facebookSetupWizard.mappedCount", { count: currentMappings.filter(m => m.contact_field !== "__skip__").length })}</span>
                <span>•</span>
                <span>{t("facebookSetupWizard.skippedCount", { count: currentMappings.filter(m => m.contact_field === "__skip__").length })}</span>
                <span>•</span>
                <span>{t("facebookSetupWizard.customCount", { count: currentMappings.filter(m => m.is_custom_field).length })}</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  if (currentFormIndex > 0) setCurrentFormIndex(prev => prev - 1);
                  else setStep("forms");
                }} className="flex-1">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t("facebookSetupWizard.back")}
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSaveMappings} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {currentFormIndex < selectedForms.length - 1 ? t("facebookSetupWizard.next") : t("facebookSetupWizard.continue")} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-[11px] h-7" onClick={() => setStep("messenger")}>
                {t("facebookSetupWizard.skipMapping")}
              </Button>
            </div>
          )}

          {/* MESSENGER */}
          {step === "messenger" && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#007FFF]/10">
                    <MessengerIcon size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("facebookSetupWizard.messengerInbox")}</p>
                    <p className="text-xs text-muted-foreground">{t("facebookSetupWizard.messengerDescription")}</p>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {t("facebookSetupWizard.messengerFeature1")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {t("facebookSetupWizard.messengerFeature2")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {t("facebookSetupWizard.messengerFeature3")}</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  const hasQuestions = selectedForms.some(f => f.questions && f.questions.length > 0);
                  if (hasQuestions) {
                    setCurrentFormIndex(selectedForms.length - 1);
                    setStep("mapping");
                  } else {
                    setStep("forms");
                  }
                }} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t("facebookSetupWizard.back")}
                </Button>
                <Button className="flex-1" onClick={handleMessengerNext}>
                  {t("facebookSetupWizard.continue")} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* CAMPAIGNS */}
          {step === "campaigns" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.campaignsIntro")}</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : adAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("facebookSetupWizard.noAdAccounts")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {adAccounts.map((account) => (
                    <label key={account.id} className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      account.selected ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"
                    )}>
                      <Checkbox
                        checked={account.selected}
                        onCheckedChange={(checked) =>
                          setAdAccounts(prev => prev.map(a => a.id === account.id ? { ...a, selected: !!checked } : a))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.id}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("messenger")} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t("facebookSetupWizard.back")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={!adAccounts.some(a => a.selected) || loading}
                  onClick={handleImportCampaigns}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {t("facebookSetupWizard.importCampaigns")}
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("done")}>
                {t("facebookSetupWizard.skipStep")}
              </Button>
            </div>
          )}

          {/* DONE */}
          {step === "done" && (
            <div className="text-center py-6 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{t("facebookSetupWizard.doneTitle")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("facebookSetupWizard.doneSubtitle")}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("facebookSetupWizard.summaryPages")}</span>
                  <span className="font-medium text-foreground">{pages.filter(p => p.selected).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("facebookSetupWizard.summaryForms")}</span>
                  <span className="font-medium text-foreground">{selectedForms.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("facebookSetupWizard.summaryMappedFields")}</span>
                  <span className="font-medium text-foreground">
                    {Object.values(allFormMappings).reduce((sum, m) => sum + m.filter(f => f.contact_field !== "__skip__").length, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("facebookSetupWizard.summaryMessenger")}</span>
                  <span className="font-medium text-green-500">{t("facebookSetupWizard.active")}</span>
                </div>
                {importedCount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("facebookSetupWizard.summaryCampaigns")}</span>
                    <span className="font-medium text-foreground">{importedCount}</span>
                  </div>
                )}
                {leadsImported && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("facebookSetupWizard.summaryLeads")}</span>
                    <span className="font-medium text-foreground">{t("facebookSetupWizard.leadsDealsCount", { contacts: leadsImported.contacts, deals: leadsImported.deals })}</span>
                  </div>
                )}
              </div>

              {/* Sync leads button */}
              {selectedForms.length > 0 && selectedPageId && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={syncingLeads}
                  onClick={async () => {
                    setSyncingLeads(true);
                    let totalContacts = 0;
                    let totalDeals = 0;
                    for (const form of selectedForms) {
                      const result = await fb.fetchLeads(form.id, selectedPageId!);
                      if (result?.imported) {
                        totalContacts += result.imported.contacts;
                        totalDeals += result.imported.deals;
                      }
                    }
                    setLeadsImported({ contacts: totalContacts, deals: totalDeals });
                    setSyncingLeads(false);
                  }}
                >
                  {syncingLeads ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t("facebookSetupWizard.importingLeads")}</>
                  ) : (
                    <><Download className="h-4 w-4 mr-1" /> {t("facebookSetupWizard.importLeadsNow")}</>
                  )}
                </Button>
              )}

              <Button className="w-full" onClick={() => onOpenChange(false)}>
                {t("facebookSetupWizard.close")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
