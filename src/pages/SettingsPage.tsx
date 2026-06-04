import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
import { Plus, Trash2, X, Pencil, ArrowUp, ArrowDown, Sun, Moon, Monitor, Upload, ImageIcon, Loader2, Mail, UserCheck, Clock, Link2, CheckCircle2, AlertCircle, UserX, RotateCcw, Key, Copy, Eye, EyeOff, Power, Lock } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
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

const editableRoles = [
  { value: "admin", label: "Admin", description: "Acceso total al CRM" },
  { value: "vendor", label: "Vendedor", description: "Crea y edita contactos, sin settings" },
  { value: "readonly", label: "Solo lectura", description: "Solo puede ver, no editar" },
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
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [cancelingInvite, setCancelingInvite] = useState<string | null>(null);
  const { isOwnerOrAdmin, myUserId } = usePermissions();

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

  // Email sender state
  const [emailFromName, setEmailFromName] = useState("");
  const [emailFromEmail, setEmailFromEmail] = useState("");
  const [senderSaving, setSenderSaving] = useState(false);

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

  // Load email sender config
  useEffect(() => {
    supabase.functions.invoke("org-invitations", { body: { action: "get_email_sender" } })
      .then(({ data }) => {
        if (data?.email_from_name) setEmailFromName(data.email_from_name);
        if (data?.email_from_email) setEmailFromEmail(data.email_from_email);
      });
  }, []);

  const handleSaveSender = async () => {
    setSenderSaving(true);
    const { data, error } = await supabase.functions.invoke("org-invitations", {
      body: { action: "save_email_sender", email_from_name: emailFromName.trim(), email_from_email: emailFromEmail.trim() },
    });
    setSenderSaving(false);
    if (error || data?.error) { toast.error(data?.error || "Error al guardar"); return; }
    toast.success("Remitente guardado correctamente");
  };

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
      // Prefer the specific error message from the function body over the generic HTTP error
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
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

  const handleUpdateRole = async (memberUserId: string, newRole: string) => {
    setUpdatingRoleFor(memberUserId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "update_role", member_user_id: memberUserId, new_role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, role: newRole } : m));
      toast.success("Rol actualizado");
    } catch (err: any) {
      toast.error("Error al cambiar rol: " + (err.message ?? "Error desconocido"));
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const handleResendInvite = async (invitationId: string, email: string) => {
    setResendingInvite(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "resend_invitation", invitation_id: invitationId },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      toast.success(`Invitación reenviada a ${email}`);
      fetchTeam(); // refresh to show updated expiry
    } catch (err: any) {
      toast.error("Error al reenviar: " + (err.message ?? "Error desconocido"));
    } finally {
      setResendingInvite(null);
    }
  };

  const handleCancelInvite = async (invitationId: string, email: string) => {
    setCancelingInvite(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "cancel_invitation", invitation_id: invitationId },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
      toast.success(`Invitación de ${email} cancelada`);
    } catch (err: any) {
      toast.error("Error al cancelar: " + (err.message ?? "Error desconocido"));
    } finally {
      setCancelingInvite(null);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    setRemovingMember(memberUserId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "remove_member", member_user_id: memberUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembers(prev => prev.filter(m => m.user_id !== memberUserId));
      toast.success("Miembro eliminado del equipo");
    } catch (err: any) {
      toast.error("Error al eliminar miembro: " + (err.message ?? "Error desconocido"));
    } finally {
      setRemovingMember(null);
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
      if (isSetupMode) {
        toast.success("¡Dirección confirmada! Bienvenido a tu espacio de trabajo.");
        navigate(`/w/${slugInput}`, { replace: true });
      } else {
        toast.success("¡Dirección guardada! Tu URL: " + buildWorkspaceUrl(slugInput));
      }
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

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get("tab") || "general";
  // setup=1 means this is the first-time slug confirmation flow
  const isSetupMode = searchParams.get("setup") === "1";

  return (
    <AppLayout>
      <AppHeader title="Configuración" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
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
                              {editableRoles.map(r => (
                                <SelectItem key={r.value} value={r.value}>
                                  <div>
                                    <div className="font-medium">{r.label}</div>
                                    <div className="text-xs text-muted-foreground">{r.description}</div>
                                  </div>
                                </SelectItem>
                              ))}
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
                  const isOwner = member.role === "owner";
                  const isMe = member.user_id === myUserId;
                  const canEdit = isOwnerOrAdmin && !isOwner && !isMe;
                  const roleLabel = isOwner ? "Propietario" : member.role === "admin" ? "Admin" : member.role === "vendor" ? "Vendedor" : member.role === "readonly" ? "Solo lectura" : "Miembro";
                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {nameDisplay}{isMe && <span className="ml-1.5 text-xs text-muted-foreground">(tú)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      {canEdit ? (
                        <Select
                          value={member.role}
                          onValueChange={val => handleUpdateRole(member.user_id, val)}
                          disabled={updatingRoleFor === member.user_id}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            {updatingRoleFor === member.user_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <SelectValue />}
                          </SelectTrigger>
                          <SelectContent>
                            {editableRoles.map(r => (
                              <SelectItem key={r.value} value={r.value}>
                                <div>
                                  <div className="font-medium">{r.label}</div>
                                  <div className="text-xs text-muted-foreground">{r.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={isOwner ? "default" : "secondary"}>
                          {roleLabel}
                        </Badge>
                      )}
                      {canEdit && (
                        <button
                          title="Eliminar del equipo"
                          disabled={removingMember === member.user_id}
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          {removingMember === member.user_id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <UserX className="h-4 w-4" />}
                        </button>
                      )}
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
                      <Badge variant="outline" className="shrink-0">
                        {inv.role === "admin" ? "Admin" : inv.role === "vendor" ? "Vendedor" : inv.role === "readonly" ? "Solo lectura" : "Miembro"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs shrink-0">Pendiente</Badge>
                      {isOwnerOrAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Resend */}
                          <button
                            title="Reenviar invitación"
                            disabled={resendingInvite === inv.id || cancelingInvite === inv.id}
                            onClick={() => handleResendInvite(inv.id, inv.email)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          >
                            {resendingInvite === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <RotateCcw className="h-4 w-4" />}
                          </button>
                          {/* Cancel */}
                          <button
                            title="Cancelar invitación"
                            disabled={cancelingInvite === inv.id || resendingInvite === inv.id}
                            onClick={() => handleCancelInvite(inv.id, inv.email)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            {cancelingInvite === inv.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <X className="h-4 w-4" />}
                          </button>
                        </div>
                      )}
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
            {/* Setup gate banner — only shown during first-time slug confirmation */}
            {isSetupMode && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex gap-3 items-start">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Link2 className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Define la URL de tu espacio de trabajo
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Esta será la dirección única de tu empresa en el CRM. Puedes ajustarla ahora y haz clic en <strong>Guardar</strong> para continuar.
                  </p>
                </div>
              </div>
            )}

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
                        app.klosify.com/
                      </span>
                      <Input
                        value={slugInput}
                        onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="miempresa"
                        className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-sm font-mono"
                      />
                    </div>
                    <Button
                      size={isSetupMode ? "default" : "sm"}
                      onClick={handleSaveSlug}
                      disabled={slugSaving || !slugValidation.valid || (!isSetupMode && !slugChanged)}
                      className={isSetupMode ? "font-semibold" : ""}
                    >
                      {slugSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isSetupMode ? "Confirmar y entrar →" : "Guardar"}
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

            {/* Email sender card */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Remitente de emails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <p className="text-sm text-muted-foreground">
                  Nombre y dirección desde los que se envían los emails masivos.
                  Debe ser un email de un dominio verificado en Resend.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre del remitente</Label>
                    <Input
                      value={emailFromName}
                      onChange={e => setEmailFromName(e.target.value)}
                      placeholder="Ej: Cristhian de Aceleradora"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email del remitente</Label>
                    <Input
                      value={emailFromEmail}
                      onChange={e => setEmailFromEmail(e.target.value)}
                      placeholder="hola@klosify.com"
                      type="email"
                    />
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ El dominio debe estar verificado en tu cuenta de Resend. Emails desde dominios no verificados no se entregarán.
                </div>
                <Button onClick={handleSaveSender} disabled={senderSaving} size="sm">
                  {senderSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Guardar remitente
                </Button>
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

          {/* ── Campos personalizados tab ────────────────────────── */}
          <TabsContent value="campos" className="space-y-4">
            <CustomFieldsSection />
          </TabsContent>

          {/* ── API Keys tab ─────────────────────────────────────── */}
          <TabsContent value="api" className="space-y-4">
            <ApiKeysSection />
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}

// ── API Keys Section ──────────────────────────────────────────────────────────

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
};

function ApiKeysSection() {
  const { organizationId } = useOrganizationContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

  const load = async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, is_active")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      setKeys(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [organizationId]);

  // Generate a cryptographically random API key
  const generateKey = (): string => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `sk_live_${hex}`;
  };

  const sha256 = async (text: string): Promise<string> => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleCreate = async () => {
    if (!newName.trim() || !organizationId) return;
    setSaving(true);
    const rawKey = generateKey();
    const hash = await sha256(rawKey);
    const prefix = rawKey.slice(0, 20); // "sk_live_" + 12 chars

    const { error } = await supabase
      .from("api_keys")
      .insert({ organization_id: organizationId, name: newName.trim(), key_hash: hash, key_prefix: prefix });

    setSaving(false);
    if (error) { toast.error("Error al crear API Key"); return; }
    setRevealedKey(rawKey);
    setNewName("");
    load();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("api_keys").update({ is_active: active }).eq("id", id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: active } : k));
    toast.success(active ? "API Key activada" : "API Key desactivada");
  };

  const handleDelete = async (id: string) => {
    await supabase.from("api_keys").delete().eq("id", id);
    setKeys(prev => prev.filter(k => k.id !== id));
    toast.success("API Key eliminada");
  };

  const copy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="border-none shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4" /> API Keys
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Usa estas keys para enviar datos al CRM desde WordPress, Zapier, n8n, Make u otras fuentes externas.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva key
          </Button>
        </CardHeader>

        {/* Endpoint info */}
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
            <p className="text-xs font-medium">Endpoint para crear contactos</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background border rounded px-2 py-1.5 truncate">
                POST {API_BASE}/contacts
              </code>
              <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => copy(`${API_BASE}/contacts`, "URL copiada")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Header: <code className="font-mono">Authorization: Bearer sk_live_…</code>
            </p>
          </div>

          {/* Example payload */}
          <div className="rounded-lg bg-muted/50 border p-3">
            <p className="text-xs font-medium mb-1.5">Body de ejemplo (JSON)</p>
            <pre className="text-xs font-mono text-muted-foreground leading-relaxed">{`{
  "first_name": "Ana",
  "last_name": "García",
  "email": "ana@ejemplo.com",
  "phone": "+57 300 000 0000",
  "company": "Empresa S.A.",
  "source": "wordpress",
  "message": "Quiero más información"
}`}</pre>
          </div>
        </CardContent>
      </Card>

      {/* Keys list */}
      <Card className="border-none shadow-sm">
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No tienes API Keys — crea una para empezar.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${!k.is_active ? "opacity-60" : ""}`}>
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</p>
                  </div>
                  <div className="text-right shrink-0">
                    {k.last_used_at ? (
                      <p className="text-xs text-muted-foreground">
                        Último uso: {new Date(k.last_used_at).toLocaleDateString("es")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin usar</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Creada: {new Date(k.created_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={k.is_active ? "Desactivar" : "Activar"}
                      onClick={() => handleToggle(k.id, !k.is_active)}
                    >
                      <Power className={`h-3.5 w-3.5 ${k.is_active ? "text-green-600" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title="Eliminar"
                      onClick={() => handleDelete(k.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setRevealedKey(null); setNewName(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" /> Nueva API Key
            </DialogTitle>
          </DialogHeader>

          {revealedKey ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> API Key creada
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  Copia esta key ahora — no la podrás ver de nuevo.
                </p>
              </div>
              <div>
                <Label className="text-xs">Tu API Key</Label>
                <div className="flex items-center gap-1.5 mt-1">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all select-all">
                    {revealedKey}
                  </code>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => copy(revealedKey, "API Key copiada")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Cómo usarla en Zapier / n8n / Make</p>
                <p>En el nodo HTTP Request, agrega el header:</p>
                <code className="block font-mono">Authorization: Bearer {revealedKey.slice(0, 24)}…</code>
                <p className="mt-1">URL del endpoint:</p>
                <code className="block font-mono break-all">{API_BASE}/contacts</code>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)}>Listo</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs" htmlFor="key-name">Nombre de la key</Label>
                <Input
                  id="key-name"
                  className="mt-1 text-sm"
                  placeholder="Ej: WordPress sitio principal"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
                <p className="text-xs text-muted-foreground mt-1">Ponle un nombre para identificarla después.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={handleCreate} disabled={saving || !newName.trim()}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Creando…</> : "Crear API Key"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Custom Fields Section ─────────────────────────────────────────────────────

type FieldDef = {
  id: string;
  key: string;
  label: string;
  field_type: string;
  options: string[] | null;
  position: number;
};

const FIELD_TYPES = [
  { value: "text",    label: "Texto" },
  { value: "number",  label: "Número" },
  { value: "date",    label: "Fecha" },
  { value: "select",  label: "Lista de opciones" },
  { value: "boolean", label: "Sí / No" },
];

// Built-in CRM columns — confirmed against live DB on 2026-05-29
// Groups: identity | company | status | commercial | location | attribution | system
const SYSTEM_FIELDS = [
  // ── Identity ──────────────────────────────────────────────────────────────
  { key: "first_name",          label: "Nombre",                 field_type: "text",   note: "" },
  { key: "last_name",           label: "Apellido",               field_type: "text",   note: "" },
  { key: "full_name",           label: "Nombre completo",        field_type: "text",   note: "Auto-generado de nombre + apellido" },
  { key: "primary_email",       label: "Email",                  field_type: "text",   note: "" },
  { key: "primary_phone",       label: "Teléfono",               field_type: "text",   note: "" },
  { key: "birthday",            label: "Fecha de nacimiento",    field_type: "date",   note: "" },
  // ── Company ───────────────────────────────────────────────────────────────
  { key: "company_name",        label: "Empresa",                field_type: "text",   note: "Nombre de la empresa (texto libre)" },
  // ── Status & pipeline ─────────────────────────────────────────────────────
  { key: "lead_status",         label: "Estado del lead",        field_type: "select", note: "active | won | lost | disqualified" },
  { key: "status",              label: "Estado de calificación", field_type: "select", note: "new | qualified | proposal | etc." },
  { key: "lost_reason",         label: "Razón de pérdida",       field_type: "text",   note: "Cuando lead_status = lost" },
  { key: "score",               label: "Puntuación",             field_type: "number", note: "0-100, auto-calculado" },
  { key: "tags",                label: "Tags",                   field_type: "text",   note: "Array de etiquetas" },
  // ── Commercial ────────────────────────────────────────────────────────────
  { key: "source",              label: "Fuente",                 field_type: "text",   note: "wordpress | zapier | api | etc." },
  { key: "budget",              label: "Presupuesto",            field_type: "number", note: "" },
  { key: "budget_currency",     label: "Moneda",                 field_type: "text",   note: "USD, EUR, MXN…" },
  { key: "expected_close_date", label: "Fecha de cierre",        field_type: "date",   note: "" },
  { key: "notes",               label: "Notas",                  field_type: "text",   note: "" },
  // ── Location ──────────────────────────────────────────────────────────────
  { key: "city",                label: "Ciudad",                 field_type: "text",   note: "" },
  { key: "country",             label: "País",                   field_type: "text",   note: "" },
  { key: "language",            label: "Idioma",                 field_type: "text",   note: "" },
  { key: "preferred_channel",   label: "Canal preferido",        field_type: "text",   note: "" },
  // ── UTM / Attribution ─────────────────────────────────────────────────────
  { key: "utm_source",          label: "UTM Source",             field_type: "text",   note: "Fuente de tráfico (utm_source)" },
  { key: "utm_medium",          label: "UTM Medium",             field_type: "text",   note: "Medio (utm_medium)" },
  { key: "utm_campaign",        label: "UTM Campaign",           field_type: "text",   note: "Campaña UTM (utm_campaign)" },
  { key: "campaign",            label: "Campaña (texto)",        field_type: "text",   note: "Nombre libre de campaña (sin UTM)" },
];

function toKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function CustomFieldsSection() {
  const { organizationId } = useOrganizationContext();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FieldDef | null>(null);

  // Form state
  const [fLabel, setFLabel] = useState("");
  const [fType, setFType] = useState("text");
  const [fOptions, setFOptions] = useState(""); // comma-separated
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("custom_field_definitions")
        .select("id, key, label, field_type, options, position")
        .eq("organization_id", organizationId)
        .order("position", { ascending: true });
      setFields(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [organizationId]);

  const openCreate = () => {
    setEditing(null);
    setFLabel(""); setFType("text"); setFOptions("");
    setDialogOpen(true);
  };

  const openEdit = (f: FieldDef) => {
    setEditing(f);
    setFLabel(f.label);
    setFType(f.field_type);
    setFOptions((f.options || []).join(", "));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fLabel.trim() || !organizationId) return;
    setSaving(true);

    const key = editing ? editing.key : toKey(fLabel.trim());
    const options = fType === "select"
      ? fOptions.split(",").map(o => o.trim()).filter(Boolean)
      : null;

    if (editing) {
      await supabase
        .from("custom_field_definitions")
        .update({ label: fLabel.trim(), field_type: fType, options })
        .eq("id", editing.id);
      toast.success("Campo actualizado");
    } else {
      const { error } = await supabase
        .from("custom_field_definitions")
        .insert({ organization_id: organizationId, key, label: fLabel.trim(), field_type: fType, options, position: fields.length });
      if (error) {
        toast.error(error.message.includes("unique") ? "Ya existe un campo con ese nombre" : "Error al crear campo");
        setSaving(false); return;
      }
      toast.success("Campo creado");
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("custom_field_definitions").delete().eq("id", id);
    setFields(prev => prev.filter(f => f.id !== id));
    toast.success("Campo eliminado");
  };

  const typeLabel = (t: string) => FIELD_TYPES.find(x => x.value === t)?.label ?? t;

  return (
    <div className="space-y-4">

      {/* ── System fields (read-only) ── */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Campos del sistema
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Campos predeterminados del CRM. No se pueden eliminar. Copia su ID para usarlo en Zapier, n8n, Make o tu API Key.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {SYSTEM_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{f.label}</p>
                    <span className="text-xs text-muted-foreground">
                      {FIELD_TYPES.find(t => t.value === f.field_type)?.label ?? f.field_type}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                      sistema
                    </Badge>
                    {f.note && (
                      <span className="text-[10px] text-muted-foreground italic">{f.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ID:</span>
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{f.key}</code>
                    <Button
                      size="sm" variant="ghost"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      title="Copiar ID"
                      onClick={() => { navigator.clipboard.writeText(f.key); toast.success(`ID copiado: ${f.key}`); }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" title="Campo del sistema — no se puede eliminar" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Custom fields ── */}
      <Card className="border-none shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Campos personalizados</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Define campos extra que aplican a todos los contactos de tu cuenta.
              Los valores llegan automáticamente desde formularios, Zapier, n8n, etc.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo campo
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">No hay campos personalizados todavía.</p>
              <p className="text-xs text-muted-foreground">
                Crea campos como "Tipo de proyecto", "Presupuesto", "¿Cómo nos conoció?" y aparecerán en todos tus contactos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map(f => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{f.label}</p>
                      <span className="text-xs text-muted-foreground">{typeLabel(f.field_type)}</span>
                      {f.options && f.options.length > 0 && (
                        <span className="text-xs text-muted-foreground">· {f.options.join(", ")}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ID:</span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{f.key}</code>
                      <Button
                        size="sm" variant="ghost"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                        title="Copiar ID para Zapier / n8n / Make"
                        onClick={() => { navigator.clipboard.writeText(f.key); toast.success(`ID copiado: ${f.key}`); }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(f.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {editing ? "Editar campo" : "Nuevo campo personalizado"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Nombre del campo</Label>
              <Input
                className="mt-1 text-sm"
                placeholder="Ej: Tipo de proyecto"
                value={fLabel}
                onChange={e => setFLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              />
              {!editing && fLabel && (
                <p className="text-xs text-muted-foreground mt-1">
                  Clave: <code className="font-mono">{toKey(fLabel)}</code>
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={fType} onValueChange={setFType}>
                <SelectTrigger className="mt-1 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fType === "select" && (
              <div>
                <Label className="text-xs">Opciones (separadas por coma)</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder="Ej: E-commerce, Landing page, App móvil"
                  value={fOptions}
                  onChange={e => setFOptions(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !fLabel.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? "Guardar" : "Crear campo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
