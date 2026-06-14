/**
 * OnboardingPage — mandatory first-time setup for new users (especially Google OAuth).
 *
 * This is a full page (not a modal) so there are zero z-index / render-timing issues.
 *
 * Route: /onboarding
 * Redirect from: WorkspaceEntryPage when slug_confirmed=false AND company_name missing.
 *
 * Flow:
 *  Step 1 — Personal + company info
 *  Step 2 — Niche / pipeline selector  →  creates auto-pipeline for the org
 *  Step 3 — Navigate to settings?setup=1 to confirm workspace URL
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toSlug } from "@/lib/subdomain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CountryPhoneInput, getDialCode, detectCountryByTimezone } from "@/components/auth/CountryPhoneInput";
import { Zap, Loader2, CheckCircle2, Building2, Heart, GraduationCap, Laptop, Megaphone, HardHat, ShoppingBag, Shield, LayoutGrid, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const industries = [
  "Tecnología", "Finanzas y Banca", "Salud", "Educación", "Retail / Comercio",
  "Manufactura", "Construcción", "Inmobiliaria", "Alimentos y Bebidas",
  "Marketing y Publicidad", "Consultoría", "Legal", "Transporte y Logística",
  "Energía", "Telecomunicaciones", "Agricultura", "Turismo y Hotelería",
  "Seguros", "Automotriz", "Entretenimiento", "Otro",
];

const companySizes = [
  { value: "1-10",     label: "1 – 10 empleados" },
  { value: "11-50",    label: "11 – 50 empleados" },
  { value: "51-200",   label: "51 – 200 empleados" },
  { value: "201-500",  label: "201 – 500 empleados" },
  { value: "501-1000", label: "501 – 1,000 empleados" },
  { value: "1001+",    label: "Más de 1,000 empleados" },
];

const jobTitles = [
  "CEO / Director General", "Director Comercial", "Gerente de Ventas",
  "Ejecutivo de Ventas", "Director de Marketing", "Gerente de Marketing",
  "Director de Operaciones", "Gerente de Proyecto", "Fundador / Co-fundador",
  "Consultor", "Freelancer", "Otro",
];

// ── Niche cards for step 2 ────────────────────────────────────────────────────
interface NicheOption {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  stages: string[];
  color: string;
}

const NICHE_OPTIONS: NicheOption[] = [
  {
    key: "inmobiliaria",
    label: "Inmobiliaria",
    description: "Compra, venta y arriendo de propiedades",
    icon: Building2,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    stages: ["Prospecto", "Visita agendada", "Visita realizada", "Oferta", "Negociación", "Cierre"],
  },
  {
    key: "seguros",
    label: "Seguros",
    description: "Venta y renovación de pólizas",
    icon: Shield,
    color: "bg-green-500/10 text-green-600 border-green-200",
    stages: ["Lead", "Contactado", "Cotización", "Propuesta", "Suscripción", "Póliza activa"],
  },
  {
    key: "agencia",
    label: "Agencia / Marketing",
    description: "Servicios de publicidad y comunicación",
    icon: Megaphone,
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
    stages: ["Lead", "Discovery", "Propuesta", "Contrato", "Onboarding"],
  },
  {
    key: "salud",
    label: "Salud / Clínica",
    description: "Consultas, tratamientos y seguimiento",
    icon: Stethoscope,
    color: "bg-red-500/10 text-red-600 border-red-200",
    stages: ["Consulta", "Cita agendada", "Evaluación", "Tratamiento", "Alta"],
  },
  {
    key: "tecnologia",
    label: "Tecnología / SaaS",
    description: "Software, apps y servicios digitales",
    icon: Laptop,
    color: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
    stages: ["MQL", "SQL", "Demo", "Trial", "Propuesta", "Cliente"],
  },
  {
    key: "consultoria",
    label: "Consultoría",
    description: "Asesoría profesional y proyectos",
    icon: Heart,
    color: "bg-orange-500/10 text-orange-600 border-orange-200",
    stages: ["Prospecto", "Diagnóstico", "Propuesta", "Contrato", "Proyecto activo"],
  },
  {
    key: "educacion",
    label: "Educación",
    description: "Colegios, academias y cursos",
    icon: GraduationCap,
    color: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    stages: ["Interesado", "Info enviada", "Visita", "Inscripción", "Matrícula"],
  },
  {
    key: "construccion",
    label: "Construcción",
    description: "Obras, reformas y proyectos civiles",
    icon: HardHat,
    color: "bg-stone-500/10 text-stone-600 border-stone-200",
    stages: ["Solicitud", "Visita técnica", "Presupuesto", "Aprobación", "En obra", "Entrega"],
  },
  {
    key: "ecommerce",
    label: "Retail / E-commerce",
    description: "Venta de productos físicos o digitales",
    icon: ShoppingBag,
    color: "bg-pink-500/10 text-pink-600 border-pink-200",
    stages: ["Interesado", "Cotización", "Demo", "Pedido", "Compra"],
  },
  {
    key: "general",
    label: "Otro / General",
    description: "Pipeline de ventas estándar",
    icon: LayoutGrid,
    color: "bg-slate-500/10 text-slate-600 border-slate-200",
    stages: ["Lead", "Contactado", "Calificado", "Propuesta", "Negociación", "Ganado"],
  },
];

export default function OnboardingPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  // Step 1 form state — pre-filled from Google profile if available
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone]             = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [industry, setIndustry]       = useState("");
  const [companySize, setCompanySize] = useState("");
  const [jobTitle, setJobTitle]       = useState("");

  // Step 2 state
  const [selectedNiche, setSelectedNiche] = useState<string>("");
  const [workspaceSlug, setWorkspaceSlug] = useState<string>("_");
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    setCountryCode(detectCountryByTimezone());
  }, []);

  // Pre-fill from existing session metadata
  useEffect(() => {
    if (!session) return;
    const meta = session.user.user_metadata ?? {};

    if (meta.company_name) {
      navigate("/", { replace: true });
      return;
    }

    if (meta.given_name)  setFirstName(meta.given_name);
    else if (meta.name) {
      const parts = (meta.name as string).split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" ") ?? "");
    }
    if (meta.family_name) setLastName(meta.family_name);
  }, [session, navigate]);

  // Skip onboarding for users who JOINED an org via invitation (vendors/members).
  // Onboarding is only for owners setting up a brand-new workspace.
  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", session.user.id);
      if (!active || !memberships?.length) return;
      // If they belong to any org where they are NOT the owner, they were invited.
      const invited = memberships.some((m: any) => m.role && m.role !== "owner");
      if (invited) navigate("/", { replace: true });
    })();
    return () => { active = false; };
  }, [session, navigate]);

  // Auto-select niche from industry if user filled it in step 1
  useEffect(() => {
    if (!industry || selectedNiche) return;
    const map: Record<string, string> = {
      "Inmobiliaria": "inmobiliaria",
      "Seguros": "seguros",
      "Marketing y Publicidad": "agencia",
      "Salud": "salud",
      "Tecnología": "tecnologia",
      "Consultoría": "consultoria",
      "Legal": "consultoria",
      "Educación": "educacion",
      "Construcción": "construccion",
      "Retail / Comercio": "ecommerce",
    };
    if (map[industry]) setSelectedNiche(map[industry]);
  }, [industry, selectedNiche]);

  useEffect(() => {
    if (!authLoading && !session) {
      navigate("/auth", { replace: true });
    }
  }, [authLoading, session, navigate]);

  if (authLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Step 1: save profile + setup org ───────────────────────────────────────
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("El nombre de la empresa es requerido");
      return;
    }
    setLoading(true);

    const finalCompanyName = companyName.trim();
    const fullPhone = phone
      ? `${getDialCode(countryCode)}${phone.replace(/\s/g, "")}`
      : "";

    // Save profile (company_name = onboarding complete signal)
    const { error: updateErr } = await supabase.auth.updateUser({
      data: {
        first_name:   firstName.trim(),
        last_name:    lastName.trim(),
        full_name:    `${firstName.trim()} ${lastName.trim()}`,
        phone:        fullPhone,
        industry,
        company_size: companySize,
        job_title:    jobTitle,
        company_name: finalCompanyName,
      },
    });

    if (updateErr) {
      toast.error("Error al guardar perfil: " + updateErr.message);
      setLoading(false);
      return;
    }

    // Rename + re-slug the auto-created workspace
    let slug = "_";
    let resolvedOrgId: string | null = null;
    try {
      let baseSlug = toSlug(finalCompanyName);
      if (baseSlug.length < 3) baseSlug = baseSlug.padEnd(3, "0");

      const { data: setupData, error: setupErr } = await supabase.functions.invoke(
        "org-invitations",
        { body: { action: "setup_org", name: finalCompanyName, slug: baseSlug } },
      );
      if (!setupErr && setupData?.slug) {
        slug = setupData.slug;
        resolvedOrgId = setupData.organization_id ?? null;
      }
    } catch {
      // Non-fatal
    }

    // Fallback: fetch org_id from membership
    if (!resolvedOrgId) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();
      resolvedOrgId = membership?.organization_id ?? null;
    }

    setWorkspaceSlug(slug);
    setOrgId(resolvedOrgId);
    setLoading(false);
    setStep(2);
  };

  // ── Step 2: create pipeline + navigate ─────────────────────────────────────
  const handleStep2 = async () => {
    setLoading(true);
    const niche = selectedNiche || "general";

    if (orgId) {
      try {
        const { data, error } = await supabase.functions.invoke("create-niche-pipeline", {
          body: { niche, industry, organization_id: orgId },
        });
        if (error) console.warn("Pipeline creation error:", error.message);
        if (data?.error) console.warn("Pipeline creation error:", data.error);
        if (data?.success) {
          toast.success(`Pipeline "${data.pipeline_name}" creado con ${data.stages?.length} etapas 🎉`);
        }
      } catch (e) {
        console.warn("Pipeline creation failed (non-fatal):", e);
      }
    }

    navigate(`/w/${workspaceSlug}/settings?setup=1`, { replace: true });
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 pt-8">
      <div className={cn("w-full", step === 1 ? "max-w-md" : "max-w-3xl")}>
        {/* Header */}
        <div className="flex flex-col items-center pb-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary mb-4">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          {step === 1 ? (
            <>
              <h1 className="text-2xl font-bold">¡Bienvenido a Klosify!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Solo tarda 30 segundos — cuéntanos sobre tu empresa
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">¿Cuál es tu nicho de negocio?</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Crearemos tu pipeline de ventas con etapas personalizadas para ti
              </p>
            </>
          )}
          {/* Step dots */}
          <div className="flex gap-2 mt-4">
            <div className={cn("h-2 w-8 rounded-full transition-colors", step === 1 ? "bg-primary" : "bg-primary/30")} />
            <div className={cn("h-2 w-8 rounded-full transition-colors", step === 2 ? "bg-primary" : "bg-muted")} />
          </div>
        </div>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4 bg-card border rounded-2xl p-6 shadow-lg">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Juan"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido <span className="text-destructive">*</span></Label>
                <Input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Pérez"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nombre de la empresa <span className="text-destructive">*</span></Label>
              <Input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Ej: Acme Corp"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <CountryPhoneInput
                value={phone}
                onChange={setPhone}
                countryCode={countryCode}
                onCountryChange={setCountryCode}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Industria</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue placeholder="Selecciona tu industria" /></SelectTrigger>
                <SelectContent>
                  {industries.map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tamaño de empresa</Label>
              <Select value={companySize} onValueChange={setCompanySize}>
                <SelectTrigger><SelectValue placeholder="Número de empleados" /></SelectTrigger>
                <SelectContent>
                  {companySizes.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Rol / Cargo</Label>
              <Select value={jobTitle} onValueChange={setJobTitle}>
                <SelectTrigger><SelectValue placeholder="Selecciona tu cargo" /></SelectTrigger>
                <SelectContent>
                  {jobTitles.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando...</>
                : "Continuar →"}
            </Button>
          </form>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Niche grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {NICHE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = selectedNiche === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedNiche(opt.key)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:shadow-md cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    {isSelected && (
                      <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />
                    )}
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", opt.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold leading-tight">{opt.label}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{opt.description}</span>
                  </button>
                );
              })}
            </div>

            {/* Stage preview */}
            {selectedNiche && (() => {
              const opt = NICHE_OPTIONS.find(o => o.key === selectedNiche);
              if (!opt) return null;
              return (
                <div className="bg-card border rounded-xl p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                    Tu pipeline tendrá estas etapas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {opt.stages.map((stage, idx) => (
                      <div key={stage} className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium bg-background">
                          {stage}
                        </span>
                        {idx < opt.stages.length - 1 && (
                          <span className="text-muted-foreground text-xs">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex-shrink-0"
              >
                ← Atrás
              </Button>
              <Button
                className="flex-1"
                onClick={handleStep2}
                disabled={loading || !selectedNiche}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creando tu pipeline...</>
                  : selectedNiche
                    ? `Crear pipeline de ${NICHE_OPTIONS.find(o => o.key === selectedNiche)?.label} →`
                    : "Selecciona un nicho para continuar"
                }
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Puedes editar o agregar más etapas después desde Configuración → Pipeline
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
