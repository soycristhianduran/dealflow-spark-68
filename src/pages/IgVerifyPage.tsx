/**
 * /ig/verify/:token
 *
 * Public page — no login required.
 * Verifies that the visitor is following the Instagram account and
 * delivers their pending lead magnet via DM.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle, Instagram } from "lucide-react";
import { useTranslation } from "react-i18next";

type State =
  | { phase: "loading" }
  | { phase: "delivered" }      // sent immediately
  | { phase: "ready" }          // window closed, user needs to open DM
  | { phase: "already_delivered" }
  | { phase: "not_following"; profileUrl: string | null }
  | { phase: "error"; message: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ig-follow-verify`;

export default function IgVerifyPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ phase: "error", message: t("igVerifyPage.invalidToken") });
      return;
    }

    fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, {
      headers: { "apikey": ANON_KEY },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "delivered") setState({ phase: "delivered" });
        else if (data.status === "ready_to_deliver") setState({ phase: "ready" });
        else if (data.status === "already_delivered") setState({ phase: "already_delivered" });
        else if (data.status === "not_following") setState({ phase: "not_following", profileUrl: data.profile_url });
        else setState({ phase: "error", message: data.message || t("igVerifyPage.unknownError") });
      })
      .catch((e) => setState({ phase: "error", message: String(e) }));
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg"
            style={{ background: "linear-gradient(135deg, #f472b6 0%, #fb923c 100%)" }}>
            <Instagram className="h-7 w-7 text-white" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {state.phase === "loading" && (
            <div className="p-8 text-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-pink-500 mx-auto" />
              <p className="text-base font-semibold text-gray-800">{t("igVerifyPage.verifyingFollow")}</p>
              <p className="text-sm text-gray-500">{t("igVerifyPage.justAMoment")}</p>
            </div>
          )}

          {state.phase === "delivered" && (
            <div className="p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 rounded-full p-3">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("igVerifyPage.deliveredTitle")}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t("igVerifyPage.deliveredBody")}
              </p>
              <div className="pt-2">
                <a
                  href="https://www.instagram.com/direct/inbox/"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-md hover:from-pink-600 hover:to-orange-600 transition-all"
                >
                  <Instagram className="h-4 w-4" />
                  {t("igVerifyPage.viewMyDm")}
                </a>
              </div>
            </div>
          )}

          {state.phase === "ready" && (
            <div className="p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 rounded-full p-3">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("igVerifyPage.readyTitle")}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t("igVerifyPage.readyBodyBefore")} <strong>{t("igVerifyPage.readyBodyEmphasis")}</strong> {t("igVerifyPage.readyBodyAfter")}
              </p>
              <div className="pt-2">
                <a
                  href="https://www.instagram.com/direct/inbox/"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-md hover:from-pink-600 hover:to-orange-600 transition-all"
                >
                  <Instagram className="h-4 w-4" />
                  {t("igVerifyPage.goToChat")}
                </a>
              </div>
            </div>
          )}

          {state.phase === "already_delivered" && (
            <div className="p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 rounded-full p-3">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("igVerifyPage.alreadyDeliveredTitle")}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t("igVerifyPage.alreadyDeliveredBody")}
              </p>
              <div className="pt-2">
                <a
                  href="https://www.instagram.com/direct/inbox/"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-md hover:from-pink-600 hover:to-orange-600 transition-all"
                >
                  <Instagram className="h-4 w-4" />
                  {t("igVerifyPage.viewInstagramDms")}
                </a>
              </div>
            </div>
          )}

          {state.phase === "not_following" && (
            <div className="p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-orange-100 rounded-full p-3">
                  <XCircle className="h-10 w-10 text-orange-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("igVerifyPage.notFollowingTitle")}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {t("igVerifyPage.notFollowingBody")}
              </p>
              <div className="pt-2 space-y-2">
                {state.profileUrl && (
                  <a
                    href={state.profileUrl}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm font-semibold px-6 py-3 rounded-2xl shadow-md hover:from-pink-600 hover:to-orange-600 transition-all"
                  >
                    <Instagram className="h-4 w-4" />
                    {t("igVerifyPage.followNow")}
                  </a>
                )}
                <button
                  onClick={() => {
                    setState({ phase: "loading" });
                    fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token!)}`, {
                      headers: { "apikey": ANON_KEY },
                    })
                      .then((r) => r.json())
                      .then((data) => {
                        if (data.status === "delivered") setState({ phase: "delivered" });
                        else if (data.status === "ready_to_deliver") setState({ phase: "ready" });
                        else if (data.status === "already_delivered") setState({ phase: "already_delivered" });
                        else if (data.status === "not_following") setState({ phase: "not_following", profileUrl: data.profile_url });
                        else setState({ phase: "error", message: data.message || t("igVerifyPage.unknownError") });
                      })
                      .catch((e) => setState({ phase: "error", message: String(e) }));
                  }}
                  className="flex w-full items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 text-sm font-semibold px-6 py-3 rounded-2xl hover:border-pink-300 hover:text-pink-600 transition-all"
                >
                  {t("igVerifyPage.alreadyFollowingVerifyAgain")}
                </button>
              </div>
            </div>
          )}

          {state.phase === "error" && (
            <div className="p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-red-100 rounded-full p-3">
                  <XCircle className="h-10 w-10 text-red-400" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("igVerifyPage.errorTitle")}</h2>
              <p className="text-sm text-gray-500">{state.message}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t("igVerifyPage.poweredBy")} <span className="font-semibold">Klosify CRM</span>
        </p>
      </div>
    </div>
  );
}
