import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Facebook, FileText, MessageCircle, BarChart3, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { cn } from "@/lib/utils";

interface FacebookSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "pages" | "forms" | "messenger" | "campaigns" | "done";

interface PageItem { id: string; name: string; access_token: string; category?: string; selected: boolean }
interface FormItem { id: string; name: string; status: string; selected: boolean }
interface AdAccountItem { id: string; name: string; selected: boolean }

export function FacebookSetupWizard({ open, onOpenChange }: FacebookSetupWizardProps) {
  const fb = useFacebookIntegration();
  const [step, setStep] = useState<Step>("pages");
  const [loading, setLoading] = useState(false);

  // Pages
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Forms
  const [forms, setForms] = useState<FormItem[]>([]);

  // Ad accounts & campaigns
  const [adAccounts, setAdAccounts] = useState<AdAccountItem[]>([]);
  const [importedCount, setImportedCount] = useState(0);

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
    // Load forms for first selected page
    const fetchedForms = await fb.getLeadForms(selected[0].id);
    setForms(fetchedForms.map(f => ({ id: f.id, name: f.name, status: f.status, selected: true })));
    setLoading(false);
    setStep("forms");
  };

  const handleSaveForms = async () => {
    if (!selectedPageId) return;
    setLoading(true);
    const selected = forms.filter(f => f.selected);
    await fb.saveLeadForms(selectedPageId, selected.map(f => ({ form_id: f.id, form_name: f.name, form_status: f.status })));
    setLoading(false);
    setStep("messenger");
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

  const stepIndex = { pages: 0, forms: 1, messenger: 2, campaigns: 3, done: 4 };
  const steps = [
    { key: "pages", label: "Páginas", icon: Facebook },
    { key: "forms", label: "Formularios", icon: FileText },
    { key: "messenger", label: "Messenger", icon: MessageCircle },
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
                        <Badge variant="outline" className="text-xs mt-0.5">{form.status}</Badge>
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
                <Button variant="outline" onClick={() => setStep("forms")} className="flex-1">
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
                  <span className="font-medium text-foreground">{forms.filter(f => f.selected).length}</span>
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
