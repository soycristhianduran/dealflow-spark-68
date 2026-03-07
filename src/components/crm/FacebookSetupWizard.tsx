import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Facebook, FileText, MessageCircle, BarChart3, ArrowRight, ArrowLeft, RefreshCw, Settings2, Plus, Search } from "lucide-react";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { cn } from "@/lib/utils";

interface FacebookSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "pages" | "forms" | "mapping" | "messenger" | "campaigns" | "done";

interface PageItem { id: string; name: string; access_token: string; category?: string; selected: boolean }
interface FormItem { id: string; name: string; status: string; selected: boolean; questions?: { key: string; label: string; type: string }[] }
interface AdAccountItem { id: string; name: string; selected: boolean }
interface FieldMapping { fb_field_name: string; fb_field_label: string; contact_field: string; is_custom_field: boolean }

// Standard contact fields available for mapping
const STANDARD_CONTACT_FIELDS = [
  { value: "full_name", label: "Nombre completo" },
  { value: "primary_email", label: "Email" },
  { value: "primary_phone", label: "Teléfono" },
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
  const fb = useFacebookIntegration();
  const [step, setStep] = useState<Step>("pages");
  const [loading, setLoading] = useState(false);

  // Pages
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Forms
  const [forms, setForms] = useState<FormItem[]>([]);

  // Field mapping
  const [currentFormIndex, setCurrentFormIndex] = useState(0);
  const [allFormMappings, setAllFormMappings] = useState<Record<string, FieldMapping[]>>({});
  const [newCustomField, setNewCustomField] = useState("");

  // Ad accounts & campaigns
  const [adAccounts, setAdAccounts] = useState<AdAccountItem[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [formSearch, setFormSearch] = useState("");

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
    }
  }, [open]);

  const loadPages = async () => {
    setLoading(true);
    const fetchedPages = await fb.getPages();
    setPages(fetchedPages.map(p => ({ id: p.id, name: p.name, access_token: p.access_token, category: p.category, selected: false })));
    setLoading(false);
  };

  const handleSavePages = async () => {
    const selected = pages.filter(p => p.selected);
    if (selected.length === 0) return;
    setLoading(true);
    await fb.savePages(selected.map(p => ({ page_id: p.id, page_name: p.name, page_access_token: p.access_token })));
    setSelectedPageId(selected[0].id);
    const fetchedForms = await fb.getLeadForms(selected[0].id);
    setForms(fetchedForms.map(f => ({ id: f.id, name: f.name, status: f.status, selected: true, questions: f.questions })));
    setLoading(false);
    setStep("forms");
  };

  const handleSaveForms = async () => {
    if (!selectedPageId) return;
    setLoading(true);
    const selected = forms.filter(f => f.selected);
    await fb.saveLeadForms(selectedPageId, selected.map(f => ({ form_id: f.id, form_name: f.name, form_status: f.status })));

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
    if (k === "full_name" || k === "nombre_completo" || k === "name" || k === "nombre") return "full_name";
    if (k === "email" || k === "correo" || k === "correo_electrónico") return "primary_email";
    if (k === "phone_number" || k === "telefono" || k === "teléfono" || k === "phone" || k === "número_de_teléfono") return "primary_phone";
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

  const handleAddCustomField = () => {
    if (!newCustomField.trim() || !currentForm) return;
    const fieldKey = newCustomField.trim().toLowerCase().replace(/\s+/g, "_");
    // This just adds it as an option - we don't modify the mapping here
    setNewCustomField("");
    // Auto-select the new custom field for the first unmapped field
    // (user can manually assign it via the dropdown)
  };

  const handleSaveMappings = async () => {
    if (!currentForm) return;
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
    const customs = new Set<string>();
    Object.values(allFormMappings).forEach(mappings => {
      mappings.forEach(m => {
        if (m.is_custom_field && m.contact_field !== "__skip__") {
          customs.add(m.contact_field);
        }
      });
    });
    return Array.from(customs);
  }, [allFormMappings]);

  const stepIndex: Record<Step, number> = { pages: 0, forms: 1, mapping: 2, messenger: 3, campaigns: 4, done: 5 };
  const steps = [
    { key: "pages", label: "Páginas", icon: Facebook },
    { key: "forms", label: "Formularios", icon: FileText },
    { key: "mapping", label: "Mapeo", icon: Settings2 },
    { key: "campaigns", label: "Campañas", icon: BarChart3 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(221,44%,41%)]/10">
              <Facebook className="h-4 w-4" style={{ color: "hsl(221, 44%, 41%)" }} />
            </div>
            Configurar Facebook
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
              <p className="text-sm text-muted-foreground">Selecciona las páginas de Facebook que quieres conectar al CRM:</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pages.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">No se encontraron páginas en tu cuenta</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={loadPages}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reintentar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {pages.map((page) => (
                    <label key={page.id} className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      page.selected ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"
                    )}>
                      <Checkbox
                        checked={page.selected}
                        onCheckedChange={(checked) =>
                          setPages(prev => prev.map(p => p.id === page.id ? { ...p, selected: !!checked } : p))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{page.name}</p>
                        {page.category && <p className="text-xs text-muted-foreground">{page.category}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <Button
                className="w-full"
                disabled={!pages.some(p => p.selected) || loading}
                onClick={handleSavePages}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Continuar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* FORMS */}
          {step === "forms" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecciona los formularios de leads que quieres sincronizar:</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : forms.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">No se encontraron formularios de leads en esta página</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {forms.map((form) => (
                    <label key={form.id} className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      form.selected ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"
                    )}>
                      <Checkbox
                        checked={form.selected}
                        onCheckedChange={(checked) =>
                          setForms(prev => prev.map(f => f.id === form.id ? { ...f, selected: !!checked } : f))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{form.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">{form.status}</Badge>
                          {form.questions && <span className="text-xs text-muted-foreground">{form.questions.length} campos</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("pages")} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button className="flex-1" onClick={handleSaveForms} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Continuar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* FIELD MAPPING */}
          {step === "mapping" && currentForm && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Mapeo de campos: <span className="text-primary">{currentForm.name}</span>
                </p>
                {selectedForms.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Formulario {currentFormIndex + 1} de {selectedForms.length}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Asigna cada campo del formulario de Facebook al campo del contacto donde quieres guardar la información.
                </p>
              </div>

              {/* Mapping rows */}
              <div className="space-y-2">
                {currentMappings.map((mapping) => (
                  <div key={mapping.fb_field_name} className="flex items-center gap-2 rounded-lg border p-2.5">
                    {/* FB field label */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{mapping.fb_field_label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{mapping.fb_field_name}</p>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                    {/* Contact field selector */}
                    <Select
                      value={mapping.contact_field}
                      onValueChange={(value) => {
                        const isCustom = !STANDARD_CONTACT_FIELDS.some(f => f.value === value);
                        updateMapping(currentForm.id, mapping.fb_field_name, value, isCustom);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Seleccionar campo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="text-muted-foreground">— Omitir —</span>
                        </SelectItem>
                        {STANDARD_CONTACT_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                        {customFieldOptions.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Campos personalizados</div>
                            {customFieldOptions.map(cf => (
                              <SelectItem key={`custom_${cf}`} value={cf}>
                                <span className="flex items-center gap-1">
                                  <Plus className="h-3 w-3" /> {cf}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Add custom field */}
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">¿Necesitas un campo personalizado?</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: presupuesto, interés..."
                    value={newCustomField}
                    onChange={(e) => setNewCustomField(e.target.value)}
                    className="text-sm h-8"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!newCustomField.trim()) return;
                        const fieldKey = newCustomField.trim().toLowerCase().replace(/\s+/g, "_");
                        // Find first unmapped field and assign it
                        const firstUnmapped = currentMappings.find(m => m.contact_field === "__skip__");
                        if (firstUnmapped) {
                          updateMapping(currentForm.id, firstUnmapped.fb_field_name, fieldKey, true);
                        }
                        setNewCustomField("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    disabled={!newCustomField.trim()}
                    onClick={() => {
                      const fieldKey = newCustomField.trim().toLowerCase().replace(/\s+/g, "_");
                      const firstUnmapped = currentMappings.find(m => m.contact_field === "__skip__");
                      if (firstUnmapped) {
                        updateMapping(currentForm.id, firstUnmapped.fb_field_name, fieldKey, true);
                      }
                      setNewCustomField("");
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Crear campo
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  if (currentFormIndex > 0) setCurrentFormIndex(prev => prev - 1);
                  else setStep("forms");
                }} className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button className="flex-1" onClick={handleSaveMappings} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {currentFormIndex < selectedForms.length - 1 ? "Siguiente formulario" : "Continuar"} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("messenger")}>
                Omitir mapeo
              </Button>
            </div>
          )}

          {/* MESSENGER */}
          {step === "messenger" && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Bandeja de Messenger</p>
                    <p className="text-xs text-muted-foreground">Los mensajes de Messenger de tus páginas se capturarán automáticamente</p>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Captura automática de mensajes entrantes</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Vinculación con leads existentes</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Historial de conversaciones por contacto</li>
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
                  <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button className="flex-1" onClick={handleMessengerNext}>
                  Continuar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* CAMPAIGNS */}
          {step === "campaigns" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecciona las cuentas publicitarias para importar el historial de campañas:</p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : adAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">No se encontraron cuentas publicitarias</p>
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
                  <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
                </Button>
                <Button
                  className="flex-1"
                  disabled={!adAccounts.some(a => a.selected) || loading}
                  onClick={handleImportCampaigns}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Importar campañas
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("done")}>
                Omitir este paso
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
                <h3 className="text-lg font-semibold text-foreground">¡Facebook conectado!</h3>
                <p className="text-sm text-muted-foreground mt-1">Tu integración está lista y funcionando</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Páginas conectadas</span>
                  <span className="font-medium text-foreground">{pages.filter(p => p.selected).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Formularios sincronizados</span>
                  <span className="font-medium text-foreground">{selectedForms.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Campos mapeados</span>
                  <span className="font-medium text-foreground">
                    {Object.values(allFormMappings).reduce((sum, m) => sum + m.filter(f => f.contact_field !== "__skip__").length, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Messenger</span>
                  <span className="font-medium text-green-500">Activo</span>
                </div>
                {importedCount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Campañas importadas</span>
                    <span className="font-medium text-foreground">{importedCount}</span>
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
