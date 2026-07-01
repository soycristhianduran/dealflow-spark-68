import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// ── Canonical CRM host guard ──────────────────────────────────────────────
// klosify.com = sales landing; app.klosify.com = the CRM application.
// Both domains point to the same deployment, so a CRM route (e.g. /w/:slug/...)
// loaded on the apex klosify.com still renders — but the Facebook JS SDK is only
// allowlisted for app.klosify.com, and we want a single canonical CRM origin.
// Redirect any CRM (workspace) route hit on the apex over to app.klosify.com,
// while leaving the marketing landing (/, /pricing, /privacy, …) on klosify.com.
(() => {
  try {
    const host = window.location.hostname;
    const isApexKlosify = host === "klosify.com" || host === "www.klosify.com";
    const isCrmRoute = window.location.pathname.startsWith("/w/");
    if (isApexKlosify && isCrmRoute) {
      const target =
        "https://app.klosify.com" +
        window.location.pathname +
        window.location.search +
        window.location.hash;
      window.location.replace(target);
      return; // stop bootstrapping; the redirect navigates away
    }
  } catch (_) {
    // non-browser / unexpected env — fall through and render normally
  }

  createRoot(document.getElementById("root")!).render(<App />);

  // Register the PWA service worker (install + push) on secure origins.
  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
})();
