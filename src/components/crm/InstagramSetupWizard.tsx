import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Instagram, Loader2, CheckCircle2, ChevronRight, AlertTriangle,
  Wifi, WifiOff, MessageSquare, MessageCircle, RefreshCw, Stethoscope,
  XCircle, ExternalLink,
} from "lucide-react";
import { useInstagramIntegration, IgAvailableAccount, IgDiagnosis } from "@/hooks/useInstagramIntegration";
import { useFacebookIntegration } from "@/hooks/useFacebookIntegration";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstagramSetupWizard({ open, onOpenChange }: Props) {
  const ig = useInstagramIntegration();
  const fb = useFacebookIntegration();
  const [availableAccounts, setAvailableAccounts] = useState<IgAvailableAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<IgDiagnosis | null>(null);

  const handleDiagnose = async () => {
    setDiagnosing(true);
    const result = await ig.diagnose();
    setDiagnosing(false);
    if (result) {
      setDiagnosis(result);
      // Refresh status counters in case the resubscribe attempt fixed things
      ig.refresh();
    }
  };

  // Load available accounts when wizard opens and user is NOT connected
  useEffect(() => {
    if (!open || ig.isConnected) return;
    setLoading(true);
    ig.listAvailableAccounts()
      .then((accounts) => setAvailableAccounts(accounts))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ig.isConnected]);

  const handleConnect = async (account: IgAvailableAccount) => {
    setSelectedAccountId(account.ig_user_id);
    await ig.connectAccount(account);
    setSelectedAccountId(null);
  };

  // ===== Connected view ======================================================
  if (ig.isConnected && ig.status?.account) {
    const acct = ig.status.account;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                <Instagram className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Instagram Conectado</h2>
                <p className="text-sm text-white/80">DMs y comentarios sincronizados</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-xl border p-4 flex items-center gap-3">
              {acct.profile_picture_url ? (
                <img src={acct.profile_picture_url} alt="" className="h-12 w-12 rounded-full" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                  <Instagram className="h-5 w-5 text-pink-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">@{acct.ig_username}</p>
                {acct.page_name && (
                  <p className="text-xs text-muted-foreground">Página: {acct.page_name}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50">
                <Wifi className="h-3 w-3" /> Activo
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <MessageSquare className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xl font-semibold">{ig.status.conversations_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Conversaciones</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <MessageCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xl font-semibold">{ig.status.comments_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Comentarios</p>
              </div>
            </div>

            {/* Diagnosis section */}
            {diagnosis && <DiagnosisPanel diagnosis={diagnosis} />}

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={async () => {
                  await ig.disconnect();
                  onOpenChange(false);
                }}
              >
                <WifiOff className="h-4 w-4" /> Desconectar
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  // Refresh counts AND backfill any conversations that are
                  // still showing the raw IGSID.  Both run in parallel —
                  // resolve is best-effort and won't block the refresh.
                  await Promise.all([
                    ig.refresh(),
                    ig.resolveUnresolvedParticipants(),
                  ]);
                }}
              >
                <RefreshCw className="h-4 w-4" /> Actualizar
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleDiagnose}
                disabled={diagnosing}
              >
                {diagnosing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Stethoscope className="h-4 w-4" />
                )}
                Diagnosticar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ===== Connection flow =====================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 px-6 py-4">
          <div className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-white" />
            <h2 className="text-white font-semibold text-sm">Conectar Instagram</h2>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-500/10">
                <Instagram className="h-8 w-8 text-pink-600" />
              </div>
            </div>
            <h3 className="text-lg font-bold">Selecciona tu cuenta de Instagram</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Solo aparecen cuentas Business o Creator vinculadas a una página de Facebook que ya conectaste.
            </p>
          </div>

          {!fb.isConnected && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <span className="font-semibold">Conecta Facebook primero.</span> Instagram requiere acceso vía una página de Facebook vinculada.
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
              <p className="text-sm text-muted-foreground">Buscando cuentas de Instagram...</p>
            </div>
          ) : availableAccounts.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Instagram className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No se encontraron cuentas de Instagram.</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Asegúrate de tener una cuenta IG Business o Creator vinculada a una de tus páginas de Facebook.
                </p>
              </div>
              {fb.isConnected && (
                <Button variant="outline" size="sm" onClick={() => {
                  setLoading(true);
                  ig.listAvailableAccounts()
                    .then((a) => setAvailableAccounts(a))
                    .finally(() => setLoading(false));
                }} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {availableAccounts.map((account) => {
                const isLoading = selectedAccountId === account.ig_user_id;
                return (
                  <button
                    key={account.ig_user_id}
                    className="w-full flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-pink-500/30 bg-card p-4 text-left transition-all hover:shadow-sm group disabled:opacity-60"
                    onClick={() => handleConnect(account)}
                    disabled={ig.connecting}
                  >
                    {account.profile_picture_url ? (
                      <img src={account.profile_picture_url} alt="" className="h-12 w-12 rounded-full shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shrink-0">
                        <Instagram className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">@{account.ig_username}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {account.page_name}
                        {account.followers_count !== undefined && ` · ${account.followers_count.toLocaleString()} seguidores`}
                      </p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renders the result of an instagram-api `diagnose` call as a checklist.
 * Each failed check shows a "Cómo arreglarlo" hint and (where applicable)
 * a deep link into Meta Developer Console.
 */
function DiagnosisPanel({ diagnosis }: { diagnosis: IgDiagnosis }) {
  const { checks, resubscribe_result } = diagnosis;

  const items: Array<{
    key: keyof typeof checks;
    label: string;
    fixHint: string;
    fixLink?: string;
    fixLinkLabel?: string;
    critical: boolean;
  }> = [
    {
      key: "page_subscribed_to_messages",
      label: "Página suscrita a 'messages' (webhook de DMs)",
      fixHint:
        "Requiere el permiso instagram_manage_messages aprobado en tu App de Meta. Si ya lo tienes, intenta desconectar y conectar de nuevo.",
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: "Abrir Meta Developer Console",
      critical: true,
    },
    {
      key: "token_has_instagram_manage_messages",
      label: "Token con permiso instagram_manage_messages",
      fixHint:
        "Solicita 'instagram_manage_messages' en App Review → Permissions and Features. Sin esto, Meta no envía DMs al webhook.",
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: "Abrir App Review",
      critical: true,
    },
    {
      key: "token_has_instagram_basic",
      label: "Token con permiso instagram_basic",
      fixHint: "Vuelve a conectar la cuenta y asegúrate de aceptar todos los permisos solicitados.",
      critical: true,
    },
    {
      key: "token_has_instagram_manage_insights",
      label: "Token con permiso instagram_manage_insights",
      fixHint:
        "Necesario para verificar si un usuario sigue la cuenta (follower-gate). Solicítalo en Meta App Review → Permissions and Features. Una vez aprobado, reconecta la cuenta de Instagram.",
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: "Solicitar en App Review",
      critical: false,
    },
    {
      key: "page_subscribed_to_messaging_postbacks",
      label: "Página suscrita a 'messaging_postbacks' (botones rápidos)",
      fixHint: "Se suscribe automáticamente al conectar. Si falla, suele ser por el mismo permiso de messages.",
      critical: false,
    },
    {
      key: "page_subscribed_to_comments",
      label: "Página suscrita a 'comments'",
      fixHint:
        "Marca el campo 'comments' bajo el objeto Instagram en Webhooks de la App.",
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: "Abrir Webhooks",
      critical: false,
    },
    {
      key: "token_has_pages_manage_metadata",
      label: "Token con permiso pages_manage_metadata",
      fixHint: "Necesario para suscribir la página a eventos. Solicítalo en App Review.",
      critical: false,
    },
  ];

  const allCriticalPass = items.filter((i) => i.critical).every((i) => checks[i.key]);

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        {allCriticalPass ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold">Todo OK · los DMs deben llegar</p>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-semibold">Problemas detectados — los DMs no llegarán hasta arreglarlos</p>
          </>
        )}
      </div>

      {resubscribe_result && (
        <div className="text-xs rounded-md border border-amber-300 bg-amber-50 p-2">
          <p className="font-medium text-amber-900 mb-1">Reintento de suscripción ejecutado:</p>
          {resubscribe_result?.success === true ? (
            <p className="text-amber-800">✓ Meta aceptó la nueva suscripción. Envía un DM de prueba ahora.</p>
          ) : (
            <p className="text-amber-800 break-words">
              ✗ {resubscribe_result?.error?.message || JSON.stringify(resubscribe_result)}
            </p>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const ok = checks[item.key];
          return (
            <li key={item.key} className="text-xs">
              <div className="flex items-start gap-2">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className={`h-4 w-4 shrink-0 mt-0.5 ${item.critical ? "text-red-600" : "text-amber-500"}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={ok ? "text-foreground" : "font-medium text-foreground"}>{item.label}</p>
                  {!ok && (
                    <>
                      <p className="text-muted-foreground mt-0.5">{item.fixHint}</p>
                      {item.fixLink && (
                        <a
                          href={item.fixLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> {item.fixLinkLabel}
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {diagnosis.subscribed_fields.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Detalles técnicos</summary>
          <p className="mt-1">
            <span className="font-medium">Campos suscritos:</span> {diagnosis.subscribed_fields.join(", ")}
          </p>
          <p className="mt-1">
            <span className="font-medium">Permisos del token:</span>{" "}
            {diagnosis.token_permissions
              .filter((p) => p.status === "granted")
              .map((p) => p.permission)
              .join(", ") || "ninguno"}
          </p>
        </details>
      )}
    </div>
  );
}
