/**
 * WhatsAppSendLoader — overlay shown while a bulk WhatsApp campaign sends.
 * A real CSS-3D scene: a glossy WhatsApp coin spinning in perspective with a
 * projected floor shadow that foreshortens with the spin, plus depth-blurred chat
 * bubbles. The send runs in the backend, so the user can CLOSE this anytime and it
 * keeps sending; the overlay only closes when the user closes it.
 */
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  done: number;
  total: number;
  finished: boolean;
  onClose: () => void;
}

export function WhatsAppSendLoader({ done, total, finished, onClose }: Props) {
  const { t } = useTranslation();
  // Clamp so the counter never shows more than the total (e.g. "51 de 50 · 102%").
  // Upstream `done` can tick one past `total` on the final status callback.
  const shownDone = total > 0 ? Math.min(done, total) : done;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <style>{`
        .wa-scene { perspective: 900px; perspective-origin: 50% 40%; }
        .wa-stage { transform-style: preserve-3d; }

        @keyframes wa-spin   { 0% { transform: rotateY(0deg);   } 100% { transform: rotateY(360deg); } }
        @keyframes wa-bob    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes wa-shadow { 0%,100% { transform: rotateX(72deg) scale(1);   opacity:.45; }
                               50%     { transform: rotateX(72deg) scale(.78);  opacity:.28; } }
        @keyframes wa-gloss  { 0% { transform: translateX(-120%) rotate(8deg);} 60%,100% { transform: translateX(220%) rotate(8deg);} }
        @keyframes wa-bub    { 0% { transform: translateY(14px) translateZ(var(--z)) scale(.5); opacity:0; }
                               25% { opacity:1; } 100% { transform: translateY(-34px) translateZ(var(--z)) scale(1); opacity:0; } }

        .wa-coin-bob { animation: wa-bob 2.6s ease-in-out infinite; transform-style: preserve-3d; }
        .wa-coin {
          width: 104px; height: 104px; border-radius: 50%;
          transform-style: preserve-3d;
          animation: wa-spin 2.8s cubic-bezier(.45,.05,.55,.95) infinite;
          background:
            radial-gradient(120% 120% at 30% 22%, #4ef08b 0%, #25D366 42%, #128C7E 78%, #0b5e51 100%);
          box-shadow:
            inset 0 4px 10px rgba(255,255,255,.45),
            inset 0 -10px 16px rgba(0,0,0,.35),
            0 18px 30px rgba(18,140,126,.45);
          position: relative; overflow: hidden;
          display:flex; align-items:center; justify-content:center;
        }
        /* rim highlight */
        .wa-coin::after {
          content:""; position:absolute; inset:0; border-radius:50%;
          box-shadow: inset 0 0 0 3px rgba(255,255,255,.18);
          pointer-events:none;
        }
        /* sweeping gloss */
        .wa-gloss {
          position:absolute; top:-20%; left:0; width:45%; height:140%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          filter: blur(2px); animation: wa-gloss 2.8s ease-in-out infinite;
        }
        .wa-floor {
          width: 96px; height: 96px; margin: -34px auto 0;
          border-radius: 50%;
          background: radial-gradient(closest-side, rgba(0,0,0,.5), transparent 72%);
          filter: blur(3px);
          animation: wa-shadow 2.8s ease-in-out infinite;
        }
        .wa-bub {
          position:absolute; border-radius: 50% 50% 50% 4px;
          background: linear-gradient(135deg,#dcffe4,#a7f3c4);
          box-shadow: 0 6px 12px rgba(0,0,0,.18);
          animation: wa-bub 2.4s ease-in-out infinite;
        }
      `}</style>

      <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("whatsAppSendLoader.close")}>
          <X className="h-4 w-4" />
        </button>

        {/* 3D scene */}
        <div className="wa-scene mx-auto mb-6 mt-3 h-36 w-full">
          <div className="wa-stage relative mx-auto h-full w-[160px]">
            {/* floating chat bubbles (depth) */}
            {!finished && (
              <>
                <span className="wa-bub" style={{ left: "18px", top: "26px", width: 16, height: 16, ["--z" as any]: "40px", animationDelay: "0s" }} />
                <span className="wa-bub" style={{ right: "16px", top: "14px", width: 12, height: 12, ["--z" as any]: "10px", animationDelay: ".5s", filter: "blur(.4px)" }} />
                <span className="wa-bub" style={{ right: "26px", top: "40px", width: 10, height: 10, ["--z" as any]: "-30px", animationDelay: "1s", filter: "blur(1px)", opacity: .8 }} />
              </>
            )}

            {finished ? (
              <div className="flex h-full flex-col items-center justify-center">
                <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full"
                  style={{ background: "radial-gradient(120% 120% at 30% 22%, #4ef08b, #25D366 50%, #128C7E)", boxShadow: "inset 0 4px 10px rgba(255,255,255,.45), 0 18px 30px rgba(18,140,126,.45)" }}>
                  <Check className="h-12 w-12 text-white drop-shadow" strokeWidth={3} />
                </div>
                <div className="wa-floor" />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <div className="wa-coin-bob">
                  <div className="wa-coin">
                    <span className="wa-gloss" />
                    {/* WhatsApp glyph */}
                    <svg viewBox="0 0 32 32" className="h-12 w-12 relative" fill="#fff" style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }}>
                      <path d="M16 3C9.1 3 3.5 8.6 3.5 15.5c0 2.4.7 4.6 1.8 6.5L3 29l7.2-2.3c1.8 1 3.9 1.6 6 1.6 6.9 0 12.5-5.6 12.5-12.5S22.9 3 16 3zm0 22.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.3 1.4 1.4-4.2-.3-.4c-1.1-1.7-1.6-3.6-1.6-5.6C5.6 9.7 10.3 5 16 5s10.4 4.7 10.4 10.5S21.7 25.8 16 25.8zm5.8-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7.1-.1.3-.4.5-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z"/>
                    </svg>
                  </div>
                </div>
                <div className="wa-floor" />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold">
            {finished ? t("whatsAppSendLoader.sendCompleted") : t("whatsAppSendLoader.sendingMessages")}
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#25D366,#128C7E)", boxShadow: "0 0 10px rgba(37,211,102,.6)" }} />
          </div>
          <p className="text-xs text-muted-foreground">{t("whatsAppSendLoader.progress", { done: shownDone, total, pct })}</p>
          <p className="text-[11px] text-muted-foreground">
            {finished ? t("whatsAppSendLoader.canCloseWindow") : t("whatsAppSendLoader.sendsInBackground")}
          </p>
          <button onClick={onClose} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
            {finished ? t("whatsAppSendLoader.close") : t("whatsAppSendLoader.closeKeepBackground")}
          </button>
        </div>
      </div>
    </div>
  );
}
