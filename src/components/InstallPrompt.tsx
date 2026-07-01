import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * InstallPrompt — lightweight "Install app" banner. On Android/desktop Chrome it
 * uses the native beforeinstallprompt. Dismissible; won't nag once dismissed or
 * already installed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("klosify_install_dismissed")) return;
    // Already running as an installed PWA → nothing to prompt.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setShow(false));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setShow(false); setDeferred(null);
  };
  const dismiss = () => { setShow(false); localStorage.setItem("klosify_install_dismissed", "1"); };

  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 shadow-2xl md:left-4 md:right-auto">
      <img src="/icon-192.png" alt="Klosify" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Instala Klosify</p>
        <p className="text-[11px] text-muted-foreground">Ábrelo como app, con ícono en tu pantalla de inicio.</p>
      </div>
      <button onClick={install} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
        <Download className="h-3.5 w-3.5" /> Instalar
      </button>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
