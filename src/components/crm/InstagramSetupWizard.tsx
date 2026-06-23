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
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstagramSetupWizard({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const ig = useInstagramIntegration();
  const fb = useFacebookIntegration();
  const { organizationId } = useOrganizationContext();
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
                <h2 className="text-lg font-bold">{t("instagramSetupWizard.connectedTitle")}</h2>
                <p className="text-sm text-white/80">{t("instagramSetupWizard.connectedSubtitle")}</p>
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
                  <p className="text-xs text-muted-foreground">{t("instagramSetupWizard.pageLabel", { name: acct.page_name })}</p>
                )}
              </div>
              <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-300 bg-green-50">
                <Wifi className="h-3 w-3" /> {t("instagramSetupWizard.active")}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <MessageSquare className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xl font-semibold">{ig.status.conversations_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("instagramSetupWizard.conversations")}</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <MessageCircle className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xl font-semibold">{ig.status.comments_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("instagramSetupWizard.comments")}</p>
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
                <WifiOff className="h-4 w-4" /> {t("instagramSetupWizard.disconnect")}
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
                <RefreshCw className="h-4 w-4" /> {t("instagramSetupWizard.refresh")}
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
                {t("instagramSetupWizard.diagnose")}
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
            <h2 className="text-white font-semibold text-sm">{t("instagramSetupWizard.connectInstagram")}</h2>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-500/10">
                <Instagram className="h-8 w-8 text-pink-600" />
              </div>
            </div>
            <h3 className="text-lg font-bold">{t("instagramSetupWizard.selectAccount")}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t("instagramSetupWizard.selectAccountHint")}
            </p>
          </div>

          {/* ── Recommended: direct Instagram Business Login ─────────────────── */}
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-pink-500/30 bg-gradient-to-br from-pink-500/5 to-orange-500/5 p-6">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-pink-600">{t("instagramSetupWizard.recommended")}</span>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {t("instagramSetupWizard.directLoginHint")}
            </p>
            <button
              onClick={() => ig.startDirectLogin(organizationId)}
              disabled={ig.connecting}
              className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 transition-opacity shadow-sm"
            >
              {ig.connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
              {t("instagramSetupWizard.connectWithInstagram")}
            </button>
          </div>

          <div className="flex items-center gap-3 my-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{t("instagramSetupWizard.orViaFacebook")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {!fb.isConnected && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/40 p-6">
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                {t("instagramSetupWizard.metaLoginHint")}
              </p>
              <button
                onClick={() => fb.connect()}
                disabled={fb.connecting || fb.metaAppIdLoading}
                className="flex items-center gap-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1464D8] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 transition-colors shadow-sm"
              >
                {fb.connecting || fb.metaAppIdLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                )}
                {t("instagramSetupWizard.loginWithMeta")}
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
              <p className="text-sm text-muted-foreground">{t("instagramSetupWizard.searchingAccounts")}</p>
            </div>
          ) : availableAccounts.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Instagram className="h-6 w-6 text-muted-foreground" />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("instagramSetupWizard.noAccountsFound")}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {t("instagramSetupWizard.noAccountsHint")}
                </p>
              </div>
              {fb.isConnected && (
                <Button variant="outline" size="sm" onClick={() => {
                  setLoading(true);
                  ig.listAvailableAccounts()
                    .then((a) => setAvailableAccounts(a))
                    .finally(() => setLoading(false));
                }} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> {t("instagramSetupWizard.retry")}
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
                        {account.followers_count !== undefined && ` · ${t("instagramSetupWizard.followersCount", { count: account.followers_count.toLocaleString() })}`}
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
  const { t } = useTranslation();
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
      label: t("instagramSetupWizard.checkMessagesLabel"),
      fixHint: t("instagramSetupWizard.checkMessagesHint"),
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: t("instagramSetupWizard.openMetaDevConsole"),
      critical: true,
    },
    {
      key: "token_has_instagram_manage_messages",
      label: t("instagramSetupWizard.checkManageMessagesLabel"),
      fixHint: t("instagramSetupWizard.checkManageMessagesHint"),
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: t("instagramSetupWizard.openAppReview"),
      critical: true,
    },
    {
      key: "token_has_instagram_basic",
      label: t("instagramSetupWizard.checkBasicLabel"),
      fixHint: t("instagramSetupWizard.checkBasicHint"),
      critical: true,
    },
    {
      key: "token_has_instagram_manage_insights",
      label: t("instagramSetupWizard.checkManageInsightsLabel"),
      fixHint: t("instagramSetupWizard.checkManageInsightsHint"),
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: t("instagramSetupWizard.requestInAppReview"),
      critical: false,
    },
    {
      key: "page_subscribed_to_messaging_postbacks",
      label: t("instagramSetupWizard.checkPostbacksLabel"),
      fixHint: t("instagramSetupWizard.checkPostbacksHint"),
      critical: false,
    },
    {
      key: "page_subscribed_to_comments",
      label: t("instagramSetupWizard.checkCommentsLabel"),
      fixHint: t("instagramSetupWizard.checkCommentsHint"),
      fixLink: "https://developers.facebook.com/apps/",
      fixLinkLabel: t("instagramSetupWizard.openWebhooks"),
      critical: false,
    },
    {
      key: "token_has_pages_manage_metadata",
      label: t("instagramSetupWizard.checkManageMetadataLabel"),
      fixHint: t("instagramSetupWizard.checkManageMetadataHint"),
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
            <p className="text-sm font-semibold">{t("instagramSetupWizard.allOk")}</p>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-semibold">{t("instagramSetupWizard.problemsDetected")}</p>
          </>
        )}
      </div>

      {resubscribe_result && (
        <div className="text-xs rounded-md border border-amber-300 bg-amber-50 p-2">
          <p className="font-medium text-amber-900 mb-1">{t("instagramSetupWizard.resubscribeExecuted")}</p>
          {resubscribe_result?.success === true ? (
            <p className="text-amber-800">{t("instagramSetupWizard.resubscribeSuccess")}</p>
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
          <summary className="cursor-pointer">{t("instagramSetupWizard.technicalDetails")}</summary>
          <p className="mt-1">
            <span className="font-medium">{t("instagramSetupWizard.subscribedFields")}</span> {diagnosis.subscribed_fields.join(", ")}
          </p>
          <p className="mt-1">
            <span className="font-medium">{t("instagramSetupWizard.tokenPermissions")}</span>{" "}
            {diagnosis.token_permissions
              .filter((p) => p.status === "granted")
              .map((p) => p.permission)
              .join(", ") || t("instagramSetupWizard.none")}
          </p>
        </details>
      )}
    </div>
  );
}
