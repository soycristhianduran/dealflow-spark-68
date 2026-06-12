/**
 * SendingLoader3D — full-screen overlay shown while a bulk WhatsApp send runs.
 * A CSS 3D rotating cube (brand colors) + live progress. Pure CSS, no 3D libs.
 */
interface Props {
  done: number;
  total: number;
  label?: string;
}

export function SendingLoader3D({ done, total, label = "Enviando WhatsApp" }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background/70 backdrop-blur-sm">
      <style>{`
        @keyframes klosify-cube-spin {
          0%   { transform: rotateX(-25deg) rotateY(0deg); }
          100% { transform: rotateX(-25deg) rotateY(360deg); }
        }
        @keyframes klosify-cube-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-10px); }
        }
        .klosify-scene { perspective: 600px; }
        .klosify-cube {
          position: relative; width: 72px; height: 72px;
          transform-style: preserve-3d;
          animation: klosify-cube-spin 2.6s linear infinite;
        }
        .klosify-face {
          position: absolute; width: 72px; height: 72px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px; border: 1px solid rgba(255,255,255,0.25);
          box-shadow: 0 0 24px rgba(249,115,22,0.35);
        }
        .klf-front  { background: linear-gradient(135deg,#f97316,#fb923c); transform: translateZ(36px); }
        .klf-back   { background: linear-gradient(135deg,#ea580c,#f97316); transform: rotateY(180deg) translateZ(36px); }
        .klf-right  { background: linear-gradient(135deg,#fb923c,#fbbf24); transform: rotateY(90deg) translateZ(36px); }
        .klf-left   { background: linear-gradient(135deg,#f59e0b,#f97316); transform: rotateY(-90deg) translateZ(36px); }
        .klf-top    { background: linear-gradient(135deg,#fdba74,#f97316); transform: rotateX(90deg) translateZ(36px); }
        .klf-bottom { background: linear-gradient(135deg,#c2410c,#ea580c); transform: rotateX(-90deg) translateZ(36px); }
      `}</style>

      <div className="klosify-scene" style={{ animation: "klosify-cube-float 2.6s ease-in-out infinite" }}>
        <div className="klosify-cube">
          <div className="klosify-face klf-front" />
          <div className="klosify-face klf-back" />
          <div className="klosify-face klf-right" />
          <div className="klosify-face klf-left" />
          <div className="klosify-face klf-top" />
          <div className="klosify-face klf-bottom" />
        </div>
      </div>

      <div className="w-full max-w-xs space-y-3 text-center">
        <p className="text-sm font-semibold text-foreground">{label}…</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{done} de {total} · {pct}%</p>
      </div>
    </div>
  );
}
