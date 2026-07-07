/**
 * AgentGuidePage — public, brand-styled step-by-step guide for configuring the
 * AI agent. Served at /guia-agente-chat so it can be linked from the agent
 * config page and shared with any Klosify user. The markup lives in
 * agentGuide.html (imported raw) to keep the exact hand-tuned design; the copy
 * buttons are wired up here.
 */
import { useEffect, useRef } from "react";
import guideHtml from "./agentGuide.html?raw";

export default function AgentGuidePage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Guía del Agente IA · Klosify";
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest(".copy") as HTMLElement | null;
      if (!btn) return;
      const pre = btn.closest(".tmpl")?.querySelector("pre");
      if (!pre) return;
      const done = () => {
        const orig = btn.textContent;
        btn.textContent = "Copiado";
        setTimeout(() => { btn.textContent = orig; }, 1400);
      };
      const txt = (pre as HTMLElement).innerText;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(txt).then(done).catch(done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        document.body.removeChild(ta); done();
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#FBF9F6" }}>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: guideHtml }} />
    </div>
  );
}
