import { useState } from "react";
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
import { Plus, GripVertical, Trash2, X, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import type { PipelineStage } from "@/types/crm";

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

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
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
  // Users state
  const [users, setUsers] = useState<TeamUser[]>([
    { id: "1", name: "Juan Demo", email: "juan@demo.com", role: "admin", initials: "JD" },
  ]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("sales_rep");

  // Tags state
  const [tags, setTags] = useState(["vip", "real-estate", "healthcare", "education", "enterprise", "new", "hot-lead"]);
  const [newTag, setNewTag] = useState("");

  // General state
  const [orgName, setOrgName] = useState("Mi Empresa");
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("America/Mexico_City");

  const handleAddUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      toast.error("Nombre y email son requeridos");
      return;
    }
    const initials = newUserName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    setUsers(prev => [...prev, { id: crypto.randomUUID(), name: newUserName, email: newUserEmail, role: newUserRole, initials }]);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRole("sales_rep");
    toast.success("Usuario agregado");
  };

  const handleRemoveUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success("Usuario eliminado");
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

  return (
    <AppLayout>
      <AppHeader title="Configuración" />
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <Tabs defaultValue="pipeline">
          <TabsList className="mb-6">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Etapas del Pipeline</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Agregar etapa
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {defaultStages.map((stage) => (
                  <div key={stage.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="flex-1 text-sm font-medium text-foreground">{stage.name}</span>
                    <Badge variant="outline" className="text-xs">{stage.probability}%</Badge>
                    <span className="text-xs text-muted-foreground">Orden: {stage.order}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Equipo</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Invitar usuario
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invitar usuario</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Nombre completo</Label>
                        <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Ej: María López" />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="maria@empresa.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Rol</Label>
                        <Select value={newUserRole} onValueChange={setNewUserRole}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {roles.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button onClick={handleAddUser}>Agregar</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {users.map(user => (
                  <div key={user.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">{user.initials}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge>{user.role}</Badge>
                    {users.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveUser(user.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
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
                <Button onClick={handleSaveGeneral}>Guardar cambios</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}
