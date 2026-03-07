import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Facebook, FileText, MessageCircle, BarChart3, ArrowRight, ArrowLeft, RefreshCw, Settings2, Plus, Search, Download } from "lucide-react";
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

  const handleAddCustomField = () => {
    if (!newCustomField.trim() || !currentForm) return;
    const fieldKey = newCustomField.trim().toLowerCase().replace(/\s+/g, "_");
    // This just adds it as an option - we don't modify the mapping here
    setNewCustomField("");
    // Auto-select the new custom field for the first unmapped field
    // (user can manually assign it via the dropdown)
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
                <>
                  {/* Search + Select all */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar formulario..."
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
                        {allFormsSelected ? "Deseleccionar todos" : "Seleccionar todos"}
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">{forms.filter(f => f.selected).length}/{forms.length}</Badge>
                    </label>
                  </div>

                  <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
                    {filteredForms.map((form) => (
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
                    {filteredForms.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No se encontraron formularios con "{formSearch}"</p>
                    )}
                  </div>
                </>
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
          {step === "mapping" && !currentForm && (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">No hay campos para mapear en los formularios seleccionados</p>
              </div>
              <Button className="w-full" onClick={() => setStep("messenger")}>
                Continuar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {step === "mapping" && currentForm && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Mapeo de campos</p>
                  {selectedForms.length > 1 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {currentFormIndex + 1} / {selectedForms.length}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-primary font-medium mt-0.5 truncate">{currentForm.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  Asigna cada campo al contacto. Los campos en "Omitir" se ignorarán automáticamente — puedes continuar sin modificarlos.
                </p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Campo Facebook</span>
                <span></span>
                <span>Campo contacto</span>
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
                          <SelectValue placeholder="Seleccionar..." />
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
                              <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Personalizados</div>
                              {customFieldOptions.map(cf => (
                                <SelectItem key={`custom_${cf}`} value={cf}>
                                  <span className="flex items-center gap-1">
                                    <Plus className="h-3 w-3 text-primary" /> {cf}
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
                <p className="text-[11px] font-medium text-muted-foreground">Crear campo personalizado</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: presupuesto, interés..."
                    value={newCustomField}
                    onChange={(e) => setNewCustomField(e.target.value)}
                    className="text-xs h-8"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!newCustomField.trim()) return;
                        const fieldKey = newCustomField.trim().toLowerCase().replace(/\s+/g, "_");
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
                    <Plus className="h-3 w-3 mr-1" /> Crear
                  </Button>
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <span>{currentMappings.filter(m => m.contact_field !== "__skip__").length} mapeados</span>
                <span>•</span>
                <span>{currentMappings.filter(m => m.contact_field === "__skip__").length} omitidos</span>
                <span>•</span>
                <span>{currentMappings.filter(m => m.is_custom_field).length} personalizados</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  if (currentFormIndex > 0) setCurrentFormIndex(prev => prev - 1);
                  else setStep("forms");
                }} className="flex-1">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Atrás
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSaveMappings} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {currentFormIndex < selectedForms.length - 1 ? "Siguiente" : "Continuar"} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
              <Button variant="ghost" className="w-full text-[11px] h-7" onClick={() => setStep("messenger")}>
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
                {leadsImported && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Leads importados</span>
                    <span className="font-medium text-foreground">{leadsImported.contacts} contactos, {leadsImported.deals} deals</span>
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
                    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Importando leads...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-1" /> Importar leads ahora</>
                  )}
                </Button>
              )}

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
