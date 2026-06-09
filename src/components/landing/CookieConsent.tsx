import { useState, useEffect } from "react";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { Shield } from "lucide-react";

const STORAGE_KEY = "klosify_cookie_consent";

type ConsentState = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  decided: boolean;
};

function getStored(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const stored = getStored();
    if (!stored?.decided) {
      // Small delay so the page loads first
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  function save(prefs: boolean, anlx: boolean) {
    const consent: ConsentState = {
      necessary: true,
      preferences: prefs,
      analytics: anlx,
      decided: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm" />

      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-[999] p-4 sm:p-6 flex justify-center">
        <div className="w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
            <div className="flex items-center gap-2">
              <KlosifyLogo size={22} />
              <span className="font-bold text-sm text-white tracking-tight">
                Klosify <span className="text-orange-400">CRM</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Shield className="w-3.5 h-3.5" />
              Privacidad
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              Usamos cookies para mejorar tu experiencia, medir el rendimiento y
              personalizar el contenido. Puedes elegir qué aceptar.{" "}
              <a
                href="/privacidad"
                className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
              >
                Política de privacidad
              </a>
              .
            </p>

            {/* Toggles */}
            <div className="mt-4 space-y-3">
              <Toggle
                label="Necesarias"
                description="Sesión, autenticación y seguridad."
                checked={true}
                disabled
              />
              <Toggle
                label="Preferencias"
                description="Recordar idioma y configuración de UI."
                checked={preferences}
                onChange={setPreferences}
              />
              <Toggle
                label="Analítica"
                description="Estadísticas anónimas de uso (sin datos personales)."
                checked={analytics}
                onChange={setAnalytics}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button
              onClick={() => save(true, true)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{
                background: "linear-gradient(90deg, #FF8C00, #E8460E)",
              }}
            >
              Aceptar todo
            </button>
            <button
              onClick={() => save(preferences, analytics)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/15 transition-colors"
            >
              Guardar selección
            </button>
            <button
              onClick={() => save(false, false)}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Toggle row ── */
function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={`relative mt-0.5 shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? "bg-orange-500" : "bg-white/15"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
