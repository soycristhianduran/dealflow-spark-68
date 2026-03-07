import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { CountryPhoneInput, getDialCode, detectCountryByTimezone } from "@/components/auth/CountryPhoneInput";

const industries = [
  "Tecnología", "Finanzas y Banca", "Salud", "Educación", "Retail / Comercio",
  "Manufactura", "Construcción", "Inmobiliaria", "Alimentos y Bebidas",
  "Marketing y Publicidad", "Consultoría", "Legal", "Transporte y Logística",
  "Energía", "Telecomunicaciones", "Agricultura", "Turismo y Hotelería",
  "Seguros", "Automotriz", "Entretenimiento", "Otro",
];

const companySizes = [
  { value: "1-10", label: "1 – 10 empleados" },
  { value: "11-50", label: "11 – 50 empleados" },
  { value: "51-200", label: "51 – 200 empleados" },
  { value: "201-500", label: "201 – 500 empleados" },
  { value: "501-1000", label: "501 – 1,000 empleados" },
  { value: "1001+", label: "Más de 1,000 empleados" },
];

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("MX");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    setCountryCode(detectCountryByTimezone());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    setLoading(true);
    const fullPhone = phone ? `${getDialCode(countryCode)}${phone.replace(/\s/g, "")}` : "";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          phone: fullPhone,
          industry,
          company_size: companySize,
          job_title: jobTitle,
        },
      },
    });
    if (error) toast.error(error.message);
    else toast.success("Cuenta creada exitosamente");
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Velocity CRM</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Gestión comercial inteligente</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Ingresando..." : "Iniciar sesión"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre *</Label>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Apellido *</Label>
                    <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Pérez" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <CountryPhoneInput
                    value={phone}
                    onChange={setPhone}
                    countryCode={countryCode}
                    onCountryChange={setCountryCode}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Industria</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tu industria" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map(i => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tamaño de empresa</Label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger>
                      <SelectValue placeholder="Número de empleados" />
                    </SelectTrigger>
                    <SelectContent>
                      {companySizes.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contraseña *</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creando cuenta..." : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
