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
        <h1>Estado de la solicitud de eliminación de datos</h1>
        <p className="text-sm text-muted-foreground">
          Klosify CRM · operado por CRISTHIAN DURAN (NIT 1094270110-2)
        </p>

        {state.kind === "loading" && (
          <p className="text-muted-foreground">Consultando estado...</p>
        )}

        {state.kind === "missing" && (
          <>
            <h2>Código no proporcionado</h2>
            <p>
              Esta página muestra el estado de una solicitud de eliminación
              de datos generada cuando un usuario revoca el acceso a Klosify
              CRM desde su cuenta de Facebook o Instagram. Para consultar el
              estado, abre el enlace tal cual te lo entregó Meta, asegurándote
              de incluir el parámetro <code>?code=...</code> en la URL.
            </p>
            <p>
              Si crees que esto es un error, contáctanos en{" "}
              <a href="mailto:contacto@aceleradoradeventas.co">
                contacto@aceleradoradeventas.co
              </a>
              .
            </p>
          </>
        )}

        {state.kind === "not_found" && (
          <>
            <h2>Solicitud no encontrada</h2>
            <p>
              No encontramos ninguna solicitud de eliminación asociada al
              código <code>{code}</code>. Las solicitudes pueden tardar unos
              segundos en aparecer después de generarse — vuelve a cargar
              esta página en un minuto.
            </p>
            <p>
              Si el problema persiste, contáctanos en{" "}
              <a href="mailto:contacto@aceleradoradeventas.co">
                contacto@aceleradoradeventas.co
              </a>{" "}
              citando el código.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <h2>Error al consultar el estado</h2>
            <p>
              No pudimos consultar el estado en este momento. Por favor
              vuelve a intentarlo en unos minutos. Si el problema persiste,
              contáctanos en{" "}
              <a href="mailto:contacto@aceleradoradeventas.co">
                contacto@aceleradoradeventas.co
              </a>{" "}
              citando el código <code>{code}</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              Detalle técnico: {state.message}
            </p>
          </>
        )}

        {state.kind === "ok" && (
          <>
            <h2>Detalles de la solicitud</h2>
            <ul>
              <li>
                <strong>Código de confirmación:</strong> <code>{code}</code>
              </li>
              <li>
                <strong>Fecha de solicitud:</strong>{" "}
                {formatDateTime(state.row.requested_at)}
              </li>
              <li>
                <strong>Fecha de finalización:</strong>{" "}
                {formatDateTime(state.row.completed_at)}
              </li>
              <li>
                <strong>Estado:</strong>{" "}
                {state.row.status === "pending" && (
                  <span className="text-amber-600">
                    En proceso — tu solicitud está en cola y se completará
                    automáticamente en los próximos minutos.
                  </span>
                )}
                {state.row.status === "completed" && (
                  <span className="text-emerald-600">
                    Completada — eliminamos todos los datos personales
                    asociados a tu cuenta de Meta de nuestra base de datos.
                  </span>
                )}
                {state.row.status === "failed" && (
                  <span className="text-red-600">
                    Error — la eliminación automática falló. Nuestro equipo
                    fue notificado y procesará tu solicitud manualmente
                    dentro de las próximas 72 horas. Si quieres seguimiento
                    inmediato, escríbenos al correo de contacto.
                  </span>
                )}
              </li>
            </ul>

            {state.row.status === "completed" && (
              <>
                <h2>¿Qué eliminamos?</h2>
                <p>
                  De acuerdo con tu solicitud y con las políticas de la
                  plataforma de Meta, eliminamos de nuestra base de datos
                  toda la información derivada de tu cuenta de Facebook /
                  Instagram, incluyendo:
                </p>
                <ul>
                  <li>Tokens de acceso de larga duración</li>
                  <li>Información de páginas de Facebook conectadas</li>
                  <li>Formularios de Lead Ads vinculados</li>
                  <li>
                    Conversaciones de Instagram Direct, comentarios y
                    metadatos relacionados
                  </li>
                  <li>Identificadores de cuenta de Instagram Business</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Los datos transmitidos a sub-procesadores (Supabase,
                  Vercel, OpenAI) heredan políticas equivalentes de
                  eliminación; consulta nuestra{" "}
                  <a href="/privacy">Política de Privacidad</a> para
                  detalles.
                </p>
              </>
            )}
          </>
        )}

        <hr />
        <p className="text-xs text-muted-foreground">
          ¿Preguntas? <a href="/eliminar-datos">Instrucciones de eliminación</a>
          {" · "}
          <a href="/privacy">Política de Privacidad</a>
          {" · "}
          <a href="mailto:contacto@aceleradoradeventas.co">
            contacto@aceleradoradeventas.co
          </a>
        </p>
      </article>
    </div>
  );
};

export default DataDeletionStatusPage;
