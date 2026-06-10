import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, Clock,
  Copy, Loader2, Star, Globe,
} from "lucide-react";

interface DnsRecord {
  record?: string;
  name?: string;
  type?: string;
  ttl?: string | number;
  value?: string;
  priority?: number;
  status?: string;
}
interface EmailDomain {
  id: string;
  domain: string;
  status: string;
  dns_records: DnsRecord[];
  is_default: boolean;
  region?: string;
  verified_at?: string | null;
}

const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  verified:           { label: "Verificado",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending:            { label: "Pendiente",   cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
  not_started:        { label: "Pendiente",   cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
  temporary_failure:  { label: "Reintentando",cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
  failed:             { label: "Falló",       cls: "bg-red-100 text-red-700 border-red-200",             icon: AlertCircle },
};

export function EmailDomainsSettings() {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("email-domains", {
      body: { action, ...payload },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  };

  const load = async () => {
    try {
      const data = await call("list");
      setDomains(data.domains || []);
    } catch (e: any) {
      toast.error(e.message || "Error al cargar dominios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      await call("add", { domain: newDomain.trim() });
      setNewDomain("");
      toast.success("Dominio agregado. Agrega los registros DNS para verificarlo.");
      await load();
    } catch (e: any) {
      toast.error(e.message || "No se pudo agregar el dominio");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setBusyId(id);
    try {
      const data = await call("verify", { id });
      const st = data.domain?.status;
      if (st === "verified") toast.success("¡Dominio verificado! Ya puedes enviar desde él.");
      else toast.message("Aún no verificado. Los DNS pueden tardar hasta 48h en propagar.");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error al verificar");
    } finally {
      setBusyId(null);
    }
  };

  const handleDefault = async (id: string) => {
    setBusyId(id);
    try { await call("set_default", { id }); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (id: string, domain: string) => {
    if (!confirm(`¿Eliminar el dominio ${domain}? Dejarás de poder enviar desde él.`)) return;
    setBusyId(id);
    try { await call("delete", { id }); toast.success("Dominio eliminado"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast.success("Copiado"); };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4" /> Dominio de email para campañas
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Conecta tu propio dominio para que tus campañas y automatizaciones salgan desde tu marca
          (ej. <span className="font-mono">hola@tudominio.com</span>) con mejor entregabilidad.
          Si no conectas uno, se usa el remitente compartido por defecto.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add domain */}
        <div className="flex gap-2">
          <Input
            placeholder="tudominio.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="font-mono text-sm"
          />
          <Button onClick={handleAdd} disabled={adding || !newDomain.trim()} className="gap-2 shrink-0">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar dominio
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Aún no has conectado ningún dominio.
          </div>
        ) : (
          domains.map((d) => {
            const st = STATUS[d.status] || STATUS.pending;
            const StIcon = st.icon;
            return (
              <div key={d.id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{d.domain}</span>
                    <Badge className={`text-[10px] border ${st.cls}`}>
                      <StIcon className="h-3 w-3 mr-1" />{st.label}
                    </Badge>
                    {d.is_default && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                        <Star className="h-3 w-3 mr-1" />Predeterminado
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {d.status === "verified" && !d.is_default && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs"
                        onClick={() => handleDefault(d.id)} disabled={busyId === d.id}>
                        <Star className="h-3.5 w-3.5 mr-1" />Predeterminado
                      </Button>
                    )}
                    {d.status !== "verified" && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                        onClick={() => handleVerify(d.id)} disabled={busyId === d.id}>
                        {busyId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Verificar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(d.id, d.domain)} disabled={busyId === d.id}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* DNS records (shown until verified) */}
                {d.status !== "verified" && d.dns_records?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Agrega estos registros en tu proveedor de DNS (GoDaddy, Cloudflare, etc.). Luego pulsa
                      <span className="font-medium"> Verificar</span>. La propagación puede tardar minutos u horas.
                    </p>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="text-left font-medium px-2 py-1.5">Tipo</th>
                            <th className="text-left font-medium px-2 py-1.5">Nombre / Host</th>
                            <th className="text-left font-medium px-2 py-1.5">Valor</th>
                            <th className="px-2 py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.dns_records.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                                {r.type}{r.priority != null ? ` (prio ${r.priority})` : ""}
                              </td>
                              <td className="px-2 py-1.5 font-mono break-all">{r.name}</td>
                              <td className="px-2 py-1.5 font-mono break-all max-w-[280px]">{r.value}</td>
                              <td className="px-2 py-1.5">
                                <button onClick={() => copy(r.value || "")} className="text-muted-foreground hover:text-foreground">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {d.status === "verified" && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Listo. Tus campañas pueden enviarse desde <span className="font-mono">@{d.domain}</span>.
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
