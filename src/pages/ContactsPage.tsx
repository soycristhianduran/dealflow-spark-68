import { AppLayout } from "@/components/layout/AppLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Search, Trash2, Tag } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { CreateContactDialog } from "@/components/crm/CreateContactDialog";
import { toast } from "sonner";
import type { ContactStatus } from "@/types/crm";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { label: "Nuevo", variant: "default" },
  contacted: { label: "Contactado", variant: "secondary" },
  qualified: { label: "Calificado", variant: "outline" },
  client: { label: "Cliente", variant: "default" },
  lost: { label: "Perdido", variant: "destructive" },
};

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'Nuevos' },
  { value: 'contacted', label: 'Contactados' },
  { value: 'qualified', label: 'Calificados' },
  { value: 'client', label: 'Clientes' },
  { value: 'lost', label: 'Perdidos' },
];

interface ContactRow {
  id: string;
  full_name: string;
  primary_phone: string | null;
  primary_email: string | null;
  status: string;
  score: number | null;
  source: string | null;
  tags: string[] | null;
  created_at: string;
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const navigate = useNavigate();
  const { path } = useWorkspace();

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("contacts").select("id, full_name, primary_phone, primary_email, status, score, source, tags, created_at").order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (search) query = query.or(`full_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
    const { data, error } = await query;
    if (!error && data) setContacts(data);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => fetchContacts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchContacts]);

  // Clear selection when filters change
  useEffect(() => { setSelected(new Set()); }, [statusFilter, search]);

  const visibleIds = contacts.map(c => c.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} contacto${selected.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").delete().in("id", [...selected]);
    if (error) { toast.error("Error al eliminar: " + error.message); }
    else { toast.success(`${selected.size} contacto${selected.size !== 1 ? "s" : ""} eliminado${selected.size !== 1 ? "s" : ""}`); setSelected(new Set()); fetchContacts(); }
    setBulkWorking(false);
  };

  const handleBulkStatus = async (newStatus: string) => {
    setBulkWorking(true);
    const { error } = await supabase.from("contacts").update({ status: newStatus }).in("id", [...selected]);
    if (error) { toast.error("Error al actualizar: " + error.message); }
    else { toast.success(`${selected.size} contacto${selected.size !== 1 ? "s" : ""} actualizado${selected.size !== 1 ? "s" : ""}`); setSelected(new Set()); fetchContacts(); }
    setBulkWorking(false);
  };

  return (
    <AppLayout>
      <AppHeader title="Contactos" subtitle={`${contacts.length} contactos`} actions={
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo contacto
        </Button>
      } />
      <main className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar contactos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {statusFilters.map(f => (
              <Button key={f.value} variant={statusFilter === f.value ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {someChecked && (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-sm flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <Select onValueChange={handleBulkStatus} disabled={bulkWorking}>
                <SelectTrigger className="h-8 text-xs w-44 gap-1">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue placeholder="Cambiar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Nuevo</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="qualified">Calificado</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" onClick={handleBulkDelete} disabled={bulkWorking}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </div>
        )}

        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={toggleAll}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contacto</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Origen</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Score</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-0 py-0">
                  <div className="p-8 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="h-8 w-8 rounded-full bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-1/3 rounded bg-muted" />
                          <div className="h-2 w-1/4 rounded bg-muted/60" />
                        </div>
                      </div>
                    ))}
                  </div>
                </td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={7} className="px-0 py-0">
                  <EmptyState
                    variant={search || statusFilter !== "all" ? "search" : "contacts"}
                    title={search || statusFilter !== "all" ? "Sin resultados" : "Aún no tienes contactos"}
                    description={
                      search || statusFilter !== "all"
                        ? "Prueba con otro filtro o término de búsqueda"
                        : "Importa tus contactos desde Excel/CSV o crea el primero manualmente. También llegarán automáticamente si tienes Facebook Lead Ads conectado."
                    }
                    action={
                      !search && statusFilter === "all" && (
                        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
                          <Plus className="h-4 w-4" /> Crear mi primer contacto
                        </Button>
                      )
                    }
                  />
                </td></tr>
              ) : contacts.map((contact) => {
                const status = statusConfig[contact.status] || statusConfig.new;
                const isSelected = selected.has(contact.id);
                return (
                  <tr
                    key={contact.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(contact.id)}
                        aria-label={`Seleccionar ${contact.full_name}`}
                      />
                    </td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                            {contact.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{contact.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{contact.primary_email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>{contact.primary_phone || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>{contact.source || '—'}</td>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}><Badge variant={status.variant}>{status.label}</Badge></td>
                    <td className="px-4 py-3 hidden md:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${contact.score || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{contact.score || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell cursor-pointer" onClick={() => navigate(path(`/contacts/${contact.id}`))}>
                      <div className="flex gap-1 flex-wrap">
                        {(contact.tags || []).slice(0, 2).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchContacts} />
    </AppLayout>
  );
}
