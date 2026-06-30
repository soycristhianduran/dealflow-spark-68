// ══════════════════════════════════════════════════════════════════════
//  PlatformOrgsPage — super-admin panel (platform_admins only).
//  Lists every organization, lets the admin drop into any of them for
//  support, and grants the non-billable "gestor" role by email.
// ══════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Shield, Building2, LogIn, UserPlus, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface PlatformOrg {
  organization_id: string;
  org_name: string;
  org_slug: string;
  member_count: number;
  created_at: string;
  am_member: boolean;
}

export default function PlatformOrgsPage() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");
  const [entering, setEntering] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("platform_list_organizations");
      if (error) { setDenied(true); setLoading(false); return; }
      if (!data || data.length === 0) {
        // Empty result means either no orgs or (more likely) not a platform admin.
        const { data: pa } = await supabase.from("platform_admins").select("user_id").maybeSingle();
        if (!pa) setDenied(true);
      }
      setOrgs((data ?? []) as PlatformOrg[]);
      setLoading(false);
    })();
  }, []);

  const enterOrg = async (org: PlatformOrg) => {
    setEntering(org.organization_id);
    const { data, error } = await supabase.rpc("platform_admin_enter_org", { p_org_id: org.organization_id });
    setEntering(null);
    if (error) { toast({ title: "No se pudo entrar", description: error.message, variant: "destructive" }); return; }
    const slug = Array.isArray(data) ? data[0]?.org_slug : (data as any)?.org_slug;
    window.location.href = `/w/${slug || org.org_slug}`;
  };

  const assignGestor = async (org: PlatformOrg) => {
    if (!assignEmail.trim()) return;
    setAssigning(true);
    const { data, error } = await supabase.functions.invoke("org-invitations", {
      body: { action: "assign_gestor", organization_id: org.organization_id, email: assignEmail.trim() },
    });
    setAssigning(false);
    if (error || (data as any)?.error) {
      toast({ title: "Error", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gestor asignado", description: `Se envió la invitación de gestor a ${assignEmail.trim()}.` });
    setAssignFor(null);
    setAssignEmail("");
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (denied) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-center px-6">
        <Shield className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground max-w-sm">Este panel es solo para administradores de plataforma de Klosify.</p>
      </div>
    );
  }

  const filtered = orgs.filter((o) =>
    o.org_name?.toLowerCase().includes(q.toLowerCase()) || o.org_slug?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <Shield className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Panel de plataforma</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{orgs.length} organizaciones · entra a cualquiera o asigna gestores</p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar organización…" className="pl-9" />
        </div>

        <div className="space-y-2">
          {filtered.map((o) => (
            <div key={o.organization_id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{o.org_name}</div>
                  <div className="text-xs text-muted-foreground">/{o.org_slug} · {o.member_count} usuario{o.member_count === 1 ? "" : "s"}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAssignFor(assignFor === o.organization_id ? null : o.organization_id)}>
                  <UserPlus className="h-4 w-4 mr-1.5" /> Gestor
                </Button>
                <Button size="sm" onClick={() => enterOrg(o)} disabled={entering === o.organization_id}>
                  {entering === o.organization_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4 mr-1.5" /> Entrar</>}
                </Button>
              </div>
              {assignFor === o.organization_id && (
                <div className="mt-3 flex items-center gap-2 pl-8">
                  <Input
                    type="email"
                    value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    placeholder="email@gestor.com"
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={() => assignGestor(o)} disabled={assigning}>
                    {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Asignar gestor"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
