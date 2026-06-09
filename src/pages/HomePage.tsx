import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  MessageCircle, BarChart3, Brain, GitBranch, Check, X, Menu, Shield,
  TrendingUp, Layout, Plus, Minus, Zap, Sparkles, Star, BadgePercent,
  Target, Rocket, UserPlus, Heart, ArrowRight, Users, Activity, ChevronRight, Loader2, Bot,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem { q: string; a: string }
interface Plan {
  id: string;
  name: string; monthly: number; annual: number; desc: string;
  features: string[]; notIncluded: string[]; cta: string; popular: boolean;
}
interface AddOn { icon: LucideIcon; label: string; price: string; iconColor: string; iconBg: string }
interface StackTool { domain: string; name: string; price: string; brandColor: string }
interface IntegrationLogo { domain: string; name: string; brandColor: string }
interface Testimonial { quote: string; name: string; role: string; company: string; initials: string; color: string }

// ─── Data ─────────────────────────────────────────────────────────────────────

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter", monthly: 29, annual: 24,
    desc: "Para emprendedores que están comenzando",
    features: ["1 usuario", "500 contactos", "Pipeline, contactos y empresas", "Calendario y tareas", "3 landings con IA", "3 flujos de automatización", "WhatsApp Business nativo", "Meta Ads + ROAS", "Agente IA — 100 conversaciones/mes"],
    notIncluded: ["IA Boost (scoring)", "Detección de objeciones IA", "Automatizaciones de Instagram", "Email campaigns", "API access"],
    cta: "Empezar gratis", popular: false,
  },
  {
    id: "pro",
    name: "Pro", monthly: 39, annual: 32,
    desc: "Para equipos de ventas en crecimiento",
    features: ["3 usuarios incluidos", "+$9/seat adicional", "5.000 contactos", "Pipeline, contactos y empresas", "Calendario y tareas", "15 landings con IA", "Flujos ilimitados", "IA Boost — 1.000 análisis/mes", "Detección de objeciones IA", "Agente IA — 500 conversaciones/mes", "Agente de voz (llamadas)", "Automatizaciones de Instagram", "Email campaigns", "WhatsApp Business nativo", "Meta Ads + ROAS"],
    notIncluded: ["API access"],
    cta: "Comenzar ahora →", popular: true,
  },
  {
    id: "business",
    name: "Business", monthly: 89, annual: 74,
    desc: "Para agencias y equipos grandes",
    features: ["10 usuarios incluidos", "+$9/seat adicional", "Contactos ilimitados", "50 landings con IA", "IA Boost — 5.000 análisis/mes", "Agente IA — 2.500 conversaciones/mes", "Agente de voz (llamadas)", "Email campaigns", "API access", "Soporte prioritario + onboarding 1-on-1", "Todo lo del Pro"],
    notIncluded: [],
    cta: "Suscribirse ahora →", popular: false,
  },
];

const faqItems: FaqItem[] = [
  { q: "¿Necesito conocimientos técnicos?", a: "No. Klosify está diseñado para que cualquier persona lo configure en menos de 30 minutos, sin ayuda técnica." },
  { q: "¿Puedo conectar mi número de WhatsApp actual?", a: "Sí. Conectas tu número de WhatsApp Business API directamente. Si no tienes uno, te guiamos en la activación." },
  { q: "¿Qué pasa cuando se acaban mis créditos de IA?", a: "Puedes comprar paquetes adicionales desde $9 en cualquier momento, sin necesidad de cambiar de plan." },
  { q: "¿Hay contrato de permanencia?", a: "No. Cancela cuando quieras. Si cancelas, conservas el acceso hasta el final del período pagado." },
  { q: "¿Los precios son en dólares?", a: "Sí, en USD. Aceptamos tarjetas de crédito/débito internacionales a través de Stripe, de forma segura." },
  { q: "¿Puedo importar mis contactos actuales?", a: "Sí. Importa contactos desde Excel o CSV en segundos, sin límite de filas." },
];

const toolStack: StackTool[] = [
  { domain: "kommo.com",     name: "Kommo CRM",          price: "$50/mes", brandColor: "bg-blue-600"   },
  { domain: "webflow.com",   name: "Webflow (landings)",  price: "$23/mes", brandColor: "bg-rose-500"   },
  { domain: "zapier.com",    name: "Zapier Professional", price: "$69/mes", brandColor: "bg-orange-500" },
  { domain: "mailchimp.com", name: "Mailchimp Standard",  price: "$20/mes", brandColor: "bg-yellow-500" },
  { domain: "manychat.com",  name: "ManyChat Pro",        price: "$15/mes", brandColor: "bg-blue-500"   },
];

const klosifyIncludes = [
  "CRM completo (pipeline, contactos, empresas)", "Calendario y tareas", "Landings con IA", "Integraciones nativas (sin Zapier)",
  "Email campaigns", "Automatizaciones WhatsApp + Instagram", "Agente IA + Agente de voz", "WhatsApp Business nativo", "Meta Ads + ROAS",
];

const integrationLogos: IntegrationLogo[] = [
  { domain: "whatsapp.com",  name: "WhatsApp",  brandColor: "bg-green-600" },
  { domain: "meta.com",      name: "Meta Ads",  brandColor: "bg-blue-600"  },
  { domain: "instagram.com", name: "Instagram", brandColor: "bg-pink-600"  },
  { domain: "google.com",    name: "Google",    brandColor: "bg-blue-500"  },
  { domain: "stripe.com",    name: "Stripe",    brandColor: "bg-violet-600"},
];

const testimonials: Testimonial[] = [
  { quote: "El lead scoring de la IA nos cambió cómo priorizamos. En 2 semanas ya recuperamos la inversión.", name: "Carlos M.", role: "Director Comercial", company: "Agencia de ventas · Colombia", initials: "CM", color: "bg-blue-600" },
  { quote: "Teníamos Kommo, ManyChat y Zapier. Ahora solo usamos Klosify y pagamos menos de la mitad.", name: "Laura G.", role: "CEO", company: "E-commerce · México", initials: "LG", color: "bg-purple-600" },
  { quote: "El agente IA responde a las 2am cuando yo ya no puedo. Los leads llegan calificados a la mañana.", name: "Andrés T.", role: "Fundador", company: "Inmobiliaria · Bogotá", initials: "AT", color: "bg-teal-600" },
];

const addOns: AddOn[] = [
  { icon: Target,   label: "+1.000 IA Boost (análisis + objeciones)", price: "$19",   iconColor: "text-blue-600",   iconBg: "bg-blue-100"   },
  { icon: Rocket,   label: "+5.000 IA Boost (análisis + objeciones)", price: "$39",   iconColor: "text-orange-600", iconBg: "bg-orange-100" },
  { icon: UserPlus, label: "Seat adicional",  price: "$9/mes",iconColor: "text-teal-600",   iconBg: "bg-teal-100"   },
];

// ─── Animation helpers ────────────────────────────────────────────────────────

/** Fade-up / slide-in on scroll using IntersectionObserver */
function FadeUp({
  children, delay = 0, from = "bottom", className = "",
}: {
  children: React.ReactNode; delay?: number;
  from?: "bottom" | "left" | "right" | "scale"; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const hiddenTransform =
    from === "left"  ? "translateX(-36px)" :
    from === "right" ? "translateX(36px)"  :
    from === "scale" ? "scaleX(0)"         :
    "translateY(28px)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? (from === "scale" ? "scaleX(1)" : "none") : hiddenTransform,
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: "transform, opacity",
        transformOrigin: from === "scale" ? "left center" : undefined,
      }}
    >
      {children}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LogoWithFallback({
  domain, name, brandColor, size = "w-8 h-8",
}: { domain: string; name: string; brandColor: string; size?: string }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];
  if (attempt >= sources.length) {
    return (
      <div className={`${brandColor} ${size} rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0 select-none`}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img src={sources[attempt]} alt={name}
      className={`${size} rounded-lg object-contain flex-shrink-0 bg-white`}
      onError={() => setAttempt((a) => a + 1)} />
  );
}

function PipelineMockup() {
  const columns = [
    { label: "Nuevo",      dot: "bg-slate-500", count: 2, leads: [{ name: "María G.",  score: 7.4, value: "$2,400", hot: false }, { name: "Carlos P.", score: 6.1, value: "$1,800", hot: false }] },
    { label: "Calificado", dot: "bg-blue-500",  count: 2, leads: [{ name: "Juan M.",   score: 9.1, value: "$5,800", hot: true  }, { name: "Ana S.",    score: 8.8, value: "$3,200", hot: true  }] },
    { label: "Cerrado",    dot: "bg-orange-500",count: 1, leads: [{ name: "Luis F.",   score: 9.6, value: "$8,500", hot: true  }] },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-orange-500/10 rounded-3xl blur-3xl pointer-events-none" />
      <div className="relative bg-slate-900 rounded-2xl border border-slate-700/80 overflow-hidden shadow-2xl shadow-slate-950/60">
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-950/60 border-b border-slate-800">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-slate-800/80 rounded px-3 py-1 text-xs text-slate-500 font-mono">
              app.klosify.com/w/<span className="text-slate-400">mi-empresa</span>/pipeline
            </div>
          </div>
          <div className="w-14" />
        </div>
        <div className="flex">
          <div className="w-10 bg-slate-950/40 border-r border-slate-800 py-4 flex flex-col items-center gap-3">
            {[BarChart3, Users, MessageCircle, Layout].map((Icon, i) => (
              <div key={i} className={`p-1.5 rounded-md ${i === 0 ? "bg-orange-500/20 text-orange-400" : "text-slate-600"}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white text-sm font-semibold">Pipeline Q2 2026</p>
                <p className="text-slate-500 text-xs">8 leads activos · <span className="text-green-400">+23% vs Q1</span></p>
              </div>
              <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg px-2.5 py-1.5">
                <Brain className="w-3 h-3 text-orange-400" />
                <span className="text-xs text-orange-400 font-medium">IA Boost on</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {columns.map((col) => (
                <div key={col.label}>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                    <span className="text-xs font-semibold text-slate-400">{col.label}</span>
                    <span className="ml-auto text-xs text-slate-600 font-mono">{col.count}</span>
                  </div>
                  <div className="space-y-2">
                    {col.leads.map((lead) => (
                      <div key={lead.name} className={`rounded-lg p-2.5 border ${lead.hot && col.label === "Cerrado" ? "bg-orange-500/10 border-orange-500/30" : lead.hot ? "bg-slate-800/80 border-slate-700/60" : "bg-slate-800/40 border-slate-700/40"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-300">{lead.name}</span>
                          <span className={`text-xs font-bold font-mono ${lead.score >= 9 ? "text-green-400" : lead.score >= 7 ? "text-yellow-400" : "text-slate-500"}`}>{lead.score}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-mono">{lead.value}</span>
                          {lead.hot && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
              {[{ val: "$18.2k", label: "Pipeline", color: "text-white" }, { val: "3.4×", label: "ROAS", color: "text-orange-400" }, { val: "68%", label: "Win rate", color: "text-green-400" }].map((s) => (
                <div key={s.label} className="text-center">
                  <p className={`text-base font-black font-mono ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-slate-600">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Floating badge 1 — floats */}
      <div className="absolute -right-4 top-20 badge-float-a bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white leading-none mb-0.5">Nuevo lead</p>
            <p className="text-xs text-slate-400">Pedro V. via WhatsApp</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
        </div>
      </div>
      {/* Floating badge 2 — floats with offset phase */}
      <div className="absolute -left-5 bottom-20 badge-float-b bg-slate-800 border border-orange-500/30 rounded-xl p-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Brain className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white leading-none mb-0.5">IA Boost</p>
            <p className="text-xs text-slate-400">Score <span className="text-orange-400 font-bold font-mono">9.1</span> — Hot</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Marquee data ─────────────────────────────────────────────────────────────

const marqueeRow1 = [
  { icon: MessageCircle, label: "WhatsApp Business",     color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20"  },
  { icon: BarChart3,     label: "Meta Ads + ROAS",       color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20"   },
  { icon: Brain,         label: "IA Lead Scoring",       color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  { icon: Layout,        label: "Landings con IA",       color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { icon: TrendingUp,    label: "Pipeline Visual",       color: "text-teal-400",   bg: "bg-teal-500/10",   border: "border-teal-500/20"   },
  { icon: GitBranch,     label: "Automatizaciones",      color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/20"   },
  { icon: MessageCircle, label: "Instagram DMs",         color: "text-rose-400",   bg: "bg-rose-500/10",   border: "border-rose-500/20"   },
  { icon: Users,         label: "Multi-usuario",         color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/20"   },
];

const marqueeRow2 = [
  "Sin contratos de permanencia",
  "Soporte en español",
  "Datos cifrados 256-bit",
  "Setup en menos de 30 min",
  "Sin tarjeta de crédito",
  "API de WhatsApp oficial",
  "IA incluida en todos los planes",
  "Cancela cuando quieras",
  "Actualizaciones automáticas",
  "99.9% uptime garantizado",
];

function Marquee() {
  const doubled1 = [...marqueeRow1, ...marqueeRow1];
  const doubled2 = [...marqueeRow2, ...marqueeRow2];
  return (
    <div
      className="bg-slate-950 border-y border-slate-800/60 py-5 select-none overflow-hidden"
      style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}
    >
      {/* Row 1 — scrolls left */}
      <div className="marquee-left flex gap-3 w-max mb-3">
        {doubled1.map(({ icon: Icon, label, color, bg, border }, i) => (
          <div key={i} className={`flex items-center gap-2 ${bg} border ${border} rounded-full px-4 py-2 whitespace-nowrap`}>
            <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
            <span className="text-sm text-slate-300 font-medium">{label}</span>
          </div>
        ))}
      </div>
      {/* Row 2 — scrolls right */}
      <div className="marquee-right flex gap-3 w-max">
        {doubled2.map((label, i) => (
          <div key={i} className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/40 rounded-full px-4 py-2 whitespace-nowrap">
            <div className="w-1 h-1 rounded-full bg-orange-500/60 flex-shrink-0" />
            <span className="text-sm text-slate-500 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <FadeUp key={i} delay={i * 60}>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors">
              <span className="font-semibold text-slate-900 text-base">{item.q}</span>
              <span className="ml-4 flex-shrink-0 text-orange-500">
                {open === i ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              </span>
            </button>
            {open === i && (
              <div className="px-6 pb-5">
                <p className="text-slate-600 leading-relaxed">{item.a}</p>
              </div>
            )}
          </div>
        </FadeUp>
      ))}
    </div>
  );
}

function PlanCard({ plan, isAnnual, onCta, loading }: {
  plan: Plan; isAnnual: boolean; onCta: () => void; loading: boolean;
}) {
  const price = isAnnual ? plan.annual : plan.monthly;
  return (
    <div className={`relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${plan.popular ? "border-2 border-orange-500 shadow-2xl shadow-orange-500/10 md:scale-105 bg-white hover:shadow-orange-500/20" : "border border-slate-200 bg-white shadow-sm hover:shadow-lg"}`}>
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
            <Star className="w-3 h-3 fill-current" /> Más Popular
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
        <p className="text-sm text-slate-500">{plan.desc}</p>
      </div>
      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-black text-slate-900 font-mono">${price}</span>
          <span className="text-slate-500 mb-1">/mes</span>
        </div>
        {isAnnual && <p className="text-xs text-green-600 font-medium mt-1">Facturado anualmente · Ahorras ${(plan.monthly - plan.annual) * 12}/año</p>}
      </div>
      <button
        onClick={onCta}
        disabled={loading}
        className={`flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all mb-8 disabled:opacity-70 disabled:cursor-not-allowed ${plan.popular ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:from-orange-400 hover:to-orange-500" : "border-2 border-slate-200 text-slate-700 hover:border-orange-500 hover:text-orange-500"}`}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : plan.cta}
      </button>
      <div className="space-y-3 flex-1">
        {plan.features.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-slate-700">{f}</span>
          </div>
        ))}
        {plan.notIncluded.map((f, i) => (
          <div key={i} className="flex items-start gap-3 opacity-40">
            <X className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-slate-500 line-through">{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [stripePrices, setStripePrices] = useState<Record<string, { monthly: string | null; annual: string | null }>>({});
  const heroGlowRef  = useRef<HTMLDivElement>(null);
  const heroGridRef  = useRef<HTMLDivElement>(null);

  // Fetch Stripe price IDs from DB (public table, no auth needed)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, stripe_price_id_monthly, stripe_price_id_annual");
      if (data) {
        const map: Record<string, { monthly: string | null; annual: string | null }> = {};
        for (const p of data) map[p.id] = { monthly: p.stripe_price_id_monthly, annual: p.stripe_price_id_annual };
        setStripePrices(map);
      }
    })();
  }, []);

  async function startCheckout(planId: string) {
    // Not logged in → go to auth, then bounce to /pricing which handles checkout
    if (!session) {
      navigate(`/auth?plan=${planId}&interval=${isAnnual ? "annual" : "monthly"}`);
      return;
    }
    const prices = stripePrices[planId];
    const priceId = isAnnual ? prices?.annual : prices?.monthly;
    if (!priceId) {
      toast.error("Este plan no está disponible en este momento. Intenta más tarde.");
      return;
    }
    setCheckoutLoading(planId);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout-session", {
        body: { mode: "subscription", price_id: priceId, success_path: "/billing", cancel_path: "/billing" },
      });
      if (error || !data?.url) {
        toast.error("No se pudo iniciar el pago. Intenta de nuevo.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setCheckoutLoading(null);
    }
  }

  useEffect(() => {
    const fn = () => {
      const y = window.scrollY;
      setScrolled(y > 10);
      // Parallax — direct DOM for zero re-render cost
      if (heroGlowRef.current) heroGlowRef.current.style.transform = `translateY(${y * 0.35}px)`;
      if (heroGridRef.current) heroGridRef.current.style.transform = `translateY(${y * 0.18}px)`;
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  return (
    <>
      {/* ── Global keyframes ──────────────────────────────────────────────── */}
      <style>{`
        @keyframes hero-fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes hero-slide-right {
          from { opacity: 0; transform: translateX(48px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes badge-float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-10px); }
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%;   }
          50%       { background-position: 100% 50%; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes scan-line {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(400%);  }
        }

        /* Hero entrance — applied directly via class */
        .hero-anim { animation: hero-fade-up 0.75s cubic-bezier(0.16,1,0.3,1) both; }
        .hero-anim-right { animation: hero-slide-right 0.9s cubic-bezier(0.16,1,0.3,1) both; }

        /* Floating badges on product mockup */
        .badge-float-a { animation: badge-float 4s ease-in-out infinite; }
        .badge-float-b { animation: badge-float 4s ease-in-out infinite 2s; }

        /* Gradient headline */
        .gradient-text {
          background: linear-gradient(135deg, #fb923c 0%, #f97316 40%, #ea580c 70%, #fb923c 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradient-shift 4s ease infinite;
        }

        /* Shimmer CTA button */
        .shimmer-btn {
          background: linear-gradient(90deg, #f97316 0%, #fb923c 40%, #fed7aa 50%, #fb923c 60%, #f97316 100%);
          background-size: 250% auto;
          animation: shimmer 3s linear infinite;
        }
        .shimmer-btn:hover { animation-play-state: paused; background: #fb923c; }

        /* Scan line on mockup */
        .scan-line-track { position: relative; overflow: hidden; }
        .scan-line-track::after {
          content: '';
          position: absolute; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(249,115,22,0.4), transparent);
          animation: scan-line 4s linear infinite 1s;
          pointer-events: none;
        }

        /* Bento card hover — icon pulse */
        .bento-card:hover .bento-icon { transform: scale(1.12) rotate(-3deg); transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .bento-icon { transition: transform 0.3s ease; }

        /* Marquee infinite scroll */
        @keyframes marquee-left  { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-right { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .marquee-left  { animation: marquee-left  28s linear infinite; }
        .marquee-right { animation: marquee-right 32s linear infinite; }
        .marquee-left:hover, .marquee-right:hover { animation-play-state: paused; }

        /* Parallax hero layers (set via JS) */
        .hero-parallax-glow { will-change: transform; }
        .hero-parallax-grid { will-change: transform; }
      `}</style>

      <div className="min-h-screen bg-white font-sans antialiased">

        {/* ── NAVBAR ────────────────────────────────────────────────────────── */}
        <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-slate-950/95 border-b border-slate-800 shadow-lg" : "bg-slate-950/80 border-b border-slate-800/50"} backdrop-blur-md`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3 flex-shrink-0 group">
                <div className="group-hover:scale-105 transition-transform">
                  <KlosifyLogo size={36} />
                </div>
                <span className="text-white font-bold text-lg tracking-tight">
                  Klosify <span className="text-orange-500">CRM</span>
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-8">
                {[["features", "Funcionalidades"], ["pricing", "Precios"]].map(([id, label]) => (
                  <button key={id} onClick={() => scrollTo(id)} className="text-slate-400 hover:text-white text-sm font-medium transition-colors relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-orange-500 after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-200">
                    {label}
                  </button>
                ))}
              </div>

              <div className="hidden md:flex items-center gap-3">
                <Link to="/auth" className="text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg text-sm font-medium transition-all">
                  Iniciar sesión
                </Link>
                <Link to="/auth" className="shimmer-btn text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-orange-500/25">
                  Empezar gratis →
                </Link>
              </div>

              <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-slate-400 hover:text-white p-2 rounded-lg transition-colors" aria-label="Toggle menu">
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="md:hidden border-t border-slate-800 bg-slate-950">
              <div className="px-4 py-4 space-y-2">
                {[["features", "Funcionalidades"], ["pricing", "Precios"]].map(([id, label]) => (
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left text-slate-300 hover:text-white py-2 px-3 rounded-lg hover:bg-slate-800 text-sm font-medium">{label}</button>
                ))}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <Link to="/auth" onClick={() => setMobileOpen(false)} className="block text-center border border-slate-700 text-slate-300 py-2.5 px-4 rounded-lg text-sm font-medium">Iniciar sesión</Link>
                  <Link to="/auth" onClick={() => setMobileOpen(false)} className="block text-center bg-orange-500 text-white py-2.5 px-4 rounded-lg text-sm font-semibold">Empezar gratis →</Link>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <section className="bg-slate-950 pt-32 pb-20 relative overflow-hidden">
          <div ref={heroGlowRef} className="hero-parallax-glow absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.10),transparent_70%)] pointer-events-none" />
          <div ref={heroGridRef} className="hero-parallax-grid absolute inset-0 opacity-[0.025] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "64px 64px" }} />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

              {/* Left — copy, each child animated separately */}
              <div>
                <div className="hero-anim inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-7" style={{ animationDelay: "0ms" }}>
                  <Sparkles className="w-3.5 h-3.5" />
                  IA nativa · Agente 24/7 · WhatsApp + Instagram
                </div>

                <h1 className="hero-anim text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-[1.06] tracking-tight" style={{ animationDelay: "80ms" }}>
                  <span className="gradient-text">El CRM con IA</span>
                  <br />
                  que hace el trabajo fuerte.
                  <br />
                  Tu equipo solo cierra.
                </h1>

                <p className="hero-anim text-lg text-slate-400 mt-6 leading-relaxed max-w-lg" style={{ animationDelay: "180ms" }}>
                  Lead scoring automático, agente IA 24/7 en WhatsApp e Instagram, Meta Ads con
                  ROAS y pipeline visual — todo desde <span className="text-white font-semibold">$29/mes</span>.
                </p>

                <div className="hero-anim flex flex-col sm:flex-row items-start gap-4 mt-10" style={{ animationDelay: "280ms" }}>
                  <Link to="/auth" className="shimmer-btn inline-flex items-center gap-2 text-white px-7 py-3.5 rounded-xl text-base font-bold shadow-xl shadow-orange-500/25">
                    Crear cuenta gratis
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <button onClick={() => scrollTo("pricing")} className="inline-flex items-center gap-2 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-7 py-3.5 rounded-xl text-base font-semibold transition-all">
                    Ver planes <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="hero-anim flex flex-wrap items-center gap-x-5 gap-y-2 mt-7" style={{ animationDelay: "360ms" }}>
                  {["Sin tarjeta de crédito", "7 días gratis", "Cancela cuando quieras"].map((b) => (
                    <div key={b} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      <span className="text-sm text-slate-500">{b}</span>
                    </div>
                  ))}
                </div>

                <div className="hero-anim mt-10 pt-8 border-t border-slate-800/60" style={{ animationDelay: "440ms" }}>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-4">Se integra con</p>
                  <div className="flex items-center gap-5 flex-wrap">
                    {integrationLogos.map((logo, i) => (
                      <div key={logo.domain} className="grayscale opacity-50 hover:opacity-90 hover:grayscale-0 transition-all duration-300 hover:scale-110" style={{ transitionDelay: `${i * 40}ms` }}>
                        <LogoWithFallback domain={logo.domain} name={logo.name} brandColor={logo.brandColor} size="w-7 h-7" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right — product mockup */}
              <div className="hidden lg:block hero-anim-right scan-line-track" style={{ animationDelay: "200ms" }}>
                <PipelineMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS BAR ─────────────────────────────────────────────────────── */}
        <div className="bg-slate-900 border-y border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: Users,         val: "800+",   label: "Equipos activos"        },
                { icon: TrendingUp,    val: "3.4×",   label: "ROAS promedio reportado" },
                { icon: MessageCircle, val: "98%",    label: "Leads respondidos en <5min" },
                { icon: Activity,      val: "99.9%",  label: "Uptime garantizado"     },
              ].map(({ icon: Icon, val, label }, i) => (
                <FadeUp key={label} delay={i * 80}>
                  <Icon className="w-4 h-4 text-orange-500/60 mx-auto mb-2" />
                  <p className="text-2xl font-black text-white font-mono">{val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>

        {/* ── MARQUEE ───────────────────────────────────────────────────────── */}
        <Marquee />

        {/* ── FEATURES — BENTO GRID ─────────────────────────────────────────── */}
        <section id="features" className="bg-white py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeUp className="text-center mb-14">
              <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">Por qué Klosify</p>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900">Todo en una sola plataforma</h2>
            </FadeUp>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <FadeUp className="md:col-span-2" delay={0}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-5 overflow-hidden relative group cursor-default transition-all duration-300 hover:border hover:border-green-500/20 hover:shadow-xl hover:shadow-green-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_100%_0%,rgba(34,197,94,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">WhatsApp Business Nativo</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Envía, recibe y automatiza desde el CRM. Sin apps externas, sin pagar a terceros.</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
                    <div className="space-y-2.5">
                      {[
                        { msg: "Hola, me interesa el plan Pro", time: "10:32", out: false },
                        { msg: "¡Hola! Aquí tienes el detalle → klosify.link/pro", time: "10:32", out: true },
                        { msg: "Perfecto, ¿puedo hablar con alguien?", time: "10:33", out: false },
                      ].map((m, i) => (
                        <div key={i} className={`flex ${m.out ? "justify-end" : "justify-start"}`}>
                          <div className={`rounded-xl px-3 py-2 max-w-[75%] ${m.out ? "bg-green-600/30 border border-green-500/20" : "bg-slate-700/50 border border-slate-600/30"}`}>
                            <p className="text-xs text-slate-300">{m.msg}</p>
                            <p className="text-[10px] text-slate-600 mt-0.5 text-right">{m.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Plantillas Meta", "Respuestas automáticas", "WhatsApp + Instagram DMs"].map((t) => (
                      <span key={t} className="text-xs text-green-400/80 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={80}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-4 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-blue-500/20 hover:shadow-xl hover:shadow-blue-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_0%,rgba(59,130,246,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">Meta Ads + ROAS Real</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Conecta Facebook e Instagram Ads y ve el retorno real de cada peso.</p>
                  </div>
                  <div className="flex items-end gap-1.5 h-16 mt-auto">
                    {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm transition-all duration-300 group-hover:opacity-100" style={{ height: `${h}%`, background: i === 5 ? "#f97316" : "#334155", opacity: 0.85 }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">ROAS promedio</span>
                    <span className="text-lg font-black text-orange-400 font-mono">3.4×</span>
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={120}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-4 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-orange-500/20 hover:shadow-xl hover:shadow-orange-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_100%,rgba(249,115,22,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">IA Boost — Lead Scoring</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Prioriza los leads con mayor probabilidad de cierre.</p>
                  </div>
                  <div className="space-y-2 mt-auto">
                    {[{ name: "Juan M.", score: 9.1, color: "bg-green-500" }, { name: "Ana S.", score: 8.8, color: "bg-green-500" }, { name: "Pedro R.", score: 6.2, color: "bg-yellow-500" }].map((l) => (
                      <div key={l.name} className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full ${l.color} rounded-full transition-all duration-700 group-hover:opacity-100`} style={{ width: `${l.score * 10}%` }} />
                        </div>
                        <span className="text-xs font-bold font-mono text-slate-300 w-8 text-right">{l.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp className="md:col-span-2" delay={60}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-5 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-teal-500/20 hover:shadow-xl hover:shadow-teal-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_0%_100%,rgba(20,184,166,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">Pipeline Visual</h3>
                    <p className="text-slate-400 text-sm">Kanban de oportunidades con pronóstico de ingresos en tiempo real.</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-auto">
                    {[
                      { stage: "Nuevo",     count: 5, amount: "$8.2k",  pct: 30,  color: "bg-slate-600"  },
                      { stage: "Calificado",count: 3, amount: "$12.4k", pct: 55,  color: "bg-blue-600"   },
                      { stage: "Propuesta", count: 2, amount: "$9.1k",  pct: 75,  color: "bg-purple-600" },
                      { stage: "Cerrado",   count: 1, amount: "$8.5k",  pct: 100, color: "bg-orange-500" },
                    ].map((s) => (
                      <div key={s.stage} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
                        <div className={`w-2 h-2 rounded-full ${s.color} mb-2`} />
                        <p className="text-[11px] text-slate-500 mb-1">{s.stage}</p>
                        <p className="text-sm font-bold text-white font-mono">{s.amount}</p>
                        <p className="text-xs text-slate-600 font-mono">{s.count} leads</p>
                        <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${s.color} rounded-full transition-all duration-1000`} style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={100}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-4 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-purple-500/20 hover:shadow-xl hover:shadow-purple-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_100%_100%,rgba(168,85,247,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <Layout className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">Landings con IA</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Describe tu página en texto y la IA la genera lista para publicar.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {["Editor visual", "Leads → CRM automático", "Publicación instantánea"].map((t) => (
                      <span key={t} className="text-xs text-purple-400/80 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={140}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-4 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-pink-500/20 hover:shadow-xl hover:shadow-pink-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_0%_100%,rgba(236,72,153,0.07),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-pink-500 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <GitBranch className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1.5">Automatizaciones</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">Flujos que trabajan 24/7 para WhatsApp, asignación y seguimientos.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {["WhatsApp + email", "Condiciones y filtros", "Disparadores automáticos"].map((t) => (
                      <span key={t} className="text-xs text-pink-400/80 bg-pink-500/10 border border-pink-500/20 px-2.5 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp className="md:col-span-2" delay={160}>
                <div className="bento-card h-full bg-slate-950 rounded-2xl p-7 flex flex-col gap-5 relative overflow-hidden group cursor-default transition-all duration-300 hover:border hover:border-violet-500/20 hover:shadow-xl hover:shadow-violet-500/5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(139,92,246,0.08),transparent)] pointer-events-none" />
                  <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg bento-icon">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-lg font-bold text-white">Agente IA 24/7</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full">Nuevo</span>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed">Responde automáticamente en WhatsApp e Instagram, entiende audios e imágenes, y escala al vendedor cuando el lead quiere comprar.</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
                    <div className="space-y-2.5">
                      {[
                        { msg: "Hola, ¿cuánto cuesta el plan Pro?", time: "23:14", out: false },
                        { msg: "¡Hola! El plan Pro está a $39/mes. Incluye 3 usuarios, 5.000 contactos y automatizaciones ilimitadas 🚀 ¿Te lo detallo?", time: "23:14", out: true, ai: true },
                        { msg: "Sí, quiero hablar con alguien para comprarlo", time: "23:15", out: false },
                        { msg: "¡Perfecto! Voy a comunicarte con uno de nuestros asesores ahora mismo 😊", time: "23:15", out: true, ai: true },
                      ].map((m, i) => (
                        <div key={i} className={`flex ${m.out ? "justify-end" : "justify-start"}`}>
                          <div className={`rounded-xl px-3 py-2 max-w-[80%] ${m.out ? "bg-violet-600/30 border border-violet-500/20" : "bg-slate-700/50 border border-slate-600/30"}`}>
                            <p className="text-xs text-slate-300 leading-relaxed">{m.msg}</p>
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              {(m as { ai?: boolean }).ai && <span className="text-[9px] text-violet-400">• IA</span>}
                              <p className="text-[10px] text-slate-600">{m.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["WhatsApp + Instagram", "Entiende audios", "Escala automático"].map((t) => (
                      <span key={t} className="text-xs text-violet-400/80 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              </FadeUp>

              <FadeUp delay={180}>
                <div className="h-full bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-7 flex flex-col gap-3 hover:from-orange-400 hover:to-orange-500 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/30">
                  <p className="text-orange-100 text-sm font-medium">Equipos activos en LATAM</p>
                  <p className="text-5xl font-black text-white font-mono leading-none">2,400<span className="text-3xl text-orange-200">+</span></p>
                  <p className="text-orange-100 text-sm leading-relaxed mt-auto">Empresas que ya reemplazaron 5 herramientas con Klosify.</p>
                  <Link to="/auth" className="inline-flex items-center gap-1.5 text-white font-semibold text-sm mt-2 group">
                    Únete ahora <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </FadeUp>

            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
        <section className="bg-slate-950 py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeUp className="text-center mb-14">
              <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">Cómo funciona</p>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Configura y vende en 3 pasos</h2>
              <p className="text-slate-400 text-lg max-w-lg mx-auto">Sin técnicos, sin contratos, sin complicaciones.</p>
            </FadeUp>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">

              {/* ── Step 01 ── */}
              <FadeUp delay={0}>
                <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden group hover:border-orange-500/30 transition-all duration-300 hover:-translate-y-1">
                  {/* Visual: channels → Klosify hub */}
                  <div className="p-6 bg-slate-800/30 border-b border-slate-800 flex-shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-3">
                        {[
                          { color: "bg-green-500", Icon: MessageCircle, label: "WhatsApp"  },
                          { color: "bg-blue-600",  Icon: BarChart3,     label: "Meta Ads"  },
                          { color: "bg-pink-500",  Icon: MessageCircle, label: "Instagram" },
                        ].map(({ color, Icon, label }) => (
                          <div key={label} className="flex items-center gap-2">
                            <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
                              <Icon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">{label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-3 items-center px-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-px w-10 bg-gradient-to-r from-slate-700 to-orange-500/60" />
                        ))}
                      </div>
                      <div className="flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform drop-shadow-xl">
                        <KlosifyLogo size={56} />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs text-green-400 font-medium">3 canales conectados · activo</span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-slate-800 border border-orange-500/30 rounded-xl flex flex-col items-center justify-center flex-shrink-0 group-hover:border-orange-500/60 group-hover:bg-orange-500/5 transition-all">
                        <span className="text-orange-500 font-black font-mono text-[10px] leading-none">01</span>
                        <Zap className="w-3 h-3 text-orange-400" />
                      </div>
                      <h3 className="text-base font-bold text-white">Conecta tus canales</h3>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed mb-5">WhatsApp Business, Meta Ads e Instagram en 5 minutos. Sin código, sin llamar a un técnico.</p>
                    <ul className="space-y-2 mt-auto">
                      {["Setup guiado paso a paso", "OAuth seguro con cada plataforma", "Confirmación en tiempo real"].map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs text-slate-500">
                          <Check className="w-3 h-3 text-orange-500/50 flex-shrink-0" />{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeUp>

              {/* ── Step 02 ── */}
              <FadeUp delay={130}>
                <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden group hover:border-orange-500/30 transition-all duration-300 hover:-translate-y-1">
                  {/* Visual: form → lead card */}
                  <div className="p-6 bg-slate-800/30 border-b border-slate-800 flex-shrink-0">
                    <div className="flex items-start gap-3">
                      {/* Mini landing form */}
                      <div className="flex-1 bg-slate-800 rounded-xl p-3 border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Landing page</p>
                        <div className="space-y-1.5">
                          <div className="bg-slate-700/60 rounded-md h-5 w-full" />
                          <div className="bg-slate-700/60 rounded-md h-5 w-4/5" />
                          <div className="bg-orange-500 rounded-md h-6 w-full flex items-center justify-center">
                            <span className="text-white text-[9px] font-bold tracking-wide">ENVIAR →</span>
                          </div>
                        </div>
                      </div>
                      {/* Arrow */}
                      <div className="flex items-center self-center flex-shrink-0 pt-3">
                        <ArrowRight className="w-4 h-4 text-orange-400" />
                      </div>
                      {/* Lead card */}
                      <div className="flex-1 bg-slate-800 rounded-xl p-3 border border-green-500/20">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-white">Juan M.</span>
                          <span className="text-xs font-black text-green-400 font-mono">9.1</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2">via Meta Ads</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-[10px] text-green-400 font-medium">Hot lead</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                      <Brain className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="text-[10px] text-blue-300 font-medium">IA analizó 4 señales de compra</span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-slate-800 border border-orange-500/30 rounded-xl flex flex-col items-center justify-center flex-shrink-0 group-hover:border-orange-500/60 group-hover:bg-orange-500/5 transition-all">
                        <span className="text-orange-500 font-black font-mono text-[10px] leading-none">02</span>
                        <Brain className="w-3 h-3 text-orange-400" />
                      </div>
                      <h3 className="text-base font-bold text-white">Captura y califica leads</h3>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed mb-5">Los formularios van directo al pipeline. La IA analiza cada lead y asigna un score de 1 a 10 al instante.</p>
                    <ul className="space-y-2 mt-auto">
                      {["Formularios conectados al pipeline", "Score de IA en tiempo real", "Fuente del lead rastreada"].map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs text-slate-500">
                          <Check className="w-3 h-3 text-orange-500/50 flex-shrink-0" />{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeUp>

              {/* ── Step 03 ── */}
              <FadeUp delay={260}>
                <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden group hover:border-orange-500/30 transition-all duration-300 hover:-translate-y-1">
                  {/* Visual: hot lead + auto WA follow-up */}
                  <div className="p-6 bg-slate-800/30 border-b border-slate-800 flex-shrink-0">
                    {/* Hot lead card */}
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-white">María G.</span>
                        <span className="text-sm font-black text-green-400 font-mono">9.6</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">$8,500</span>
                        <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full font-semibold">🔥 HOT</span>
                      </div>
                    </div>
                    {/* Auto WA message */}
                    <div className="bg-slate-800 rounded-xl p-3 border border-slate-700/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-4 h-4 bg-green-500 rounded-md flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">Automatización · enviado</span>
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed italic">"Hola María, ¿pudiste revisar la propuesta?"</p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Check className="w-2.5 h-2.5 text-green-400" />
                        <Check className="w-2.5 h-2.5 text-green-400 -ml-1" />
                        <span className="text-[10px] text-slate-600 ml-0.5">10:47 · leído</span>
                      </div>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-slate-800 border border-orange-500/30 rounded-xl flex flex-col items-center justify-center flex-shrink-0 group-hover:border-orange-500/60 group-hover:bg-orange-500/5 transition-all">
                        <span className="text-orange-500 font-black font-mono text-[10px] leading-none">03</span>
                        <TrendingUp className="w-3 h-3 text-orange-400" />
                      </div>
                      <h3 className="text-base font-bold text-white">Cierra más ventas</h3>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed mb-5">Las automatizaciones hacen el seguimiento por ti. Enfócate solo en los hot leads que están listos para cerrar.</p>
                    <ul className="space-y-2 mt-auto">
                      {["Seguimientos automáticos por WhatsApp", "Alertas de leads sin respuesta", "Lead scoring IA en tiempo real"].map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs text-slate-500">
                          <Check className="w-3 h-3 text-orange-500/50 flex-shrink-0" />{b}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeUp>
            </div>

            {/* Result metric */}
            <FadeUp delay={380} className="mt-10 flex justify-center">
              <div className="inline-flex items-center gap-5 bg-slate-900 border border-slate-800 rounded-2xl px-8 py-5 hover:border-orange-500/20 transition-colors">
                <span className="text-4xl font-black text-orange-400 font-mono leading-none">3×</span>
                <div>
                  <p className="text-white font-semibold text-sm">más ventas cerradas</p>
                  <p className="text-slate-500 text-xs mt-0.5">en los primeros 30 días siguiendo este proceso</p>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── STACK SAVINGS ─────────────────────────────────────────────────── */}
        <section className="bg-white py-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeUp className="text-center mb-14">
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">¿Cuánto pagarías sin Klosify?</h2>
              <p className="text-lg text-slate-500">Suma las herramientas que reemplazamos</p>
            </FadeUp>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6">
              <FadeUp from="left">
                <div className="bg-white rounded-2xl border border-slate-200 p-7 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5">Stack tradicional</p>
                  <div className="space-y-4">
                    {toolStack.map((tool, i) => (
                      <div key={tool.domain} className="flex items-center justify-between gap-3" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="flex items-center gap-3">
                          <LogoWithFallback domain={tool.domain} name={tool.name} brandColor={tool.brandColor} size="w-8 h-8" />
                          <span className="text-sm font-medium text-slate-700">{tool.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-red-500 flex-shrink-0 font-mono">{tool.price}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-5 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Total mensual</span>
                    <span className="text-2xl font-black text-red-500 font-mono">$177/mes</span>
                  </div>
                </div>
              </FadeUp>

              <FadeUp>
                <div className="flex justify-center">
                  <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-black tracking-tighter">VS</span>
                  </div>
                </div>
              </FadeUp>

              <FadeUp from="right">
                <div className="bg-white rounded-2xl border-2 border-orange-500 p-7 shadow-xl shadow-orange-500/10">
                  <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-5">Klosify Pro</p>
                  <div className="space-y-3">
                    {klosifyIncludes.map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-green-600" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-950 rounded-xl p-5 mt-6 text-center">
                    <p className="text-3xl font-black text-white font-mono mb-2">$39/mes</p>
                    <div className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold mb-2">
                      <BadgePercent className="w-3.5 h-3.5" /> Ahorras $138/mes
                    </div>
                    <p className="text-slate-500 text-xs">$1.656/año en tu bolsillo</p>
                  </div>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ── PRICING ───────────────────────────────────────────────────────── */}
        <section id="pricing" className="bg-slate-50 py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeUp className="text-center mb-14">
              <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">Precios</p>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">Simple, transparente, sin sorpresas</h2>
              <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
                <button onClick={() => setIsAnnual(false)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${!isAnnual ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Mensual</button>
                <button onClick={() => setIsAnnual(true)} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${isAnnual ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  Anual <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">2 meses gratis</span>
                </button>
              </div>
            </FadeUp>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto pb-8">
              {plans.map((plan, i) => (
                <FadeUp key={plan.name} delay={i * 100}>
                  <PlanCard
                    plan={plan}
                    isAnnual={isAnnual}
                    onCta={() => startCheckout(plan.id)}
                    loading={checkoutLoading === plan.id}
                  />
                </FadeUp>
              ))}
            </div>

            <FadeUp delay={200} className="mt-10">
              <p className="text-center text-xs font-semibold text-slate-400 mb-5 uppercase tracking-widest">Complementos disponibles en cualquier plan</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
                {addOns.map((addon) => {
                  const AddonIcon = addon.icon;
                  return (
                    <div key={addon.label} className="bg-white rounded-xl p-5 text-center border border-slate-200 hover:border-orange-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                      <div className={`w-10 h-10 ${addon.iconBg} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                        <AddonIcon className={`w-5 h-5 ${addon.iconColor}`} />
                      </div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">{addon.label}</p>
                      <p className="text-sm font-black text-orange-500 font-mono">{addon.price}</p>
                    </div>
                  );
                })}
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────────────────────────── */}
        <section className="bg-slate-950 py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <FadeUp className="text-center mb-14">
              <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">Testimonios</p>
              <h2 className="text-4xl font-black text-white">Lo que dicen nuestros clientes</h2>
            </FadeUp>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <FadeUp key={t.name} delay={i * 120}>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 flex flex-col gap-5 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300">
                    <div className="text-4xl text-orange-500/30 font-serif leading-none select-none">"</div>
                    <p className="text-slate-300 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                      <div className={`w-9 h-9 rounded-full ${t.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{t.initials}</div>
                      <div>
                        <p className="text-white text-sm font-semibold">{t.name}</p>
                        <p className="text-slate-500 text-xs">{t.role} · {t.company}</p>
                      </div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section className="bg-white py-24">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <FadeUp className="text-center mb-14">
              <h2 className="text-4xl font-black text-slate-900">Preguntas frecuentes</h2>
            </FadeUp>
            <FaqAccordion items={faqItems} />
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
        <section className="bg-slate-950 py-24 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,rgba(249,115,22,0.12),transparent)] pointer-events-none" />
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
            <FadeUp>
              <div className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
                <Zap className="w-3.5 h-3.5 fill-orange-400" />
                Sin tarjeta de crédito · 7 días gratis
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-5">Empieza hoy. Es gratis.</h2>
              <p className="text-lg text-slate-400 mb-10">7 días de prueba completa. Cancela cuando quieras.</p>
              <Link to="/auth" className="shimmer-btn inline-flex items-center gap-2 text-white px-10 py-4 rounded-xl text-base font-bold shadow-2xl shadow-orange-500/30 hover:-translate-y-0.5 transition-transform">
                Crear mi cuenta gratis
                <ArrowRight className="w-4 h-4" />
              </Link>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8">
                {["Sin setup técnico", "Soporte en español", "Datos cifrados y seguros"].map((b) => (
                  <div key={b} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                    <span className="text-sm text-slate-500">{b}</span>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <footer className="bg-[#020617] text-slate-400 py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-10 border-b border-slate-800">
              <div className="md:col-span-1">
                <Link to="/" className="flex items-center gap-2.5 mb-4 group">
                  <div className="group-hover:scale-105 transition-transform">
                    <KlosifyLogo size={30} />
                  </div>
                  <span className="text-white font-bold">Klosify <span className="text-orange-500">CRM</span></span>
                </Link>
                <p className="text-sm text-slate-600 leading-relaxed">El CRM hecho para LATAM</p>
              </div>
              <div>
                <h4 className="text-white font-semibold text-xs mb-4 uppercase tracking-widest">Producto</h4>
                <ul className="space-y-3">
                  <li><button onClick={() => scrollTo("features")} className="text-sm hover:text-white transition-colors">Funcionalidades</button></li>
                  <li><button onClick={() => scrollTo("pricing")} className="text-sm hover:text-white transition-colors">Precios</button></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold text-xs mb-4 uppercase tracking-widest">Legal</h4>
                <ul className="space-y-3">
                  <li><Link to="/terms" className="text-sm hover:text-white transition-colors">Términos</Link></li>
                  <li><Link to="/privacy" className="text-sm hover:text-white transition-colors">Privacidad</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold text-xs mb-4 uppercase tracking-widest">Contacto</h4>
                <ul className="space-y-3">
                  <li><a href="mailto:soporte@klosify.com" className="text-sm hover:text-white transition-colors">soporte@klosify.com</a></li>
                  <li><a href="https://instagram.com/klosifycrm" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors">Instagram</a></li>
                  <li><a href="https://wa.me/message/klosify" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-white transition-colors">WhatsApp</a></li>
                </ul>
              </div>
            </div>
            <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-slate-700 flex items-center gap-1.5">
                © 2026 Klosify CRM · Hecho con
                <Heart className="w-3 h-3 text-red-500 fill-red-500 inline" />
                para LATAM
              </p>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-700" />
                <span className="text-xs text-slate-700">SSL · GDPR · Datos seguros</span>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
