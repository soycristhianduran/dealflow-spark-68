/**
 * OnboardingModal — mandatory first-time setup for Google OAuth users.
 *
 * Shows as a full-screen modal overlay whenever an authenticated Google user
 * has not yet set their company_name (the signal that onboarding is complete).
 * Cannot be dismissed — the user must fill the form to proceed.
 *
 * After submission:
 *   1. Saves profile fields to user_metadata via updateUser
 *   2. Renames + re-slugs the auto-created workspace via the org-invitations
 *      edge function (service role bypasses RLS)
 *   3. Navigates to /w/{slug}/settings?setup=1 so the user can confirm
 *      their workspace URL before entering the full app
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
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

export function OnboardingModal() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone]             = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [industry, setIndustry]       = useState("");
  const [companySize, setCompanySize] = useState("");
  const [jobTitle, setJobTitle]       = useState("");

  useEffect(() => {
    setCountryCode(detectCountryByTimezone());
  }, []);

  useEffect(() => {
    if (!session) { setVisible(false); return; }

    const providers = session.user.app_metadata?.providers as string[] | undefined;
    const isGoogle =
      session.user.app_metadata?.provider === "google" ||
      providers?.includes("google") === true;
    const hasCompanyName = !!session.user.user_metadata?.company_name;

    if (isGoogle && !hasCompanyName) {
      // Pre-fill name from Google account
      const given  = session.user.user_metadata?.given_name  || "";
      const family = session.user.user_metadata?.family_name || "";
      if (given)  setFirstName(given);
      if (family) setLastName(family);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [session]);

  if (!visible) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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

    // 1. Save all profile fields to user_metadata.
    //    Setting company_name here is the "onboarding complete" signal —
    //    once this is set the modal will not show again.
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

    // 2. Rename + re-slug the auto-created workspace via the edge function
    //    (service role so it bypasses RLS on organizations).
    let workspaceSlug = "_";
    try {
      let baseSlug = toSlug(finalCompanyName);
      if (baseSlug.length < 3) baseSlug = baseSlug.padEnd(3, "0");

      const { data: setupData, error: setupErr } = await supabase.functions.invoke(
        "org-invitations",
        { body: { action: "setup_org", name: finalCompanyName, slug: baseSlug } },
      );
      if (!setupErr && setupData?.slug) {
        workspaceSlug = setupData.slug;
      }
    } catch {
      // Non-fatal: profile was saved; slug setup is best-effort
    }

    toast.success("¡Perfecto! Ahora confirma la URL de tu workspace.");

    // 3. Navigate to General settings with ?setup=1 so the user reviews
    //    and confirms their workspace URL before accessing the full app.
    navigate(`/w/${workspaceSlug}/settings?setup=1`, { replace: true });
    setLoading(false);
    // visible will go to false once session updates with the new company_name
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col items-center pt-6 pb-4 px-6 text-center border-b shrink-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary mb-3">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold">¡Bienvenido a Klosify!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Solo tarda 30 segundos — cuéntanos sobre tu empresa
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
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
      </div>
    </div>
  );
}
