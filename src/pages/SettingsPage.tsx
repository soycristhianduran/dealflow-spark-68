import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { useOrgTags, TAG_PALETTE, tagChipStyle } from "@/hooks/useOrgTags";
import { ProductsSettings } from "@/components/crm/ProductsSettings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import type { PipelineStage } from "@/types/crm";
import { useTheme } from "@/components/ThemeProvider";
import { EmailDomainsSettings } from "@/components/settings/EmailDomainsSettings";
import { EmbedFormGenerator } from "@/components/settings/EmbedFormGenerator";
import { MemberPermissionsDialog } from "@/components/settings/MemberPermissionsDialog";
import type { MemberPermissions } from "@/lib/permissions";
import { ShieldCheck } from "lucide-react";
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
  permissions?: MemberPermissions | null;
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
  { value: "vendor", label: "Vendedor", description: "Crea/edita y cierra ventas" },
  { value: "setter", label: "Setter", description: "Agenda citas (mismos permisos que vendedor)" },
  { value: "readonly", label: "Solo lectura", description: "Solo puede ver, no editar" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { organizationId, organization, defaultLeadVisibility } = useOrganizationContext();

  // Team state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const [permsDialogFor, setPermsDialogFor] = useState<OrgMember | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [cancelingInvite, setCancelingInvite] = useState<string | null>(null);
  const { isOwnerOrAdmin, isReadonly, myUserId } = usePermissions();
  const canEdit = isOwnerOrAdmin;

  // Tags — persisted org-wide catalog (shared with automations & Leads dropdowns)
  const { tags, colorOf, addTag: addOrgTag, setTagColor, renameTag: renameOrgTag, removeTag: removeOrgTag } = useOrgTags();
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState("");

  const handleRenameTag = async () => {
    if (!editingTag) return;
    const ok = await renameOrgTag(editingTag, editTagValue);
    if (ok) { toast.success(t("settingsPage.tagRenamed")); setEditingTag(null); setEditTagValue(""); }
    else toast.error(t("settingsPage.tagRenameError"));
  };

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
  const [calScope, setCalScope] = useState<"organization" | "individual">("individual");

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
          body: { action: "get_org", organization_id: organizationId },
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
        if (data?.org?.timezone) {
          setTimezone(data.org.timezone);
        }
        if (data?.org?.default_currency) {
          setCurrency(data.org.default_currency);
        }
        setCalScope(data?.org?.calendar_scope === "organization" ? "organization" : "individual");
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
    if (organizationId) loadOrgSlug();
  }, [organizationId]);

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
    if (error || data?.error) { toast.error(data?.error || t("settingsPage.saveError")); return; }
    toast.success(t("settingsPage.senderSaved"));
  };

  const fetchTeam = async () => {
    if (!organizationId) return;
    setTeamLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "list_members", organization_id: organizationId },
      });
      if (error) throw error;
      if (data?.members) setMembers(data.members);
      if (data?.invitations) setInvitations(data.invitations);
    } catch (err: any) {
      toast.error(t("settingsPage.loadTeamError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) fetchTeam();
  }, [organizationId]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error(t("settingsPage.emailRequired")); return; }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "invite", organization_id: organizationId, email: inviteEmail.trim(), role: inviteRole },
      });
      // Prefer the specific error message from the function body over the generic HTTP error
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      toast.success(t("settingsPage.invitationSent", { email: inviteEmail.trim() }));
      setInviteEmail("");
      setInviteRole("member");
      setInviteDialogOpen(false);
      fetchTeam();
    } catch (err: any) {
      toast.error(t("settingsPage.inviteError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (memberUserId: string, newRole: string) => {
    setUpdatingRoleFor(memberUserId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "update_role", organization_id: organizationId, member_user_id: memberUserId, new_role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembers(prev => prev.map(m => m.user_id === memberUserId ? { ...m, role: newRole } : m));
      toast.success(t("settingsPage.roleUpdated"));
    } catch (err: any) {
      toast.error(t("settingsPage.roleUpdateError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const handleResendInvite = async (invitationId: string, email: string) => {
    setResendingInvite(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "resend_invitation", organization_id: organizationId, invitation_id: invitationId },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      toast.success(t("settingsPage.invitationResent", { email }));
      fetchTeam(); // refresh to show updated expiry
    } catch (err: any) {
      toast.error(t("settingsPage.resendError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setResendingInvite(null);
    }
  };

  const handleCancelInvite = async (invitationId: string, email: string) => {
    setCancelingInvite(invitationId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "cancel_invitation", organization_id: organizationId, invitation_id: invitationId },
      });
      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
      toast.success(t("settingsPage.invitationCanceled", { email }));
    } catch (err: any) {
      toast.error(t("settingsPage.cancelError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setCancelingInvite(null);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    setRemovingMember(memberUserId);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "remove_member", organization_id: organizationId, member_user_id: memberUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMembers(prev => prev.filter(m => m.user_id !== memberUserId));
      toast.success(t("settingsPage.memberRemoved"));
    } catch (err: any) {
      toast.error(t("settingsPage.removeMemberError") + (err.message ?? t("settingsPage.unknownError")));
    } finally {
      setRemovingMember(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(t("settingsPage.imageFilesOnly"));
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settingsPage.fileSizeLimit"));
      return;
    }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const fileName = `logo-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("company-logos")
      .upload(fileName, file, { upsert: true });

    if (error) {
      toast.error(t("settingsPage.logoUploadError"));
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
    toast.success(t("settingsPage.logoUpdated"));
    // Dispatch event so sidebar updates in real-time
    window.dispatchEvent(new Event("logo-updated"));
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    localStorage.removeItem("crm_logo_url");
    window.dispatchEvent(new Event("logo-updated"));
    toast.success(t("settingsPage.logoRemoved"));
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    if (tags.some(x => x.toLowerCase() === tag.toLowerCase())) { toast.error(t("settingsPage.tagExists")); return; }
    const added = await addOrgTag(tag);
    if (added) { setNewTag(""); toast.success(t("settingsPage.tagAdded")); }
    else toast.error(t("settingsPage.tagAddError"));
  };

  const handleRemoveTag = async (tag: string) => {
    await removeOrgTag(tag);
    toast.success(t("settingsPage.tagRemoved"));
  };

  const handleSaveGeneral = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "save_general", organization_id: organizationId, name: orgName.trim() || undefined, timezone, default_currency: currency, calendar_scope: calScope },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(t("settingsPage.settingsSaved"));
    } catch (e: any) {
      toast.error(e.message || t("settingsPage.settingsSaveError"));
    }
  };

  const handleSaveSlug = async () => {
    if (!slugValidation.valid) return;
    setSlugSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "save_slug", organization_id: organizationId, slug: slugInput },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setOrgSlug(slugInput);
      if (isSetupMode) {
        toast.success(t("settingsPage.addressConfirmed"));
        navigate(`/w/${slugInput}`, { replace: true });
      } else {
        toast.success(t("settingsPage.addressSaved", { url: buildWorkspaceUrl(slugInput) }));
      }
    } catch (err: any) {
      toast.error(t("settingsPage.saveErrorPrefix") + (err.message ?? t("settingsPage.unknownError")));
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
    if (!stageName.trim()) { toast.error(t("settingsPage.nameRequired")); return; }
    const prob = Math.min(100, Math.max(0, parseInt(stageProbability) || 0));
    if (editingStage) {
      setStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, name: stageName, color: stageColor, probability: prob } : s));
      toast.success(t("settingsPage.stageUpdated"));
    } else {
      const newOrder = stages.length + 1;
      setStages(prev => [...prev, { id: crypto.randomUUID(), pipeline_id: "p1", name: stageName, order: newOrder, color: stageColor, probability: prob }]);
      toast.success(t("settingsPage.stageAdded"));
    }
    setStageDialogOpen(false);
  };

  const handleDeleteStage = (id: string) => {
    setStages(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
    toast.success(t("settingsPage.stageDeleted"));
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
      <AppHeader title={t("settingsPage.title")} />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {isReadonly && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
            <Eye className="h-4 w-4 shrink-0" /> {t("settingsPage.readOnlyBanner")}
          </div>
        )}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="general">{t("settingsPage.tabGeneral")}</TabsTrigger>
            <TabsTrigger value="pipeline">{t("settingsPage.tabPipeline")}</TabsTrigger>
            <TabsTrigger value="equipo">{t("settingsPage.tabTeam")}</TabsTrigger>
            <TabsTrigger value="tags">{t("settingsPage.tabTags")}</TabsTrigger>
            <TabsTrigger value="productos">{t("settingsPage.tabProducts")}</TabsTrigger>
            <TabsTrigger value="campos">{t("settingsPage.tabFields")}</TabsTrigger>
            <TabsTrigger value="email">{t("settingsPage.tabEmail")}</TabsTrigger>
            <TabsTrigger value="formulario">{t("settingsPage.tabWebForm")}</TabsTrigger>
            <TabsTrigger value="api">{t("settingsPage.tabApi")}</TabsTrigger>
          </TabsList>

          {/* Read-only members can view every tab but not edit anything. A disabled
              fieldset neutralises all inputs/buttons inside without affecting tab nav. */}
          <fieldset disabled={isReadonly} className="border-0 p-0 m-0 min-w-0">
          <TabsContent value="email" className="space-y-4">
            <EmailDomainsSettings />
          </TabsContent>

          <TabsContent value="formulario" className="space-y-4">
            <EmbedFormGenerator />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">{t("settingsPage.pipelineStages")}</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={openAddStage}>
                  <Plus className="h-4 w-4" /> {t("settingsPage.addStage")}
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
                    <span className="text-xs text-muted-foreground">{t("settingsPage.order")}: {stage.order}</span>
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
                  <DialogTitle>{editingStage ? t("settingsPage.editStage") : t("settingsPage.newStage")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>{t("settingsPage.name")}</Label>
                    <Input value={stageName} onChange={e => setStageName(e.target.value)} placeholder={t("settingsPage.stageNamePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settingsPage.probability")}</Label>
                    <Input type="number" min={0} max={100} value={stageProbability} onChange={e => setStageProbability(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settingsPage.color")}</Label>
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
                  <Button variant="outline" onClick={() => setStageDialogOpen(false)}>{t("settingsPage.cancel")}</Button>
                  <Button onClick={handleSaveStage}>{editingStage ? t("settingsPage.save") : t("settingsPage.add")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>



          <TabsContent value="equipo" className="space-y-4">
            {/* Members list */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {t("settingsPage.teamMembers")}
                  {organization && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">— {organization.name}</span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={fetchTeam} disabled={teamLoading}>
                    {teamLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("settingsPage.refresh")}
                  </Button>
                  <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    {canEdit && (
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Plus className="h-4 w-4" /> {t("settingsPage.invite")}
                      </Button>
                    </DialogTrigger>
                    )}
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("settingsPage.inviteToTeam")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>{t("settingsPage.email")}</Label>
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            placeholder={t("settingsPage.inviteEmailPlaceholder")}
                            onKeyDown={e => e.key === "Enter" && handleInvite()}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("settingsPage.role")}</Label>
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
                          <Button variant="outline">{t("settingsPage.cancel")}</Button>
                        </DialogClose>
                        <Button onClick={handleInvite} disabled={inviting}>
                          {inviting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          {t("settingsPage.sendInvitation")}
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
                    {organizationId ? t("settingsPage.noMembersFound") : t("settingsPage.noOrgAssigned")}
                  </p>
                ) : members.map(member => {
                  const nameDisplay = member.full_name || member.email;
                  const isOwner = member.role === "owner";
                  const isMe = member.user_id === myUserId;
                  const canEdit = isOwnerOrAdmin && !isOwner && !isMe;
                  const roleLabel = isOwner ? t("settingsPage.roleOwner") : member.role === "admin" ? t("settingsPage.roleAdmin") : member.role === "vendor" ? t("settingsPage.roleVendor") : member.role === "setter" ? t("settingsPage.roleSetter") : member.role === "readonly" ? t("settingsPage.roleReadonly") : t("settingsPage.roleMember");
                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {nameDisplay}{isMe && <span className="ml-1.5 text-xs text-muted-foreground">{t("settingsPage.youSuffix")}</span>}
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
                          title="Permisos"
                          onClick={() => setPermsDialogFor(member)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          title={t("settingsPage.removeFromTeam")}
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

            {/* Editor de permisos por miembro */}
            <MemberPermissionsDialog
              open={!!permsDialogFor}
              onOpenChange={(v) => { if (!v) setPermsDialogFor(null); }}
              organizationId={organizationId}
              orgDefaultLeadView={defaultLeadVisibility}
              member={permsDialogFor ? { user_id: permsDialogFor.user_id, name: permsDialogFor.full_name || permsDialogFor.email, role: permsDialogFor.role, permissions: permsDialogFor.permissions } : null}
              onSaved={(userId, permissions) => setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, permissions } : m))}
            />

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">{t("settingsPage.pendingInvitations")}</CardTitle>
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
                            {t("settingsPage.expires")}: {new Date(inv.expires_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {inv.role === "admin" ? t("settingsPage.roleAdmin") : inv.role === "vendor" ? t("settingsPage.roleVendor") : inv.role === "setter" ? t("settingsPage.roleSetter") : inv.role === "readonly" ? t("settingsPage.roleReadonly") : t("settingsPage.roleMember")}
                      </Badge>
                      <Badge variant="secondary" className="text-xs shrink-0">{t("settingsPage.pending")}</Badge>
                      {isOwnerOrAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Resend */}
                          <button
                            title={t("settingsPage.resendInvitation")}
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
                            title={t("settingsPage.cancelInvitation")}
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

          <TabsContent value="productos" className="space-y-4">
            <ProductsSettings />
          </TabsContent>

          <TabsContent value="tags" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">{t("settingsPage.tabTags")}</CardTitle>
                <div className="flex items-center gap-2">
                  <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder={t("settingsPage.newTagPlaceholder")} className="h-9 w-40 text-sm" onKeyDown={e => e.key === "Enter" && handleAddTag()} />
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAddTag}>
                    <Plus className="h-4 w-4" /> {t("settingsPage.add")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {tags.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("settingsPage.noTagsYet")}</p>
                )}
                {tags.map(tag => (
                  editingTag === tag ? (
                    <div key={tag} className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editTagValue}
                        onChange={e => setEditTagValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameTag(); if (e.key === "Escape") { setEditingTag(null); setEditTagValue(""); } }}
                        className="h-8 w-40 text-sm"
                      />
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleRenameTag}>{t("settingsPage.save")}</Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setEditingTag(null); setEditTagValue(""); }}>{t("settingsPage.cancel")}</Button>
                    </div>
                  ) : (
                    <Badge key={tag} variant="outline" className="text-sm gap-1.5 pr-1.5 border" style={tagChipStyle(colorOf(tag))}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: colorOf(tag) }} title={t("settingsPage.changeColor")} />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="grid grid-cols-5 gap-1.5">
                            {TAG_PALETTE.map(c => (
                              <button
                                key={c}
                                className="h-5 w-5 rounded-full ring-1 ring-black/10 hover:scale-110 transition-transform"
                                style={{ backgroundColor: c }}
                                onClick={() => setTagColor(tag, c)}
                                title={c}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {tag}
                      <button onClick={() => { setEditingTag(tag); setEditTagValue(tag); }} className="ml-0.5 rounded-full hover:bg-black/10 p-0.5" title={t("settingsPage.rename")}>
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleRemoveTag(tag)} className="rounded-full hover:bg-black/10 p-0.5" title={t("settingsPage.delete")}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )
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
                    {t("settingsPage.setupBannerTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("settingsPage.setupBannerDesc")}
                  </p>
                </div>
              </div>
            )}

            {/* Workspace URL Card */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  {t("settingsPage.workspaceAddress")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <p className="text-sm text-muted-foreground">
                  {t("settingsPage.workspaceAddressDesc")}
                </p>
                <div className="space-y-2">
                  <Label>{t("settingsPage.address")}</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center rounded-md border bg-muted/40 overflow-hidden">
                      <span className="px-3 py-2 text-sm text-muted-foreground border-r bg-muted whitespace-nowrap">
                        app.klosify.com/
                      </span>
                      <Input
                        value={slugInput}
                        onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder={t("settingsPage.slugPlaceholder")}
                        className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-sm font-mono"
                      />
                    </div>
                    <Button
                      size={isSetupMode ? "default" : "sm"}
                      onClick={handleSaveSlug}
                      disabled={slugSaving || !slugValidation.valid || (!isSetupMode && !slugChanged)}
                      className={isSetupMode ? "font-semibold" : ""}
                    >
                      {slugSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isSetupMode ? t("settingsPage.confirmAndEnter") : t("settingsPage.save")}
                    </Button>
                  </div>

                  {/* Validation feedback */}
                  {slugInput.length > 0 && (
                    <div className={`flex items-center gap-1.5 text-xs ${slugValidation.valid ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {slugValidation.valid
                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> {t("settingsPage.yourUrl")}: <span className="font-mono">{buildWorkspaceUrl(slugInput)}</span></>
                        : <><AlertCircle className="h-3.5 w-3.5" /> {slugValidation.error}</>
                      }
                    </div>
                  )}
                </div>

                {/* Current workspace URL */}
                {orgSlug && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">{t("settingsPage.currentUrl")}</p>
                    <a
                      href={buildWorkspaceUrl(orgSlug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline font-mono break-all"
                    >
                      {buildWorkspaceUrl(orgSlug)}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {t("settingsPage.shareLinkWithTeam")}
                    </p>
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Logo Card */}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("settingsPage.companyLogo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt={t("settingsPage.logoAlt")} className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("settingsPage.logoUploadHint")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>{t("settingsPage.recommendedSize")}:</strong> {t("settingsPage.logoSizeHint")}
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
                        {uploadingLogo ? t("settingsPage.uploading") : t("settingsPage.uploadLogo")}
                      </Button>
                      {logoUrl && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo}>
                          {t("settingsPage.delete")}
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
                <CardTitle className="text-sm font-semibold">{t("settingsPage.emailSender")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <p className="text-sm text-muted-foreground">
                  {t("settingsPage.emailSenderDesc")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t("settingsPage.senderName")}</Label>
                    <Input
                      value={emailFromName}
                      onChange={e => setEmailFromName(e.target.value)}
                      placeholder={t("settingsPage.senderNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("settingsPage.senderEmail")}</Label>
                    <Input
                      value={emailFromEmail}
                      onChange={e => setEmailFromEmail(e.target.value)}
                      placeholder="hola@klosify.com"
                      type="email"
                    />
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  {t("settingsPage.resendDomainWarning")}
                </div>
                <Button onClick={handleSaveSender} disabled={senderSaving} size="sm">
                  {senderSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  {t("settingsPage.saveSender")}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">{t("settingsPage.generalSettings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>{t("settingsPage.organizationName")}</Label>
                  <Input value={orgName} onChange={e => setOrgName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("settingsPage.defaultCurrency")}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("settingsPage.timezone")}</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timezones.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("settingsPage.appearance")}</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="h-4 w-4" /> {t("settingsPage.themeLight")}
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="h-4 w-4" /> {t("settingsPage.themeDark")}
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      size="sm"
                      className="gap-2"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="h-4 w-4" /> {t("settingsPage.themeSystem")}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Calendario del equipo</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      { v: "organization", title: "Global (organización)", desc: "Todo el equipo comparte y ve el mismo calendario. Todos ven todas las citas de la organización." },
                      { v: "individual", title: "Individual (por usuario)", desc: "Cada usuario ve solo sus propias citas y conecta su propio Google Calendar. Los administradores siempre ven todo." },
                    ] as const).map(opt => {
                      const active = calScope === opt.v;
                      return (
                        <button key={opt.v} type="button" onClick={() => setCalScope(opt.v)}
                          className={`text-left rounded-lg border p-3 transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-muted-foreground/40"}`}>
                          <div className="flex items-center gap-2">
                            <span className={`h-3.5 w-3.5 rounded-full border-2 ${active ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                            <span className="text-sm font-medium">{opt.title}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{opt.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={handleSaveGeneral}>{t("settingsPage.saveChanges")}</Button>
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
          </fieldset>
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
  const { t } = useTranslation();
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
    if (error) { toast.error(t("settingsPage.apiKeyCreateError")); return; }
    setRevealedKey(rawKey);
    setNewName("");
    load();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("api_keys").update({ is_active: active }).eq("id", id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: active } : k));
    toast.success(active ? t("settingsPage.apiKeyActivated") : t("settingsPage.apiKeyDeactivated"));
  };

  const handleDelete = async (id: string) => {
    await supabase.from("api_keys").delete().eq("id", id);
    setKeys(prev => prev.filter(k => k.id !== id));
    toast.success(t("settingsPage.apiKeyDeleted"));
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
              {t("settingsPage.apiKeysDesc")}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("settingsPage.newKey")}
          </Button>
        </CardHeader>

        {/* Endpoint info */}
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-muted/50 border p-3 space-y-2">
            <p className="text-xs font-medium">{t("settingsPage.endpointCreateContacts")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background border rounded px-2 py-1.5 truncate">
                POST {API_BASE}/contacts
              </code>
              <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => copy(`${API_BASE}/contacts`, t("settingsPage.urlCopied"))}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Header: <code className="font-mono">Authorization: Bearer sk_live_…</code>
            </p>
          </div>

          {/* Example payload */}
          <div className="rounded-lg bg-muted/50 border p-3">
            <p className="text-xs font-medium mb-1.5">{t("settingsPage.exampleBody")}</p>
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
              {t("settingsPage.noApiKeys")}
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
                        {t("settingsPage.lastUsed")}: {new Date(k.last_used_at).toLocaleDateString("es")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("settingsPage.neverUsed")}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("settingsPage.created")}: {new Date(k.created_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={k.is_active ? t("settingsPage.deactivate") : t("settingsPage.activate")}
                      onClick={() => handleToggle(k.id, !k.is_active)}
                    >
                      <Power className={`h-3.5 w-3.5 ${k.is_active ? "text-green-600" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      title={t("settingsPage.delete")}
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
              <Key className="h-4 w-4" /> {t("settingsPage.newApiKey")}
            </DialogTitle>
          </DialogHeader>

          {revealedKey ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> {t("settingsPage.apiKeyCreated")}
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  {t("settingsPage.copyKeyNow")}
                </p>
              </div>
              <div>
                <Label className="text-xs">{t("settingsPage.yourApiKey")}</Label>
                <div className="flex items-center gap-1.5 mt-1">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-2 py-1.5 break-all select-all">
                    {revealedKey}
                  </code>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => copy(revealedKey, t("settingsPage.apiKeyCopied"))}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t("settingsPage.howToUseTitle")}</p>
                <p>{t("settingsPage.addHeaderHint")}</p>
                <code className="block font-mono">Authorization: Bearer {revealedKey.slice(0, 24)}…</code>
                <p className="mt-1">{t("settingsPage.endpointUrl")}</p>
                <code className="block font-mono break-all">{API_BASE}/contacts</code>
              </div>
              <Button className="w-full" onClick={() => setDialogOpen(false)}>{t("settingsPage.done")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs" htmlFor="key-name">{t("settingsPage.keyName")}</Label>
                <Input
                  id="key-name"
                  className="mt-1 text-sm"
                  placeholder={t("settingsPage.keyNamePlaceholder")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("settingsPage.keyNameHint")}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>{t("settingsPage.cancel")}</Button>
                <Button className="flex-1" onClick={handleCreate} disabled={saving || !newName.trim()}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />{t("settingsPage.creating")}</> : t("settingsPage.createApiKey")}
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
  const { t } = useTranslation();
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
      toast.success(t("settingsPage.fieldUpdated"));
    } else {
      const { error } = await supabase
        .from("custom_field_definitions")
        .insert({ organization_id: organizationId, key, label: fLabel.trim(), field_type: fType, options, position: fields.length });
      if (error) {
        toast.error(error.message.includes("unique") ? t("settingsPage.fieldNameExists") : t("settingsPage.fieldCreateError"));
        setSaving(false); return;
      }
      toast.success(t("settingsPage.fieldCreated"));
    }

    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("custom_field_definitions").delete().eq("id", id);
    setFields(prev => prev.filter(f => f.id !== id));
    toast.success(t("settingsPage.fieldDeleted"));
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
              {t("settingsPage.systemFields")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("settingsPage.systemFieldsDesc")}
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
                      {t("settingsPage.systemBadge")}
                    </Badge>
                    {f.note && (
                      <span className="text-[10px] text-muted-foreground italic">{f.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("settingsPage.idLabel")}</span>
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{f.key}</code>
                    <Button
                      size="sm" variant="ghost"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      title={t("settingsPage.copyId")}
                      onClick={() => { navigator.clipboard.writeText(f.key); toast.success(t("settingsPage.idCopied", { id: f.key })); }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" title={t("settingsPage.systemFieldLockTitle")} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Custom fields ── */}
      <Card className="border-none shadow-sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">{t("settingsPage.customFields")}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {t("settingsPage.customFieldsDesc")}
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("settingsPage.newField")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">{t("settingsPage.noCustomFields")}</p>
              <p className="text-xs text-muted-foreground">
                {t("settingsPage.noCustomFieldsHint")}
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
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("settingsPage.idLabel")}</span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{f.key}</code>
                      <Button
                        size="sm" variant="ghost"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                        title={t("settingsPage.copyIdIntegrations")}
                        onClick={() => { navigator.clipboard.writeText(f.key); toast.success(t("settingsPage.idCopied", { id: f.key })); }}
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
              {editing ? t("settingsPage.editField") : t("settingsPage.newCustomField")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">{t("settingsPage.fieldName")}</Label>
              <Input
                className="mt-1 text-sm"
                placeholder={t("settingsPage.fieldNamePlaceholder")}
                value={fLabel}
                onChange={e => setFLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              />
              {!editing && fLabel && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("settingsPage.key")}: <code className="font-mono">{toKey(fLabel)}</code>
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">{t("settingsPage.type")}</Label>
              <Select value={fType} onValueChange={setFType}>
                <SelectTrigger className="mt-1 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fType === "select" && (
              <div>
                <Label className="text-xs">{t("settingsPage.optionsLabel")}</Label>
                <Input
                  className="mt-1 text-sm"
                  placeholder={t("settingsPage.optionsPlaceholder")}
                  value={fOptions}
                  onChange={e => setFOptions(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>{t("settingsPage.cancel")}</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !fLabel.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? t("settingsPage.save") : t("settingsPage.createField")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
