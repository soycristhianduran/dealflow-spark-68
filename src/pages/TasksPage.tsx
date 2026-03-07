import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockTasks } from "@/data/mock-data";
import { Plus, Search, Phone, MessageCircle, Mail, Calendar, ArrowRight, CreditCard, FileText, CheckCircle2, Circle, Clock } from "lucide-react";
import { useState } from "react";

const typeIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  follow_up: <ArrowRight className="h-3.5 w-3.5" />,
  payment: <CreditCard className="h-3.5 w-3.5" />,
  proposal: <FileText className="h-3.5 w-3.5" />,
};

const priorityClasses: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-primary" />,
  completed: <CheckCircle2 className="h-4 w-4 text-success" />,
  cancelled: <Circle className="h-4 w-4 text-destructive" />,
};

export default function TasksPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const today = '2026-03-07';
  const filtered = mockTasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'today') return t.due_date === today && t.status !== 'completed';
    if (tab === 'overdue') return t.due_date < today && t.status === 'pending';
    if (tab === 'completed') return t.status === 'completed';
    return true;
  });

  return (
    <AppLayout>
      <AppHeader title="Tareas" subtitle={`${mockTasks.filter(t => t.status === 'pending').length} pendientes`} actions={
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nueva tarea</Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="today">Hoy</TabsTrigger>
              <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
              <TabsTrigger value="completed">Completadas</TabsTrigger>
            </TabsList>
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar tareas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
          </div>

          <TabsContent value={tab} className="mt-4 space-y-2">
            {filtered.map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow">
                <button className="shrink-0">{statusIcons[task.status]}</button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{task.due_date} {task.due_time && `· ${task.due_time}`}</span>
                    {task.contact && <span className="text-xs text-muted-foreground">· {task.contact.full_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="gap-1 text-xs">
                    {typeIcons[task.task_type]}
                    {task.task_type}
                  </Badge>
                  <Badge className={`text-xs ${priorityClasses[task.priority]}`}>
                    {task.priority}
                  </Badge>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">No hay tareas en esta vista</div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}
