/**
 * ImportLoader — overlay shown while a lead import runs. A CSS-3D glossy card
 * with a spinning "people/upload" badge, a projected floor shadow, and a live
 * progress bar. The import runs in the background, so the user can CLOSE this
 * anytime ("seguir en segundo plano") and it keeps importing; a toast fires
 * when it finishes.
 */
import { Check, X, Users, Upload } from "lucide-react";

interface Props {
  done: number;
  total: number;
  finished: boolean;
  created?: number;
  updated?: number;
  onClose: () => void;
}

export function ImportLoader({ done, total, finished, created, updated, onClose }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : (finished ? 100 : 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <style>{`
        .imp-scene { perspective: 900px; perspective-origin: 50% 40%; }
        @keyframes imp-spin   { 0% { transform: rotateY(0deg);} 100% { transform: rotateY(360deg);} }
        @keyframes imp-bob    { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-9px);} }
        @keyframes imp-shadow { 0%,100% { transform: rotateX(72deg) scale(1); opacity:.45;} 50% { transform: rotateX(72deg) scale(.8); opacity:.28;} }
        @keyframes imp-gloss  { 0% { transform: translateX(-120%) rotate(8deg);} 60%,100% { transform: translateX(220%) rotate(8deg);} }
        .imp-bob  { animation: imp-bob 2.6s ease-in-out infinite; transform-style: preserve-3d; }
        .imp-coin {
          width: 100px; height: 100px; border-radius: 22px;
          transform-style: preserve-3d; animation: imp-spin 2.8s cubic-bezier(.45,.05,.55,.95) infinite;
          background: radial-gradient(120% 120% at 30% 22%, #ffb066 0%, #f97316 45%, #c2410c 100%);
          box-shadow: inset 0 4px 10px rgba(255,255,255,.45), inset 0 -10px 16px rgba(0,0,0,.30), 0 18px 30px rgba(249,115,22,.45);
          position: relative; overflow: hidden; display:flex; align-items:center; justify-content:center;
        }
        .imp-gloss { position:absolute; top:-20%; left:0; width:45%; height:140%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          filter: blur(2px); animation: imp-gloss 2.8s ease-in-out infinite; }
        .imp-floor { width: 92px; height: 92px; margin: -30px auto 0; border-radius:50%;
          background: radial-gradient(closest-side, rgba(0,0,0,.5), transparent 72%); filter: blur(3px);
          animation: imp-shadow 2.8s ease-in-out infinite; }
      `}</style>

      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>

        <div className="imp-scene mx-auto mb-5 mt-2 h-32 w-full">
          <div className="relative mx-auto h-full w-[140px] flex flex-col items-center justify-center">
            {finished ? (
              <div className="flex h-[100px] w-[100px] items-center justify-center rounded-[22px]"
                style={{ background: "radial-gradient(120% 120% at 30% 22%, #ffb066, #f97316 50%, #c2410c)", boxShadow: "inset 0 4px 10px rgba(255,255,255,.45), 0 18px 30px rgba(249,115,22,.45)" }}>
                <Check className="h-12 w-12 text-white drop-shadow" strokeWidth={3} />
              </div>
            ) : (
              <div className="imp-bob">
                <div className="imp-coin">
                  <span className="imp-gloss" />
                  <div className="relative flex items-center gap-0.5">
                    <Users className="h-9 w-9 text-white drop-shadow" />
                    <Upload className="h-5 w-5 text-white/90 -ml-1 -mt-3" />
                  </div>
                </div>
              </div>
            )}
            <div className="imp-floor" />
          </div>
        </div>

        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold">
            {finished ? "¡Importación completada!" : "Importando contactos…"}
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#f97316,#c2410c)", boxShadow: "0 0 10px rgba(249,115,22,.6)" }} />
          </div>
          {finished ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-600">{created ?? 0}</span> nuevos · <span className="font-semibold text-blue-600">{updated ?? 0}</span> actualizados
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{done} de {total} · {pct}%</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {finished ? "Listo. Tus leads ya están en el CRM." : "Se importa en segundo plano — puedes cerrar y seguir trabajando."}
          </p>
          <button onClick={onClose} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
            {finished ? "Cerrar" : "Cerrar (seguir en segundo plano)"}
          </button>
        </div>
      </div>
    </div>
  );
}
