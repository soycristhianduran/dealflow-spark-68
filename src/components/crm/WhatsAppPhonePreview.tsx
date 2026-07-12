/**
 * Vista previa estilo iPhone de cómo se verá una plantilla/flow en WhatsApp.
 * 100% CSS — sin imágenes externas.
 */
export function WhatsAppPhonePreview({
  headerType,
  headerText,
  headerPreview,
  bodyText,
  footerText,
  buttons,
  variableExamples,
}: {
  headerType?: string;
  headerText?: string;
  headerPreview?: string; // object URL de la imagen subida
  bodyText: string;
  footerText?: string;
  buttons?: string[];
  variableExamples?: string[];
}) {
  const now = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Sustituir {{N}} por ejemplos (o dejarlas resaltadas)
  const renderBody = (text: string) => {
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((p, i) => {
      const m = p.match(/^\{\{(\d+)\}\}$/);
      if (m) {
        const ex = variableExamples?.[parseInt(m[1], 10) - 1];
        return ex
          ? <strong key={i}>{ex}</strong>
          : <span key={i} className="text-sky-600 font-medium">{p}</span>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  const btns = (buttons ?? []).filter(b => b && b.trim());

  return (
    <div className="mx-auto w-[270px] select-none">
      {/* Marco del teléfono */}
      <div className="rounded-[44px] border-[3px] border-zinc-500/70 bg-zinc-800 p-[7px] shadow-2xl"
        style={{ background: "linear-gradient(145deg,#3a3a3e,#1c1c1f)" }}>
        <div className="relative overflow-hidden rounded-[37px] bg-[#0b141a]">
          {/* Isla dinámica */}
          <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />

          {/* Barra de estado + header del chat */}
          <div className="bg-[#1f2c34] pb-2 pt-3">
            <div className="flex items-center justify-between px-6 pt-1 text-[10px] font-semibold text-white/90">
              <span>{time}</span>
              <span className="tracking-tight">▂▄▆ 📶 🔋</span>
            </div>
            <div className="mt-2 flex items-center gap-2 px-3">
              <span className="text-[#8696a0] text-sm">‹</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">B</div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white leading-tight">Tu negocio</p>
                <p className="text-[9px] text-[#8696a0] leading-tight">en línea</p>
              </div>
            </div>
          </div>

          {/* Fondo del chat (patrón doodle simulado) */}
          <div
            className="min-h-[430px] max-h-[460px] overflow-y-auto px-2.5 py-3 space-y-1"
            style={{
              backgroundColor: "#0b141a",
              backgroundImage:
                "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.025) 0 8px, transparent 9px)," +
                "radial-gradient(circle at 70% 60%, rgba(255,255,255,0.02) 0 6px, transparent 7px)," +
                "radial-gradient(circle at 45% 85%, rgba(255,255,255,0.02) 0 7px, transparent 8px)",
              backgroundSize: "110px 110px, 90px 90px, 130px 130px",
            }}
          >
            {/* Burbuja entrante */}
            <div className="relative max-w-[92%] rounded-lg rounded-tl-none bg-[#1f2c34] p-1.5 shadow">
              {/* Encabezado */}
              {headerType === "IMAGE" && (
                headerPreview
                  ? <img src={headerPreview} alt="" className="mb-1.5 h-28 w-full rounded-md object-cover" />
                  : <div className="mb-1.5 flex h-28 w-full items-center justify-center rounded-md bg-[#2a3942] text-2xl">🖼️</div>
              )}
              {headerType === "VIDEO" && (
                <div className="mb-1.5 flex h-28 w-full items-center justify-center rounded-md bg-[#2a3942] text-2xl">▶️</div>
              )}
              {headerType === "TEXT" && headerText && (
                <p className="px-1 pt-0.5 text-[12px] font-bold text-white">{headerText}</p>
              )}

              {/* Cuerpo */}
              <p className="whitespace-pre-wrap px-1 py-0.5 text-[12px] leading-snug text-[#e9edef]">
                {bodyText ? renderBody(bodyText) : <span className="italic text-[#8696a0]">Escribe el cuerpo del mensaje…</span>}
              </p>

              {/* Pie */}
              {footerText && <p className="px-1 text-[10px] text-[#8696a0]">{footerText}</p>}

              <p className="px-1 pb-0.5 text-right text-[9px] text-[#8696a0]">{time}</p>
            </div>

            {/* Botones */}
            {btns.length > 0 && (
              <div className="max-w-[92%] space-y-[3px] pt-[3px]">
                {btns.map((b, i) => (
                  <div key={i} className="rounded-lg bg-[#1f2c34] py-1.5 text-center text-[12px] font-medium text-[#53bdeb] shadow">
                    {b}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Barra de entrada */}
          <div className="flex items-center gap-1.5 bg-[#1f2c34] px-2.5 py-2">
            <span className="text-[#8696a0] text-sm">＋</span>
            <div className="flex-1 rounded-full bg-[#2a3942] px-3 py-1 text-[10px] text-[#8696a0]">Mensaje</div>
            <span className="text-[#8696a0] text-xs">📷 🎤</span>
          </div>

          {/* Indicador home */}
          <div className="flex justify-center bg-[#1f2c34] pb-1.5">
            <div className="h-1 w-24 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
