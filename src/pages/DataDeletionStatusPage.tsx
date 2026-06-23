/**
 * Public status page for Meta's Data Deletion Callback flow.
 *
 * Meta's spec: when our /functions/v1/meta-data-deletion endpoint returns
 * `{ url, confirmation_code }`, Meta surfaces that URL to the end user so
 * they can check whether their deletion has completed.  This is what they
 * see when they click it.
 *
 * Privacy: we expose only `status` + `requested_at` + `completed_at` via the
 * `get_data_deletion_status(p_code)` SQL function (SECURITY DEFINER, read-
 * only).  The Meta ASID, raw payload, and which internal users were
 * affected stay private.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type StatusRow = {
  status: "pending" | "completed" | "failed";
  requested_at: string;
  completed_at: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "not_found" }
  | { kind: "ok"; row: StatusRow }
  | { kind: "error"; message: string };

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const DataDeletionStatusPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = params.get("code")?.trim() || "";

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    if (!code) {
      setState({ kind: "missing" });
      return;
    }

    (async () => {
      const { data, error } = await supabase.rpc(
        "get_data_deletion_status",
        { p_code: code },
      );
      if (!alive) return;

      if (error) {
        setState({ kind: "error", message: (error as { message?: string }).message ?? "unknown error" });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setState({ kind: "not_found" });
        return;
      }
      setState({ kind: "ok", row: row as unknown as StatusRow });
    })();

    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <article className="max-w-2xl mx-auto prose prose-slate dark:prose-invert">
        <h1>{t("dataDeletionStatusPage.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dataDeletionStatusPage.operatedBy")}
        </p>

        {state.kind === "loading" && (
          <p className="text-muted-foreground">{t("dataDeletionStatusPage.checkingStatus")}</p>
        )}

        {state.kind === "missing" && (
          <>
            <h2>{t("dataDeletionStatusPage.missingCodeTitle")}</h2>
            <p>
              {t("dataDeletionStatusPage.missingCodeBodyBefore")}{" "}
              <code>?code=...</code>{" "}
              {t("dataDeletionStatusPage.missingCodeBodyAfter")}
            </p>
            <p>
              {t("dataDeletionStatusPage.errorContactPrefix")}{" "}
              <a href="mailto:hola@klosify.com">
                hola@klosify.com
              </a>
              .
            </p>
          </>
        )}

        {state.kind === "not_found" && (
          <>
            <h2>{t("dataDeletionStatusPage.notFoundTitle")}</h2>
            <p>
              {t("dataDeletionStatusPage.notFoundBodyBefore")}{" "}
              <code>{code}</code>.{" "}
              {t("dataDeletionStatusPage.notFoundBodyAfter")}
            </p>
            <p>
              {t("dataDeletionStatusPage.persistContactPrefix")}{" "}
              <a href="mailto:hola@klosify.com">
                hola@klosify.com
              </a>{" "}
              {t("dataDeletionStatusPage.citingCode")}
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <h2>{t("dataDeletionStatusPage.errorTitle")}</h2>
            <p>
              {t("dataDeletionStatusPage.errorBody")}{" "}
              <a href="mailto:hola@klosify.com">
                hola@klosify.com
              </a>{" "}
              {t("dataDeletionStatusPage.citingCodeBefore")}{" "}
              <code>{code}</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dataDeletionStatusPage.technicalDetail")} {state.message}
            </p>
          </>
        )}

        {state.kind === "ok" && (
          <>
            <h2>{t("dataDeletionStatusPage.detailsTitle")}</h2>
            <ul>
              <li>
                <strong>{t("dataDeletionStatusPage.confirmationCodeLabel")}</strong> <code>{code}</code>
              </li>
              <li>
                <strong>{t("dataDeletionStatusPage.requestDateLabel")}</strong>{" "}
                {formatDateTime(state.row.requested_at)}
              </li>
              <li>
                <strong>{t("dataDeletionStatusPage.completionDateLabel")}</strong>{" "}
                {formatDateTime(state.row.completed_at)}
              </li>
              <li>
                <strong>{t("dataDeletionStatusPage.statusLabel")}</strong>{" "}
                {state.row.status === "pending" && (
                  <span className="text-amber-600">
                    {t("dataDeletionStatusPage.statusPending")}
                  </span>
                )}
                {state.row.status === "completed" && (
                  <span className="text-emerald-600">
                    {t("dataDeletionStatusPage.statusCompleted")}
                  </span>
                )}
                {state.row.status === "failed" && (
                  <span className="text-red-600">
                    {t("dataDeletionStatusPage.statusFailed")}
                  </span>
                )}
              </li>
            </ul>

            {state.row.status === "completed" && (
              <>
                <h2>{t("dataDeletionStatusPage.whatWeDeletedTitle")}</h2>
                <p>
                  {t("dataDeletionStatusPage.whatWeDeletedBody")}
                </p>
                <ul>
                  <li>{t("dataDeletionStatusPage.deletedItemTokens")}</li>
                  <li>{t("dataDeletionStatusPage.deletedItemPages")}</li>
                  <li>{t("dataDeletionStatusPage.deletedItemLeadForms")}</li>
                  <li>
                    {t("dataDeletionStatusPage.deletedItemConversations")}
                  </li>
                  <li>{t("dataDeletionStatusPage.deletedItemIgIds")}</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  {t("dataDeletionStatusPage.subprocessorsNoteBefore")}{" "}
                  <a href="/privacy">{t("dataDeletionStatusPage.privacyPolicyLink")}</a>{" "}
                  {t("dataDeletionStatusPage.subprocessorsNoteAfter")}
                </p>
              </>
            )}
          </>
        )}

        <hr />
        <p className="text-xs text-muted-foreground">
          {t("dataDeletionStatusPage.questionsPrefix")} <a href="/eliminar-datos">{t("dataDeletionStatusPage.deletionInstructionsLink")}</a>
          {" · "}
          <a href="/privacy">{t("dataDeletionStatusPage.privacyPolicyLink")}</a>
          {" · "}
          <a href="mailto:hola@klosify.com">
            hola@klosify.com
          </a>
        </p>
      </article>
    </div>
  );
};

export default DataDeletionStatusPage;
