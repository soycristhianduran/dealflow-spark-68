/**
 * Editor de permisos granulares de un miembro (matriz estilo Kommo).
 * Filas = entidades (Leads, Compañías, Tareas, Productos).
 * Columnas = acciones (Ver, Crear, Editar, Eliminar, Exportar).
 * Cada celda: nivel Denegado / Solo si es responsable / Todo el equipo
 * (crear y exportar son sí/no).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PERM_ENTITIES, PERM_ACTIONS, roleDefault,
  type MemberPermissions, type PermEntity, type PermAction, type PermLevel,
} from "@/lib/permissions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string | null;
  member: { user_id: string; name: string; role: string; permissions?: MemberPermissions | null } | null;
  onSaved: (userId: string, permissions: MemberPermissions) => void;
}

// Niveles disponibles según la acción (crear/exportar son binarios).
const LEVELS_FULL: { value: PermLevel; label: string }[] = [
  { value: "none", label: "Denegado" },
  { value: "own", label: "Solo si es responsable" },
  { value: "all", label: "Todo el equipo" },
];
const LEVELS_BINARY: { value: PermLevel; label: string }[] = [
  { value: "none", label: "Denegado" },
  { value: "all", label: "Permitido" },
];

export function MemberPermissionsDialog({ open, onOpenChange, organizationId, member, onSaved }: Props) {
  const [saving, setSaving] = useState(false);

  // Estado inicial: override existente o, si no hay, los defaults del rol.
  const initial = useMemo<MemberPermissions>(() => {
    const base: MemberPermissions = {};
    for (const { key: entity } of PERM_ENTITIES) {
      const ent: Record<string, PermLevel> = {};
      for (const { key: action } of PERM_ACTIONS) {
        ent[action] = member?.permissions?.[entity]?.[action] ?? roleDefault(member?.role ?? null, action);
      }
      base[entity] = ent;
    }
    return base;
  }, [member]);

  const [perms, setPerms] = useState<MemberPermissions>(initial);
  // Re-sincroniza al abrir con otro miembro.
  useEffect(() => setPerms(initial), [initial]);

  if (!member) return null;

  const setCell = (entity: PermEntity, action: PermAction, value: PermLevel) => {
    setPerms(prev => ({ ...prev, [entity]: { ...prev[entity], [action]: value } }));
  };

  const applyPreset = (view: PermLevel) => {
    setPerms(prev => {
      const next: MemberPermissions = { ...prev };
      for (const { key: entity } of PERM_ENTITIES) {
        next[entity] = { ...next[entity], view };
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-invitations", {
        body: { action: "update_permissions", organization_id: organizationId, member_user_id: member.user_id, permissions: perms },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success("Permisos actualizados");
      onSaved(member.user_id, perms);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No se pudo guardar: " + (e.message ?? "error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Permisos de {member.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Atajos:</span>
            <button type="button" onClick={() => applyPreset("all")} className="rounded-md border px-2 py-1 hover:bg-muted">Ver todo</button>
            <button type="button" onClick={() => applyPreset("own")} className="rounded-md border px-2 py-1 hover:bg-muted">Ver solo los suyos</button>
            <button type="button" onClick={() => applyPreset("none")} className="rounded-md border px-2 py-1 hover:bg-muted">No ver nada</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium py-2 pr-2"> </th>
                  {PERM_ACTIONS.map(a => (
                    <th key={a.key} className="text-left font-medium py-2 px-1">{a.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERM_ENTITIES.map(ent => (
                  <tr key={ent.key} className="border-t">
                    <td className="py-2 pr-2 font-medium whitespace-nowrap">{ent.label}</td>
                    {PERM_ACTIONS.map(a => {
                      const opts = a.binary ? LEVELS_BINARY : LEVELS_FULL;
                      const val = perms[ent.key]?.[a.key] ?? "none";
                      // create/export normalizan "own" → "all" visualmente.
                      const shown = a.binary && val === "own" ? "all" : val;
                      return (
                        <td key={a.key} className="py-1.5 px-1">
                          <Select value={shown} onValueChange={v => setCell(ent.key, a.key, v as PermLevel)}>
                            <SelectTrigger className="h-8 w-full min-w-[120px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {opts.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            "Solo si es responsable" limita al miembro a los registros donde figura como responsable (o setter). "Todo el equipo" le da acceso a todos los de la organización.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Guardar permisos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
