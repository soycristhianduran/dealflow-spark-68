import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { defaultStages } from "@/data/mock-data";
import { Plus, Trash2, X, Pencil, ArrowUp, ArrowDown, Sun, Moon, Monitor, Upload, ImageIcon, Loader2, Mail, UserCheck, Clock, Link2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { PipelineStage } from "@/types/crm";
import { useTheme } from "@/components/ThemeProvider";
import { validateSlug, toSlug, buildWorkspaceUrl } from "@/lib/subdomain";

const stageColorOptions = [
  { value: "hsl(220, 70%, 50%)", label: "Azul" },
  { value: "hsl(262, 52%, 47%)", label: "Púrpura" },
  { value: "hsl(38, 92%, 50%)", label: "Amarillo" },
  { value: "hsl(25, 95%, 53%)", label: "Naranja" },
  { value: "hsl(173, 58%, 39%)", label: "Teal" },
  { value: "hsl(199, 89%, 48%)", label: "Celeste" },
  { value: "hsl(142, 71%, 45%)", label: "Verde" },
  { value: "hsl(0, 72%, 51%)", label: "Rojo" },
  { value: "hsl(340, 75%, 55%)", label: "Rosa" },
  { value: "hsl(280, 60%, 55%)", label: "Violeta" },
];

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  email: string;
  full_name: string | null;
}

interface OrgInvitation {
  id: string;
  email: string;
  role: string;
  expires_at: string | null;
  created_at?: string;
}

const currencies = [
  { value: "USD", label: "USD – Dólar estadounidense" },
  { value: "EUR", label: "EUR – Euro" },
  { value: "MXN", label: "MXN – Peso mexicano" },
  { value: "COP", label: "COP – Peso colombiano" },
  { value: "ARS", label: "ARS – Peso argentino" },
  { value: "CLP", label: "CLP – Peso chileno" },
  { value: "PEN", label: "PEN – Sol peruano" },
  { value: "BRL", label: "BRL – Real brasileño" },
  { value: "GBP", label: "GBP – Libra esterlina" },
];

const timezones = [
  { value: "America/New_York", label: "América/New York (EST)" },
  { value: "America/Chicago", label: "América/Chicago (CST)" },
  { value: "America/Denver", label: "América/Denver (MST)" },
  { value: "America/Los_Angeles", label: "América/Los Angeles (PST)" },
  { value: "America/Mexico_City", label: "América/Ciudad de México (CST)" },
  { value: "America/Bogota", label: "América/Bogotá (COT)" },
  { value: "America/Lima", label: "América/Lima (PET)" },
  { value: "America/Santiago", label: "América/Santiago (CLT)" },
  { value: "America/Buenos_Aires", label: "América/Buenos Aires (ART)" },
  { value: "America/Sao_Paulo", label: "América/São Paulo (BRT)" },
  { value: "Europe/Madrid", label: "Europa/Madrid (CET)" },
  { value: "Europe/London", label: "Europa/Londres (GMT)" },
  { value: "UTC", label: "UTC" },
];

const roles = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales_rep", label: "Sales Rep" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { organizationId, organization } = useOrganizationContext();

  // Team state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  // Tags state
  const [tags, setTags] = useState(["vip", "real-estate", "healthcare", "education", "enterprise", "new", "hot-lead"]);
  const [newTag, setNewTag] = useState("");

  // Pipeline state
  const [stages, setStages] = useState<PipelineStage[]>([...defaultStages]);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageColor, setStageColor] = useState(stageColorOptions[0].value);
  const [stageProbability, setStageProbability] = useState("50");

  // General state
  const [orgName, setOrgName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("America/Mexico_City");

  // Workspace slug state
  const [orgSlug, setOrgSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const slugValidation = validateSlug(slugInput);
  const slugChanged = slugInput !== orgSlug;

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      if (meta?.company_name && !orgName) {
        setOrgName(meta.company_name);
      }
    });
    // Load saved logo URL from localStorage
    const saved = localStorage.getItem("crm_logo_url");
    if (saved) setLogoUrl(saved);
  }, []);

  // Load slug via Edge Function (bypasses RLS issues on organization_members)
  useEffect(() => {
    const loadOrgSlug = async () => {
      try {
        const { data } = await supabase.functions.invoke("org-invitations", {
          body: { action: "get_org" },
        });
        if (data?.org?.slug) {
          setOrgSlug(data.org.slug);
          setSlugInput(data.org.slug);
        } else if (data?.org?.name) {
          setSlugInput(toSlug(data.org.name));
        }
        if (data?.org?.name && !orgName) {
          setOrgName(data.org.name);
        }
      } catch (_) {
        // fallback to context if edge function fails
        if (organization?.slug) {
          setOrgSlug(organization.slug);
          setSlugInput(organization.slug);
        } else if (organization?.name) {
          setSlugInput(toSlug(organization.name));
        }
      }
    };
    loadOrgSlug();
  }, []);

  const fetchTeam = async () => {
    if (!organizationId) return;
    setTeamLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "list_members" },
      });
      if (error) throw error;
      if (data?.members) setMembers(data.members);
      if (data?.invitations) setInvitations(data.invitations);
    } catch (err: any) {
      toast.error("Error al cargar el equipo: " + (err.message ?? "Error desconocido"));
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) fetchTeam();
  }, [organizationId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error("El email es requerido"); return; }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "invite", email: inviteEmail.trim(), role: inviteRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteRole("member");
      setInviteDialogOpen(false);
      fetchTeam();
    } catch (err: any) {
      toast.error("Error al invitar: " + (err.message ?? "Error desconocido"));
    } finally {
      setInviting(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no debe superar los 2MB");
      return;
    }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const fileName = `logo-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("company-logos")
      .upload(fileName, file, { upsert: true });

    if (error) {
      toast.error("Error al subir el logo");
      setUploadingLogo(false);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("company-logos")
      .getPublicUrl(fileName);

    const url = publicData.publicUrl;
    setLogoUrl(url);
    localStorage.setItem("crm_logo_url", url);
    setUploadingLogo(false);
    toast.success("Logo actualizado");
    // Dispatch event so sidebar updates in real-time
    window.dispatchEvent(new Event("logo-updated"));
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    localStorage.removeItem("crm_logo_url");
    window.dispatchEvent(new Event("logo-updated"));
    toast.success("Logo eliminado");
  };

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    if (tags.includes(tag)) { toast.error("El tag ya existe"); return; }
    setTags(prev => [...prev, tag]);
    setNewTag("");
    toast.success("Tag agregado");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    toast.success("Tag eliminado");
  };

  const handleSaveGeneral = () => {
    toast.success("Configuración guardada");
  };

  const handleSaveSlug = async () => {
    if (!slugValidation.valid) return;
    setSlugSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "save_slug", slug: slugInput },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setOrgSlug(slugInput);
      toast.success("¡Dirección guardada! Tu URL: " + buildWorkspaceUrl(slugInput));
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message ?? "Error desconocido"));
    } finally {
      setSlugSaving(false);
    }
  };

  const openAddStage = () => {
    setEditingStage(null);
    setStageName("");
    setStageColor(stageColorOptions[0].value);
    setStageProbability("50");
    setStageDialogOpen(true);
  };

  const openEditStage = (stage: PipelineStage) => {
    setEditingStage(stage);
    setStageName(stage.name);
    setStageColor(stage.color);
    setStageProbability(String(stage.probability));
    setStageDialogOpen(true);
  };

  const handleSaveStage = () => {
    if (!stageName.trim()) { toast.error("El nombre es requerido"); return; }
    const prob = Math.min(100, Math.max(0, parseInt(stageProbability) || 0));
    if (editingStage) {
      setStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, name: stageName, color: stageColor, probability: prob } : s));
      toast.success("Etapa actualizada");
    } else {
      const newOrder = stages.length + 1;
      setStages(prev => [...prev, { id: crypto.randomUUID(), pipeline_id: "p1", name: stageName, order: newOrder, color: stageColor, probability: prob }]);
      toast.success("Etapa agregada");
    }
    setStageDialogOpen(false);
  };

  const handleDeleteStage = (id: string) => {
    setStages(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
    toast.success("Etapa eliminada");
  };

  const handleMoveStage = (id: string, direction: "up" | "down") => {
    setStages(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if ((direction === "up" && idx === 0) || (direction === "down" && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };

  return (
    <AppLayout>
      <AppHeader title="Configuración" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <Tabs defaultValue="pipeline">
          <TabsList className="mb-6">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Etapas del Pipeline</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openAddStage}>
                  <Plus className="h-4 w-4" /> Agregar etapa
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => handleMoveStage(stage.id, "up")}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === stages.length - 1} onClick={() => handleMoveStage(stage.id, "down")}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="flex-1 text-sm font-medium text-foreground">{stage.name}</span>
                    <Badge variant="outline" className="text-xs">{stage.probability}%</Badge>
                    <span className="text-xs text-muted-foreground">Orden: {stage.order}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditStage(stage)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteStage(stage.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingStage ? "Editar etapa" : "Nueva etapa"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={stageName} onChange={e => setStageName(e.target.value)} placeholder="Ej: Propuesta enviada" />
                  </div>
                  <div className="space-y-2">
                    <Label>Probabilidad (%)</Label>
                    <Input type="number" min={0} max={100} value={stageProbability} onChange={e => setStageProbability(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {stageColorOptions.map(c => (
                        <button
                          key={c.value}
                          onClick={() => setStageColor(c.value)}
                          className={`h-8 w-8 rounded-full border-2 transition-all ${stageColor === c.value ? "border-foreground scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c.value }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStageDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSaveStage}>{editingStage ? "Guardar" : "Agregar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>



          <TabsContent value="equipo" className="space-y-4">
            {/* Members list */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Miembros del equipo
                  {organization && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">— {organization.name}</span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={fetchTeam} disabled={teamLoading}>
                    {teamLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actualizar"}
                  </Button>
                  <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Plus className="h-4 w-4" /> Invitar
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invitar al equipo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            placeholder="colaborador@empresa.com"
                            onKeyDown={e => e.key === "Enter" && handleInvite()}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rol</Label>
                          <Select value={inviteRole} onValueChange={setInviteRole}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Miembro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancelar</Button>
                        </DialogClose>
                        <Button onClick={handleInvite} disabled={inviting}>
                          {inviting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          Enviar invitación
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {teamLoading && members.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {organizationId ? "No se encontraron miembros." : "Sin organización asignada."}
                  </p>
                ) : members.map(member => {
                  const nameDisplay = member.full_name || member.email;
                  const initials = nameDisplay.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{nameDisplay}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                        {member.role === "owner" ? "Propietario" : member.role === "admin" ? "Admin" : "Miembro"}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Invitaciones pendientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {invitations.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-dashed p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs shrink-0">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                        {inv.expires_at && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expira: {new Date(inv.expires_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">
                        {inv.role === "admin" ? "Admin" : "Miembro"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">Pendiente</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tags" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Tags</CardTitle>
                <div className="flex items-center gap-2">
                  <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Nuevo tag..." className="h-9 w-40 text-sm" onKeyDown={e => e.key === "Enter" && handleAddTag()} />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAddTag}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-sm gap-1.5 pr-1.5">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            {/* Workspace URL Card */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Dirección del espacio de trabajo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <p className="text-sm text-muted-foreground">
                  Esta es la URL única de tu empresa en el CRM. Compártela con tu equipo para que accedan directamente a tu espacio.
                </p>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center rounded-md border bg-muted/40 overflow-hidden">
                      <span className="px-3 py-2 text-sm text-muted-foreground border-r bg-muted whitespace-nowrap">
                        app.aceleradoradeventas.co/
                      </span>
                      <Input
                        value={slugInput}
                        onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="miempresa"
                        className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-sm font-mono"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveSlug}
                      disabled={slugSaving || !slugValidation.valid || !slugChanged}
                    >
                      {slugSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                    </Button>
                  </div>

                  {/* Validation feedback */}
                  {slugInput.length > 0 && (
                    <div className={`flex items-center gap-1.5 text-xs ${slugValidation.valid ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {slugValidation.valid
                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> Tu URL: <span className="font-mono">{buildWorkspaceUrl(slugInput)}</span></>
                        : <><AlertCircle className="h-3.5 w-3.5" /> {slugValidation.error}</>
                      }
                    </div>
                  )}
                </div>

                {/* Current workspace URL */}
                {orgSlug && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Tu URL actual</p>
                    <a
                      href={buildWorkspaceUrl(orgSlug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline font-mono break-all"
                    >
                      {buildWorkspaceUrl(orgSlug)}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Comparte este enlace con tu equipo.
                    </p>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Logo Card */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Logo de la empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Sube el logo de tu empresa. Se mostrará en el menú lateral del CRM.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Tamaño recomendado:</strong> 200×200px o 400×100px (horizontal). Formatos: PNG, JPG, SVG. Máximo 2MB. Fondo transparente recomendado.
                    </p>
                    <div className="flex gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingLogo ? "Subiendo..." : "Subir logo"}
                      </Button>
                      {logoUrl && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Configuración general</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Nombre de la organización</Label>
                  <Input value={orgName} onChange={e => setOrgName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Moneda por defecto</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Zona horaria</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timezones.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Apariencia</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="h-4 w-4" /> Claro
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="h-4 w-4" /> Oscuro
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="h-4 w-4" /> Sistema
                    </Button>
                  </div>
                </div>
                <Button onClick={handleSaveGeneral}>Guardar cambios</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}
