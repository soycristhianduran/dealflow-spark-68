import { useState, lazy, Suspense, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, Check, Loader2, Users, Gift, Zap, ArrowRight, Bot, MessageCircle, GitBranch, Mail, Calendar, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";

const Mascot3D = lazy(() => import("@/components/Mascot3D"));

// Country dial codes — LatAm first (the target audience), then a few common
// others. `code` is the dial prefix stored with the number; `flag` is shown.
const DIAL_CODES = [
  { c: "CO", flag: "🇨🇴", code: "+57", name: "Colombia" },
  { c: "MX", flag: "🇲🇽", code: "+52", name: "México" },
  { c: "AR", flag: "🇦🇷", code: "+54", name: "Argentina" },
  { c: "PE", flag: "🇵🇪", code: "+51", name: "Perú" },
  { c: "CL", flag: "🇨🇱", code: "+56", name: "Chile" },
  { c: "EC", flag: "🇪🇨", code: "+593", name: "Ecuador" },
  { c: "VE", flag: "🇻🇪", code: "+58", name: "Venezuela" },
  { c: "GT", flag: "🇬🇹", code: "+502", name: "Guatemala" },
  { c: "CR", flag: "🇨🇷", code: "+506", name: "Costa Rica" },
  { c: "PA", flag: "🇵🇦", code: "+507", name: "Panamá" },
  { c: "DO", flag: "🇩🇴", code: "+1", name: "Rep. Dominicana" },
  { c: "BO", flag: "🇧🇴", code: "+591", name: "Bolivia" },
  { c: "PY", flag: "🇵🇾", code: "+595", name: "Paraguay" },
  { c: "UY", flag: "🇺🇾", code: "+598", name: "Uruguay" },
  { c: "HN", flag: "🇭🇳", code: "+504", name: "Honduras" },
  { c: "SV", flag: "🇸🇻", code: "+503", name: "El Salvador" },
  { c: "NI", flag: "🇳🇮", code: "+505", name: "Nicaragua" },
  { c: "US", flag: "🇺🇸", code: "+1", name: "Estados Unidos" },
  { c: "ES", flag: "🇪🇸", code: "+34", name: "España" },
];

// Core product pillars shown on the waitlist page.
const FEATURES = [
  { icon: Bot, title: "Agente de IA que vende", desc: "Responde, califica y cierra ventas por ti en WhatsApp, Instagram y Facebook, 24/7." },
  { icon: MessageCircle, title: "Bandeja única", desc: "WhatsApp, Instagram y Messenger en un solo inbox. Nunca pierdas un mensaje." },
  { icon: GitBranch, title: "CRM y pipelines", desc: "Organiza tus leads por etapas y mira en qué punto está cada venta." },
  { icon: Zap, title: "Automatizaciones", desc: "Comentarios, DMs y seguimientos automáticos sin mover un dedo." },
  { icon: Mail, title: "Email marketing", desc: "Campañas y secuencias para nutrir y reactivar a tus contactos." },
  { icon: Calendar, title: "Agendamiento", desc: "Tus leads reservan citas solos y se sincronizan con tu calendario." },
  { icon: BarChart3, title: "Reportes en vivo", desc: "Mide conversaciones, leads y ventas en tiempo real." },
  { icon: Sparkles, title: "Anuncios conectados", desc: "Tus leads de Facebook e Instagram Ads entran directo al CRM." },
];

/**
 * Klosify VIP launch waitlist — "solo para amigos".
 * Standalone, intentionally separate from the sales HomePage. Captures
 * Nombre + WhatsApp + Email through the public `waitlist-join` edge function.
 */
export default function WaitlistVIPPage() {
  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState("+57");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [already, setAlready] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Klosify VIP — Lista de espera exclusiva";
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Escribe tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Escribe un correo válido.");
    setStatus("loading");
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("waitlist-join", {
        body: {
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim() ? `${dialCode} ${whatsapp.trim()}` : "",
          locale: navigator.language || null,
          referrer: document.referrer || null,
        },
      });
      if (fnErr || (data as any)?.error) {
        setStatus("idle");
        setError("No pudimos guardarte. Revisa tus datos e inténtalo de nuevo.");
        return;
      }
      setAlready(!!(data as any)?.already);
      setStatus("done");
    } catch {
      setStatus("idle");
      setError("Algo salió mal. Inténtalo de nuevo.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a12] text-white antialiased">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-orange-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[32rem] w-[32rem] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      {/* ── Nav ── */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <KlosifyLogo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">Klosify</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-orange-300 backdrop-blur">
          <Lock className="h-3 w-3" /> Acceso por invitación
        </span>
      </header>

      {/* ── Hero ── */}
      <main className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-24 pt-6 lg:grid-cols-2 lg:gap-6 lg:pt-10">
        {/* Left — copy + form */}
        <div className="order-2 lg:order-1">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-orange-300">
              <Sparkles className="h-3.5 w-3.5" /> Lista VIP · Solo para amigos
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Sé de los{" "}
              <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-purple-500 bg-clip-text text-transparent">
                primeros
              </span>{" "}
              en conocer Klosify
            </h1>

            <p className="mt-4 max-w-md text-lg font-semibold text-white/90">
              Todo tu stack de marketing y ventas, en un solo lugar.
            </p>

            <p className="mt-3 max-w-md text-base leading-relaxed text-slate-300/90">
              Estamos abriendo el acceso poco a poco, <b className="text-white">solo para un grupo cercano</b>.
              Únete a la lista de espera exclusiva y sé el primero en probar el CRM con IA que cierra
              ventas por WhatsApp, Instagram y Facebook por ti.
            </p>

            {/* Form / success */}
            <div className="mt-8 max-w-md">
              <AnimatePresence mode="wait">
                {status === "done" ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 backdrop-blur"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
                      <Check className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold">
                      {already ? "¡Ya estabas en la lista! 🎉" : "¡Estás dentro! 🎉"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                      Te avisaremos por WhatsApp y correo en cuanto abramos tu acceso VIP.
                      Mientras tanto, guárdalo: esto va a estar bueno. 🔥
                    </p>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={submit}
                    className="space-y-3"
                  >
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      autoComplete="name"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-orange-500/60 focus:bg-white/[0.09]"
                    />
                    <div className="flex gap-2">
                      <div className="relative shrink-0">
                        <select
                          value={dialCode}
                          onChange={(e) => setDialCode(e.target.value)}
                          aria-label="Código de país"
                          className="h-full appearance-none rounded-xl border border-white/10 bg-white/[0.06] py-3.5 pl-3 pr-8 text-sm text-white outline-none transition focus:border-orange-500/60 focus:bg-white/[0.09]"
                        >
                          {DIAL_CODES.map((d) => (
                            <option key={d.c} value={d.code} className="bg-[#14141f] text-white">
                              {d.flag} {d.code} {d.name}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
                      </div>
                      <input
                        type="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d\s]/g, ""))}
                        placeholder="Tu WhatsApp"
                        autoComplete="tel-national"
                        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-orange-500/60 focus:bg-white/[0.09]"
                      />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Tu correo"
                      autoComplete="email"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-sm text-white placeholder:text-slate-400 outline-none transition focus:border-orange-500/60 focus:bg-white/[0.09]"
                    />

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:shadow-orange-500/50 disabled:opacity-70"
                    >
                      {status === "loading" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
                        </>
                      ) : (
                        <>
                          Quiero mi acceso VIP
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-xs text-slate-500">
                      Cupos limitados · Sin spam · Cancela cuando quieras
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Perks */}
            <div className="mt-9 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: Zap, label: "Acceso anticipado" },
                { icon: Gift, label: "Beneficios de fundador" },
                { icon: Users, label: "Comunidad cercana" },
              ].map((p) => (
                <div
                  key={p.label}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
                >
                  <p.icon className="h-4 w-4 shrink-0 text-orange-400" />
                  <span className="text-xs font-medium text-slate-300">{p.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right — mascot */}
        <div className="order-1 flex justify-center lg:order-2">
          <div className="relative h-[300px] w-[300px] sm:h-[380px] sm:w-[380px] lg:h-[460px] lg:w-[460px]">
            <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-[80px]" />
            <motion.div
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative h-full w-full"
            >
              <Suspense
                fallback={
                  <img
                    src="/mascot.png"
                    alt="Mascota de Klosify"
                    className="h-full w-full object-contain drop-shadow-2xl"
                  />
                }
              >
                <Mascot3D />
              </Suspense>
            </motion.div>
          </div>
        </div>
      </main>

      {/* ── Features ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Todo tu stack de marketing y ventas,{" "}
            <span className="bg-gradient-to-r from-orange-400 to-purple-500 bg-clip-text text-transparent">
              en un solo lugar
            </span>
          </h2>
          <p className="mt-4 text-base text-slate-300/90">
            Deja de pagar 5 herramientas distintas. Klosify reúne todo lo que necesitas para
            atraer, atender y cerrar clientes.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 transition hover:border-orange-500/30 hover:bg-white/[0.05]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 transition group-hover:bg-orange-500/25">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/30 transition hover:shadow-orange-500/50"
          >
            Quiero mi acceso VIP
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Klosify · Hecho con 🧡 para nuestros amigos ·{" "}
        <Link to="/privacidad" className="underline hover:text-slate-300">
          Privacidad
        </Link>
      </footer>
    </div>
  );
}
