import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, GripVertical, Trash2, X, Pencil, ArrowUp, ArrowDown, Sun, Moon, Monitor, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { PipelineStage } from "@/types/crm";
import { useTheme } from "@/components/ThemeProvider";

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
  const { theme, setTheme } = useTheme();
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata;
      if (meta?.company_name && !orgName) {
        setOrgName(meta.company_name);
      }
    });
  }, []);

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
            <TabsTrigger value="users">Usuarios</TabsTrigger>
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
