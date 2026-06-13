/**
 * WhatsAppSendLoader — overlay shown while a bulk WhatsApp campaign sends.
 * WhatsApp-themed animation (a paper plane flying out with chat bubbles). The send
 * runs in the backend, so the user can CLOSE this anytime and it keeps sending;
 * the overlay only closes when the user closes it.
 */
import { Check, X } from "lucide-react";

interface Props {
  done: number;
  total: number;
  finished: boolean;
  onClose: () => void;
}

export function WhatsAppSendLoader({ done, total, finished, onClose }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <style>{`
        @keyframes wa-plane {
          0%   { transform: translate(-14px,14px) rotate(-15deg); opacity: 0; }
          15%  { opacity: 1; }
          70%  { transform: translate(26px,-26px) rotate(-15deg); opacity: 1; }
          100% { transform: translate(40px,-40px) rotate(-15deg); opacity: 0; }
        }
        @keyframes wa-bubble {
          0%   { transform: translateY(8px) scale(.6); opacity: 0; }
          30%  { opacity: 1; }
          100% { transform: translateY(-22px) scale(1); opacity: 0; }
        }
        @keyframes wa-ring { 0% { transform: scale(.8); opacity:.6 } 100% { transform: scale(1.6); opacity:0 } }
        .wa-plane  { animation: wa-plane 1.8s ease-in-out infinite; }
        .wa-b1 { animation: wa-bubble 1.8s ease-in-out infinite; }
        .wa-b2 { animation: wa-bubble 1.8s ease-in-out .45s infinite; }
        .wa-b3 { animation: wa-bubble 1.8s ease-in-out .9s infinite; }
        .wa-ring { animation: wa-ring 1.8s ease-out infinite; }
      `}</style>

      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>

        {/* Animation */}
        <div className="mx-auto mb-5 mt-2 flex h-28 w-28 items-center justify-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>
            {!finished && <span className="absolute inset-0 rounded-full wa-ring" style={{ background: "#25D366" }} />}
            {finished ? (
              <Check className="h-9 w-9 text-white" />
            ) : (
              <>
                {/* paper plane */}
                <svg className="wa-plane h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
                {/* floating chat bubbles */}
                <span className="wa-b1 absolute -right-1 top-3 h-2.5 w-2.5 rounded-full bg-white/90" />
                <span className="wa-b2 absolute right-3 top-1 h-2 w-2 rounded-full bg-white/80" />
                <span className="wa-b3 absolute -right-2 top-6 h-1.5 w-1.5 rounded-full bg-white/70" />
              </>
            )}
          </div>
        </div>

        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold">
            {finished ? "¡Envío completado!" : "Enviando mensajes de WhatsApp…"}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#25D366,#128C7E)" }} />
          </div>
          <p className="text-xs text-muted-foreground">{done} de {total} · {pct}%</p>
          <p className="text-[11px] text-muted-foreground">
            {finished
              ? "Puedes cerrar esta ventana."
              : "Se envía en segundo plano — puedes cerrar y seguir trabajando."}
          </p>
          <button
            onClick={onClose}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            {finished ? "Cerrar" : "Cerrar (seguir en segundo plano)"}
          </button>
        </div>
      </div>
    </div>
  );
}
