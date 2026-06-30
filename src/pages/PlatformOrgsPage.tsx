// ══════════════════════════════════════════════════════════════════════
//  PlatformOrgsPage — super-admin panel (platform_admins only).
//  Lists every organization, lets the admin drop into any of them for
//  support, and grants the non-billable "gestor" role by email.
// ══════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Shield, Building2, LogIn, Search, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface AuditFinding { table_name: string; issue: string; }

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
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<{ findings: AuditFinding[] } | null>(null);

  const runAudit = async () => {
    setAuditing(true);
    const { data, error } = await supabase.rpc("audit_rls_isolation");
    setAuditing(false);
    if (error) { toast({ title: "No se pudo auditar", description: error.message, variant: "destructive" }); return; }
    setAudit({ findings: (data ?? []) as AuditFinding[] });
  };
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
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">Panel de plataforma</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{orgs.length} organizaciones · entra a cualquiera</p>
          </div>
          <Button variant="outline" size="sm" onClick={runAudit} disabled={auditing}>
            {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Shield className="h-4 w-4 mr-1.5" /> Auditar seguridad</>}
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {audit && (
          <div className={`mb-4 rounded-lg border p-4 ${audit.findings.length === 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            {audit.findings.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">Aislamiento de datos correcto: ninguna tabla queda sin protección entre organizaciones.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-700">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-semibold">{audit.findings.length} riesgo(s) de aislamiento detectado(s):</span>
                </div>
                <ul className="list-disc pl-8 text-sm text-red-700 space-y-0.5">
                  {audit.findings.map((f, i) => (
                    <li key={i}><code className="font-mono">{f.table_name}</code> — {f.issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
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
                <Button size="sm" onClick={() => enterOrg(o)} disabled={entering === o.organization_id}>
                  {entering === o.organization_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4 mr-1.5" /> Entrar</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
