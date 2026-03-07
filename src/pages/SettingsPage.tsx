import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { defaultStages } from "@/data/mock-data";
import { Plus, GripVertical } from "lucide-react";

export default function SettingsPage() {
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
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Invitar usuario
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">JD</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Juan Demo</p>
                    <p className="text-xs text-muted-foreground">juan@demo.com</p>
                  </div>
                  <Badge>Admin</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tags" className="space-y-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Tags</CardTitle>
                <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-4 w-4" /> Nuevo tag</Button>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {['vip', 'real-estate', 'healthcare', 'education', 'enterprise', 'new', 'hot-lead'].map(tag => (
                  <Badge key={tag} variant="secondary" className="text-sm">{tag}</Badge>
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
                  <Input defaultValue="Mi Empresa" />
                </div>
                <div className="space-y-2">
                  <Label>Moneda por defecto</Label>
                  <Input defaultValue="USD" />
                </div>
                <div className="space-y-2">
                  <Label>Zona horaria</Label>
                  <Input defaultValue="America/Mexico_City" />
                </div>
                <Button>Guardar cambios</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}
