import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  MessageCircle, BarChart3, Brain, GitBranch, Check, X, Menu, Shield,
  TrendingUp, Layout, Plus, Minus, Zap, Sparkles, Star, BadgePercent,
  Target, Rocket, UserPlus, Heart, ArrowRight, Users, Activity, ChevronRight, Loader2, Bot, PhoneCall, PieChart,
  Mail, Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useTransform, useMotionValue, useMotionValueEvent, type MotionValue } from "framer-motion";
import { KlosifyLogo } from "@/components/icons/KlosifyLogo";
import { WhatsAppIcon, InstagramIcon, FacebookIcon, MessengerIcon, GoogleCalendarIcon } from "@/components/icons/BrandIcons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem { q: string; a: string }
interface Plan {
  id: string;
  name: string; monthly: number; annual: number; desc: string;
  features: string[]; notIncluded: string[]; cta: string; popular: boolean;
}
interface AddOn { icon: LucideIcon; label: string; price: string; iconColor: string; iconBg: string }
interface StackTool { domain: string; name: string; price: string; brandColor: string }

// ─── Data ─────────────────────────────────────────────────────────────────────

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter", monthly: 29, annual: 24,
    desc: "Para emprendedores que están comenzando",
    features: ["1 usuario", "500 contactos", "Pipeline, contactos y empresas", "Calendario y tareas", "3 landings con IA", "3 flujos de automatización", "WhatsApp ilimitado", "Meta Ads + ROAS", "1.000 emails/mes", "Agente de Chat IA — 500 créditos/mes", "Asistente IA — 100 usos/mes"],
    notIncluded: ["IA Boost (análisis + objeciones)", "Automatizaciones de Instagram", "API access"],
    cta: "Empezar gratis", popular: false,
  },
  {
    id: "pro",
    name: "Pro", monthly: 59, annual: 49,
    desc: "Para equipos de ventas en crecimiento",
    features: ["3 usuarios incluidos", "+$9/seat adicional", "5.000 contactos", "15 landings con IA", "Flujos ilimitados", "WhatsApp ilimitado", "Meta Ads + ROAS", "5.000 emails/mes", "IA Boost — 1.000 análisis/mes", "Detección de objeciones IA", "Agente de Chat IA — 3.000 créditos/mes", "Asistente IA — 1.000 usos/mes", "Agente de voz (llamadas)", "Automatizaciones de Instagram", "Email marketing"],
    notIncluded: ["API access"],
    cta: "Comenzar ahora →", popular: true,
  },
  {
    id: "business",
    name: "Business", monthly: 99, annual: 82,
    desc: "Para equipos grandes y de alto volumen",
    features: ["10 usuarios incluidos", "+$9/seat adicional", "Contactos ilimitados", "50 landings con IA", "25.000 emails/mes", "IA Boost — 5.000 análisis/mes", "Agente de Chat IA — 15.000 créditos/mes", "Asistente IA — 10.000 usos/mes", "Agente de voz (llamadas)", "Email marketing", "API access", "Soporte prioritario + onboarding 1-a-1", "Todo lo del Pro"],
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



const addOns: AddOn[] = [
  { icon: Target,   label: "+1.000 IA Boost (análisis + objeciones)", price: "$19",   iconColor: "text-blue-600",   iconBg: "bg-blue-100"   },
  { icon: Rocket,   label: "+5.000 IA Boost (análisis + objeciones)", price: "$49",   iconColor: "text-orange-600", iconBg: "bg-orange-100" },
  { icon: UserPlus, label: "Seat adicional",  price: "$9/mes",iconColor: "text-teal-600",   iconBg: "bg-teal-100"   },
];

// ─── Animation helpers ────────────────────────────────────────────────────────

/** Reveal on scroll, powered by framer-motion's whileInView. */
function FadeUp({
  children, delay = 0, from = "bottom", className = "",
}: {
  children: React.ReactNode; delay?: number;
  from?: "bottom" | "left" | "right" | "scale"; className?: string;
}) {
  const hidden =
    from === "left"  ? { opacity: 0, x: -36 } :
    from === "right" ? { opacity: 0, x: 36 }  :
    from === "scale" ? { opacity: 0, scaleX: 0 } :
                       { opacity: 0, y: 28 };
  const show =
    from === "scale" ? { opacity: 1, scaleX: 1 } :
                       { opacity: 1, x: 0, y: 0 };
  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={show}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
      style={from === "scale" ? { transformOrigin: "left center" } : undefined}
    >
      {children}
    </motion.div>
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
    <div className={`relative flex flex-col h-full rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${plan.popular ? "border-2 border-orange-500 shadow-2xl shadow-orange-500/10 bg-white hover:shadow-orange-500/20" : "border border-slate-200 bg-white shadow-sm hover:shadow-lg"}`}>
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

// ─── Hero entrance animation (framer-motion) ───
const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
};
const titleContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } },
};
const wordItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } },
};
const HEADLINE: { text: string; gradient?: boolean }[] = [
  { text: "El CRM con IA", gradient: true },
  { text: "que hace el trabajo fuerte." },
  { text: "Tu equipo solo cierra." },
];

// Fraction of each feature's scroll segment where it stays PINNED (static) while
// its visual animation plays. The remaining fraction slides to the next feature.
const DWELL = 0.62;

// ─── Feature section (one per feature, animates on scroll, alternates sides) ───
const FA: Record<string, { text: string; soft: string; ring: string; iconBg: string }> = {
  green:  { text: "text-green-600",  soft: "bg-green-50",  ring: "ring-green-100",  iconBg: "bg-green-500"  },
  blue:   { text: "text-blue-600",   soft: "bg-blue-50",   ring: "ring-blue-100",   iconBg: "bg-blue-500"   },
  orange: { text: "text-orange-600", soft: "bg-orange-50", ring: "ring-orange-100", iconBg: "bg-orange-500" },
  teal:   { text: "text-teal-600",   soft: "bg-teal-50",   ring: "ring-teal-100",   iconBg: "bg-teal-500"   },
  cyan:   { text: "text-cyan-600",   soft: "bg-cyan-50",   ring: "ring-cyan-100",   iconBg: "bg-cyan-500"   },
  pink:   { text: "text-pink-600",   soft: "bg-pink-50",   ring: "ring-pink-100",   iconBg: "bg-pink-500"   },
  indigo: { text: "text-indigo-600", soft: "bg-indigo-50", ring: "ring-indigo-100", iconBg: "bg-indigo-500" },
  sky:    { text: "text-sky-600",    soft: "bg-sky-50",    ring: "ring-sky-100",    iconBg: "bg-sky-500"    },
  amber:  { text: "text-amber-600",  soft: "bg-amber-50",  ring: "ring-amber-100",  iconBg: "bg-amber-500"  },
  violet: { text: "text-violet-600", soft: "bg-violet-50", ring: "ring-violet-100", iconBg: "bg-violet-500" },
};

interface Feature { eyebrow: string; title: string; desc: string; bullets: string[]; accent: string; icon: LucideIcon | (() => JSX.Element); visual: (progress: MotionValue<number>) => React.ReactNode }

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

// Mobile layout for a feature: a STICKY (pinned) panel. The feature stays fixed
// while you scroll through its track and its visual animation plays; then it
// unpins and the next feature takes over — like desktop's dwell, but vertical.
function MobileFeature({ feature }: { feature: Feature }) {
  const a = FA[feature.accent] || FA.orange;
  const Icon = feature.icon as React.ComponentType<{ className?: string }>;
  const trackRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? Math.max(0, Math.min(1, -rect.top / span)) : 0;
      // Animation completes by ~78% of the track, then holds before unpinning.
      progress.set(Math.min(1, p / 0.78));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [progress]);
  return (
    <div ref={trackRef} className="relative h-[160vh]">
      <div className="sticky top-0 min-h-screen flex flex-col justify-center px-5 py-20">
        <div className={`inline-flex w-fit items-center gap-2 ${a.soft} ${a.text} text-[11px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-full ring-1 ${a.ring} mb-4`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-md ${a.iconBg} text-white`}><Icon className="w-3 h-3" /></span>
          {feature.eyebrow}
        </div>
        <h3 className="text-3xl font-black text-white tracking-tight mb-3">{feature.title}</h3>
        <p className="text-slate-400 text-base leading-relaxed mb-5">{feature.desc}</p>
        <ul className="space-y-2.5 mb-7">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${a.soft} ${a.text} flex-shrink-0`}><Check className="w-3 h-3" /></span>
              <span className="text-slate-300 text-sm">{b}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-xl">
          {feature.visual(progress)}
        </div>
      </div>
    </div>
  );
}

function FeatureSlide({ feature, scrollYProgress, index, total }: {
  feature: Feature; scrollYProgress: MotionValue<number>; index: number; total: number;
}) {
  const a = FA[feature.accent] || FA.orange;
  const Icon = feature.icon as React.ComponentType<{ className?: string }>;
  // Each feature owns a scroll segment [segStart, segStart+seg]. During the first
  // DWELL fraction the feature is PINNED (static) and its visual animation plays
  // 0→1; the rest of the segment slides to the next feature.
  const seg = 1 / total;
  const segStart = index * seg;
  const dwellEnd = segStart + DWELL * seg;
  const moveDur = (1 - DWELL) * seg;
  // Visual animation plays only during this feature's dwell.
  const playProgress = useTransform(scrollYProgress, [segStart, dwellEnd], [0, 1], { clamp: true });
  // Focus: full while this feature is on screen, dim while entering/leaving.
  const focus = useTransform(
    scrollYProgress,
    [segStart - moveDur, segStart, dwellEnd, segStart + seg],
    [0.3, 1, 1, 0.3],
    { clamp: true },
  );
  const scale = useTransform(focus, [0.3, 1], [0.92, 1]);

  return (
    <motion.div data-hslide style={{ opacity: focus, scale }} className="w-screen h-full flex items-center px-6 sm:px-12 lg:px-20 shrink-0 will-change-transform">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-center w-full">
        {/* Copy */}
        <div>
          <div className={`inline-flex items-center gap-2 ${a.soft} ${a.text} text-[11px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-full ring-1 ${a.ring} mb-5`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-md ${a.iconBg} text-white`}><Icon className="w-3 h-3" /></span>
            {feature.eyebrow}
          </div>
          <h3 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight mb-5">{feature.title}</h3>
          <p className="text-slate-600 text-lg leading-relaxed mb-6">{feature.desc}</p>
          <ul className="space-y-3">
            {feature.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${a.soft} ${a.text} flex-shrink-0`}><Check className="w-3 h-3" /></span>
                <span className="text-slate-700 text-lg">{b}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Visual — its inner animation is driven by playProgress (scroll) */}
        <div>
          <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 shadow-2xl shadow-slate-900/10">
            {feature.visual(playProgress)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Pinned section whose features scroll HORIZONTALLY as you scroll vertically,
// each slide's visual animation playing in sync with the scroll.
function HorizontalFeatures() {
  const N = FEATURES.length;
  const isDesktop = useIsDesktop();
  const ref = useRef<HTMLElement>(null);
  // Pin progress (0..1) computed manually from scroll — avoids useScroll's
  // ScrollTimeline path (which threw "Offsets must be in [0,1]" in some browsers).
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      scrollYProgress.set(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [scrollYProgress]);
  // Stepped horizontal position: stays on each feature during its dwell, then
  // slides to the next. Built as a piecewise map of scroll → slide index.
  const seg = 1 / N;
  const inputs: number[] = [];
  const outputs: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = i * seg;
    inputs.push(s); outputs.push(i);                 // arrive at feature i
    inputs.push(s + DWELL * seg); outputs.push(i);   // hold (static) through dwell
  }
  inputs.push(1); outputs.push(N - 1);
  const xIndex = useTransform(scrollYProgress, inputs, outputs);
  const x = useTransform(xIndex, (v) => `-${(v * 100).toFixed(3)}vw`);
  const barScaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  // ── Mobile/tablet: stacked vertical features (no horizontal pin) ──
  if (!isDesktop) {
    return (
      <section id="features" className="bg-slate-950">
        <div className="pt-20 pb-6 text-center px-5">
          <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-2">Por qué Klosify</p>
          <h2 className="text-3xl font-black text-white tracking-tight">Todo en una sola plataforma</h2>
        </div>
        <div>
          {FEATURES.map((f) => <MobileFeature key={f.title} feature={f} />)}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} id="features" className="relative bg-white" style={{ height: `${N * 85}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col">
        {/* Header (stays pinned above the slider) */}
        <div className="pt-24 pb-4 text-center px-4 shrink-0">
          <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-2">Por qué Klosify</p>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Todo en una sola plataforma</h2>
        </div>
        {/* Horizontal track */}
        <div className="flex-1 min-h-0">
          <motion.div className="flex h-full will-change-transform" style={{ width: `${N * 100}vw`, x }}>
            {FEATURES.map((f, i) => (
              <FeatureSlide key={f.title} feature={f} scrollYProgress={scrollYProgress} index={i} total={N} />
            ))}
          </motion.div>
        </div>
        {/* Progress bar */}
        <div className="shrink-0 h-1 bg-slate-200/50">
          <motion.div className="h-full bg-orange-500 origin-left" style={{ scaleX: barScaleX }} />
        </div>
      </div>
    </section>
  );
}

type ChatMsg = { who: "them" | "me"; ai?: boolean; text: string; time: string };
const CHAT_SCRIPT: ChatMsg[] = [
  { who: "them", text: "Hola, me interesa el plan Pro", time: "10:32" },
  { who: "me", ai: true, text: "¡Hola! 👋 El plan Pro está a $59/mes: 3 usuarios, 5.000 contactos y automatizaciones ilimitadas 🚀", time: "10:32" },
  { who: "them", text: "Perfecto, ¿puedo hablar con alguien?", time: "10:33" },
  { who: "me", ai: true, text: "¡Claro! Te conecto con un asesor ahora mismo 😊", time: "10:33" },
];

// WhatsApp chat. If `progress` (0..1) is given, the conversation is driven by
// scroll (messages + AI typing appear as you scroll the slide). Otherwise it
// plays on a timed loop.
function WhatsAppChatDemo({ progress }: { progress?: MotionValue<number> }) {
  const msgs = CHAT_SCRIPT;
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);

  // Timed loop (only when not scroll-driven)
  useEffect(() => {
    if (progress) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setCount(0); setTyping(false);
      let delay = 500;
      msgs.forEach((m) => {
        if (m.ai) { timers.push(setTimeout(() => !cancelled && setTyping(true), delay)); delay += 1400; timers.push(setTimeout(() => !cancelled && setTyping(false), delay)); }
        timers.push(setTimeout(() => !cancelled && setCount((c) => c + 1), delay));
        delay += 1200;
      });
      timers.push(setTimeout(() => { if (!cancelled) run(); }, delay + 2600));
    };
    run();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [progress, msgs]);

  // Scroll-driven
  const fallback = useMotionValue(0);
  useMotionValueEvent(progress ?? fallback, "change", (v) => {
    if (!progress) return;
    const total = msgs.length;
    const points = msgs.map((_, k) => (k + 1) / (total + 1)); // appearance threshold per msg
    const c = points.filter((pt) => v >= pt).length;
    let t = false;
    if (c < total && msgs[c].ai) {
      const prev = c > 0 ? points[c - 1] : 0;
      if (v > points[c] - (points[c] - prev) * 0.6) t = true;
    }
    setCount(c); setTyping(t);
  });

  const visible = msgs.slice(0, count);

  return (
    <div className="space-y-3 min-h-[260px]">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><WhatsAppIcon size={20} /></div>
        <span className="text-sm font-semibold text-white">Chat · WhatsApp Business</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400"><span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> en línea</span>
      </div>
      {visible.map((m, i) => {
        const out = m.who === "me";
        return (
          <div key={i} className={`flex ${out ? "justify-end" : "justify-start"} animate-[waPop_0.35s_ease-out]`}>
            <div className={`rounded-xl px-3 py-2 max-w-[82%] ${out ? "bg-green-600/30 border border-green-500/20" : "bg-slate-800/70 border border-slate-700/40"}`}>
              <p className="text-xs text-slate-200 leading-relaxed">{m.text}</p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                {m.ai && <span className="text-[9px] text-green-300 font-medium">• Agente IA</span>}
                <span className="text-[10px] text-slate-500">{m.time}</span>
              </div>
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="flex justify-end animate-[waPop_0.3s_ease-out]">
          <div className="rounded-xl px-3 py-2.5 bg-green-600/20 border border-green-500/20 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-bounce [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-bounce [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-bounce" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scroll-driven visual helpers (driven by each slide's playProgress) ──
function CountUp({ progress, to, prefix = "", suffix = "", decimals = 0, className }: {
  progress: MotionValue<number>; to: number; prefix?: string; suffix?: string; decimals?: number; className?: string;
}) {
  const mv = useTransform(progress, [0.15, 0.9], [0, to], { clamp: true });
  const [v, setV] = useState(0);
  useMotionValueEvent(mv, "change", (x) => setV(x));
  const text = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("es");
  return <span className={className}>{prefix}{text}{suffix}</span>;
}
function Bar({ progress, pct, className, start = 0.2, end = 0.85 }: {
  progress: MotionValue<number>; pct: number; className?: string; start?: number; end?: number;
}) {
  const w = useTransform(progress, [start, end], ["0%", `${pct}%`], { clamp: true });
  return <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden"><motion.div style={{ width: w }} className={`h-full rounded-full ${className}`} /></div>;
}
function Reveal({ progress, start, end, y = 12, className, children }: {
  progress: MotionValue<number>; start: number; end?: number; y?: number; className?: string; children: React.ReactNode;
}) {
  const e = end ?? start + 0.14;
  const opacity = useTransform(progress, [start, e], [0, 1], { clamp: true });
  const ty = useTransform(progress, [start, e], [y, 0], { clamp: true });
  return <motion.div style={{ opacity, y: ty }} className={className}>{children}</motion.div>;
}

// Chat inside a FIXED-HEIGHT window. As the conversation advances with scroll,
// older messages scroll up out of view (auto-scroll), so it never grows tall.
function ChatAutoScroll({ progress, messages }: {
  progress: MotionValue<number>;
  messages: { msg: string; out?: boolean; ai?: boolean }[];
}) {
  const winRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxScroll, setMaxScroll] = useState(0);
  useEffect(() => {
    const measure = () => {
      const w = winRef.current?.clientHeight ?? 0;
      const c = contentRef.current?.scrollHeight ?? 0;
      setMaxScroll(Math.max(0, c - w + 8));
    };
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [messages]);
  const y = useTransform(progress, (p) => -maxScroll * Math.min(1, Math.max(0, p)));
  const n = messages.length;
  return (
    <div ref={winRef} className="relative h-[300px] overflow-hidden">
      <motion.div ref={contentRef} style={{ y }} className="space-y-2.5">
        {messages.map((m, i) => (
          <Reveal key={i} progress={progress} start={(i / n) * 0.8} end={(i / n) * 0.8 + 0.1} y={8} className={`flex ${m.out ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-xl px-3 py-2 max-w-[82%] ${m.out ? "bg-violet-600/30 border border-violet-500/20" : "bg-slate-800/70 border border-slate-700/40"}`}>
              <p className="text-xs text-slate-200 leading-relaxed">{m.msg}</p>
              {m.ai && <p className="text-[9px] text-violet-300 text-right mt-0.5">• Agente IA</p>}
            </div>
          </Reveal>
        ))}
      </motion.div>
      {/* top fade so messages dissolve as they scroll out */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-slate-900 to-transparent" />
    </div>
  );
}

// Unified inbox: incoming notification bubbles from WhatsApp, Instagram and
// Messenger (official logos), each sliding in from the right as you scroll.
function NotifBubble({ progress, start, name, channel, msg, time, logo }: {
  progress: MotionValue<number>; start: number; name: string; channel: string; msg: string; time: string; logo: React.ReactNode;
}) {
  const x = useTransform(progress, [start, start + 0.16], [44, 0], { clamp: true });
  const opacity = useTransform(progress, [start, start + 0.16], [0, 1], { clamp: true });
  return (
    <motion.div style={{ opacity, x }} className="flex items-start gap-3 rounded-xl bg-slate-800/60 border border-slate-700/40 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow">{logo}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white truncate">{name}</span>
          <span className="text-[10px] text-slate-500 shrink-0">{time}</span>
        </div>
        <p className="text-[10px] text-slate-500 mb-0.5">vía {channel}</p>
        <p className="text-xs text-slate-300 truncate">{msg}</p>
      </div>
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green-400" />
    </motion.div>
  );
}

function MetaInboxDemo({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="space-y-2.5 min-h-[230px]">
      <div className="flex items-center justify-between pb-1">
        <span className="text-sm font-semibold text-white">Inbox unificado</span>
        <span className="text-[10px] text-slate-400">Meta · 3 canales</span>
      </div>
      <NotifBubble progress={progress} start={0.12} name="María G." channel="WhatsApp" msg="Hola, ¿tienen disponibilidad?" time="10:32" logo={<WhatsAppIcon size={18} />} />
      <NotifBubble progress={progress} start={0.34} name="@carlos.fit" channel="Instagram" msg="Me interesa el plan 👀" time="10:33" logo={<InstagramIcon size={18} />} />
      <NotifBubble progress={progress} start={0.56} name="Pedro L." channel="Messenger" msg="¿Me das más info del CRM?" time="10:34" logo={<MessengerIcon size={18} />} />
    </div>
  );
}

const FEATURES: Feature[] = [
  {
    eyebrow: "Meta nativo", accent: "green", icon: MessageCircle,
    title: "Conexión Nativa con Meta",
    desc: "Conecta WhatsApp, Instagram y Messenger directo al CRM. Recibe, responde y automatiza sin apps externas.",
    bullets: ["WhatsApp, Instagram y Messenger en un solo inbox", "Plantillas aprobadas por Meta", "Respuestas automáticas 24/7"],
    visual: (p) => <MetaInboxDemo progress={p} />,
  },
  {
    eyebrow: "Agente de Chat", accent: "violet", icon: Bot,
    title: "Agente de Chat 24/7",
    desc: "Responde automáticamente en WhatsApp e Instagram, entiende audios e imágenes, y escala al vendedor cuando el lead quiere comprar.",
    bullets: ["WhatsApp + Instagram", "Entiende audios e imágenes", "Escala al vendedor automáticamente"],
    visual: (p) => (
      <ChatAutoScroll progress={p} messages={[
        { msg: "¿Cuánto cuesta el plan Pro?", out: false },
        { msg: "El plan Pro está a $59/mes: 3 usuarios, 5.000 contactos y automatizaciones ilimitadas 🚀", out: true, ai: true },
        { msg: "¿Tienen prueba gratis?", out: false },
        { msg: "¡Sí! 7 días gratis, sin tarjeta. ¿Te agendo una demo rápida para mostrártelo? 📅", out: true, ai: true },
        { msg: "Dale, mañana en la tarde", out: false },
        { msg: "Listo ✅ Te agendé mañana 3:00 pm. Te llega el recordatorio por WhatsApp 📲", out: true, ai: true },
        { msg: "Perfecto, gracias!", out: false },
        { msg: "¡A ti! Aquí tienes el link para empezar ya 👉 klosify.link/pro 🙌", out: true, ai: true },
      ]} />
    ),
  },
  {
    eyebrow: "Agente de voz", accent: "sky", icon: PhoneCall,
    title: "Agente de Voz",
    desc: "La IA llama, califica y agenda por ti. Cada llamada queda transcrita y analizada.",
    bullets: ["Llamadas automáticas con IA", "Agenda citas sin intervención", "Transcripción y análisis"],
    visual: (p) => (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5"><span className="text-xs text-slate-400">Llamadas este mes</span><CountUp progress={p} to={128} className="text-sm font-bold font-mono text-sky-300" /></div>
        <div className="flex items-center justify-between rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5"><span className="text-xs text-slate-400">Citas agendadas</span><CountUp progress={p} to={34} className="text-sm font-bold font-mono text-sky-300" /></div>
        <div className="flex items-center justify-between rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5"><span className="text-xs text-slate-400">Intención de compra</span><CountUp progress={p} to={8.7} decimals={1} suffix="/10" className="text-sm font-bold font-mono text-sky-300" /></div>
      </div>
    ),
  },
  {
    eyebrow: "Meta Ads + ROAS", accent: "blue", icon: PieChart,
    title: "Dashboard de Marketing & Ventas",
    desc: "Sincroniza tus cuentas de Meta Ads y ve, en un solo lugar, inversión, leads, ventas y ROAS real.",
    bullets: ["Sincroniza múltiples cuentas publicitarias", "ROAS real cruzado con tu pipeline", "Inversión, leads y ventas por campaña"],
    visual: (p) => (
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white"><FacebookIcon size={18} /></div>
          <span className="text-sm font-semibold text-white">Rendimiento · Meta Ads</span>
        </div>
        <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Inversión Ads</span><CountUp progress={p} to={1.2} prefix="$" suffix="k" decimals={1} className="text-base font-bold font-mono text-blue-300" /></div>
        <div className="flex items-center justify-between"><span className="text-sm text-slate-400">Ingresos pipeline</span><CountUp progress={p} to={4.1} prefix="$" suffix="k" decimals={1} className="text-base font-bold font-mono text-emerald-300" /></div>
        <div className="flex items-center justify-between"><span className="text-sm text-slate-400">ROAS</span><CountUp progress={p} to={3.4} suffix="×" decimals={1} className="text-base font-bold font-mono text-orange-300" /></div>
      </div>
    ),
  },
  {
    eyebrow: "Lead scoring IA", accent: "orange", icon: Brain,
    title: "IA Boost — Lead Scoring",
    desc: "La IA puntúa cada lead por su probabilidad de cierre para que tu equipo se enfoque en lo que vende.",
    bullets: ["Score automático con IA", "Prioriza los leads más calientes", "Menos tiempo perdido en leads fríos"],
    visual: (p) => (
      <div className="space-y-3">
        {[{ name: "Juan M.", score: 9.1, color: "bg-green-500" }, { name: "Ana S.", score: 8.8, color: "bg-green-500" }, { name: "Pedro R.", score: 6.2, color: "bg-yellow-500" }].map((l) => (
          <div key={l.name} className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-16 shrink-0">{l.name}</span>
            <Bar progress={p} pct={l.score * 10} className={l.color} />
            <CountUp progress={p} to={l.score} decimals={1} className="text-sm font-bold font-mono text-white w-8 text-right" />
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "IA en llamadas", accent: "cyan", icon: PhoneCall,
    title: "Analizador de Llamadas",
    desc: "La IA transcribe y analiza cada llamada: objeciones, intención de compra y próximos pasos.",
    bullets: ["Transcripción automática", "Detecta objeciones e intención", "Sugiere el siguiente paso"],
    visual: (p) => (
      <div className="space-y-3">
        {[
          { label: "Objeción detectada", tag: "Precio alto", color: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20" },
          { label: "Intención de compra", tag: "Alta — 8.7/10", color: "text-green-300 bg-green-500/10 border-green-500/20" },
          { label: "Próximo paso", tag: "Enviar propuesta", color: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20" },
        ].map((r, i) => (
          <Reveal key={r.label} progress={p} start={0.18 + i * 0.16} className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">{r.label}</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${r.color}`}>{r.tag}</span>
          </Reveal>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Automatización", accent: "pink", icon: GitBranch,
    title: "Automatizaciones",
    desc: "Flujos que trabajan 24/7: mensajes, asignación de leads y seguimientos automáticos.",
    bullets: ["WhatsApp + email automáticos", "Condiciones y filtros", "Disparadores por evento"],
    visual: (p) => (
      <div className="space-y-2">
        {["Lead entra por WhatsApp", "Se asigna al vendedor", "Mensaje de bienvenida", "Seguimiento a las 24h"].map((s, i) => (
          <Reveal key={s} progress={p} start={0.15 + i * 0.13} y={8} className="flex items-center gap-3 rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/20 text-pink-300 text-[10px] font-bold">{i + 1}</span>
            <span className="text-xs text-slate-300">{s}</span>
          </Reveal>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Landings con IA", accent: "indigo", icon: Layout,
    title: "Landing pages con IA",
    desc: "Describe tu oferta y la IA crea una landing lista para captar leads, publicada en tu dominio en minutos.",
    bullets: ["Generación con IA", "Publica en tu propio dominio", "Captura leads directo al CRM"],
    visual: (p) => (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-2.5">
        <Reveal progress={p} start={0.12}><div className="h-2.5 w-1/2 rounded-full bg-indigo-400/70" /></Reveal>
        <Reveal progress={p} start={0.22}><div className="h-1.5 w-3/4 rounded-full bg-slate-600" /></Reveal>
        <Reveal progress={p} start={0.30}><div className="h-1.5 w-2/3 rounded-full bg-slate-600" /></Reveal>
        <Reveal progress={p} start={0.40} className="grid grid-cols-3 gap-2 pt-1">
          <div className="h-10 rounded-lg bg-slate-700/50" />
          <div className="h-10 rounded-lg bg-slate-700/50" />
          <div className="h-10 rounded-lg bg-slate-700/50" />
        </Reveal>
        <Reveal progress={p} start={0.55}><div className="h-8 w-32 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 mt-1" /></Reveal>
      </div>
    ),
  },
  {
    eyebrow: "Email marketing", accent: "amber", icon: Mail,
    title: "Email marketing",
    desc: "Campañas masivas desde tu propio dominio, con métricas reales de apertura y clics.",
    bullets: ["Envíos desde tu dominio", "Métricas de apertura y clics", "Plantillas listas para usar"],
    visual: (p) => (
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-3 text-center"><CountUp progress={p} to={5000} className="text-base font-bold font-mono text-amber-300" /><p className="text-[10px] text-slate-500 mt-0.5">Enviados</p></div>
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-3 text-center"><CountUp progress={p} to={42} suffix="%" className="text-base font-bold font-mono text-amber-300" /><p className="text-[10px] text-slate-500 mt-0.5">Apertura</p></div>
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/40 p-3 text-center"><CountUp progress={p} to={9} suffix="%" className="text-base font-bold font-mono text-amber-300" /><p className="text-[10px] text-slate-500 mt-0.5">Clics</p></div>
      </div>
    ),
  },
  {
    eyebrow: "Calendario", accent: "teal", icon: Calendar,
    title: "Calendario & Tareas",
    desc: "Agenda citas y da seguimiento sin que ningún lead se enfríe.",
    bullets: ["Agenda de citas", "Recordatorios y tareas", "Seguimiento a tiempo"],
    visual: (p) => (
      <div className="space-y-2">
        {[{ time: "09:00", label: "Llamada · María G.", color: "bg-blue-500" }, { time: "11:30", label: "Visita · Juan M.", color: "bg-emerald-500" }, { time: "16:00", label: "Seguimiento · Luis F.", color: "bg-amber-500" }].map((r, i) => (
          <Reveal key={r.time} progress={p} start={0.16 + i * 0.16} y={8} className="flex items-center gap-3 rounded-xl bg-slate-800/50 border border-slate-700/40 px-3 py-2.5">
            <span className="text-xs font-mono text-slate-400 w-10 shrink-0">{r.time}</span>
            <span className={`h-2 w-2 rounded-full ${r.color} shrink-0`} />
            <span className="text-xs text-slate-300 truncate">{r.label}</span>
          </Reveal>
        ))}
      </div>
    ),
  },
];

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

  // Cursor-following spotlight over the hero grid (interactive background texture)
  const handleHeroMouse = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

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

        /* WhatsApp chat message pop-in */
        @keyframes waPop { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
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
        <section onMouseMove={handleHeroMouse} className="hero-spotlight group/hero bg-slate-950 pt-32 pb-20 relative overflow-hidden [--mx:50%] [--my:30%]">
          {/* Animated aurora blobs (framer-motion, looping) */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(249,115,22,0.18), transparent 70%)" }}
            animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-10 right-0 h-[460px] w-[460px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(244,63,94,0.14), transparent 70%)" }}
            animate={{ x: [0, -50, 0], y: [0, 50, 0], scale: [1, 1.2, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          <div ref={heroGlowRef} className="hero-parallax-glow absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.10),transparent_70%)] pointer-events-none" />
          <div ref={heroGridRef} className="hero-parallax-grid absolute inset-0 opacity-[0.025] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "64px 64px" }} />

          {/* Brighter grid that only reveals around the cursor (interactive texture) */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-0 group-hover/hero:opacity-100"
            style={{
              backgroundImage: "linear-gradient(rgba(249,115,22,0.55) 1px,transparent 1px),linear-gradient(90deg,rgba(249,115,22,0.55) 1px,transparent 1px)",
              backgroundSize: "64px 64px",
              WebkitMaskImage: "radial-gradient(220px circle at var(--mx) var(--my), #000 0%, transparent 70%)",
              maskImage: "radial-gradient(220px circle at var(--mx) var(--my), #000 0%, transparent 70%)",
            }}
          />
          {/* Soft glow that follows the cursor */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-0 group-hover/hero:opacity-100"
            style={{ background: "radial-gradient(500px circle at var(--mx) var(--my), rgba(249,115,22,0.08), transparent 60%)" }}
          />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

              {/* Left — copy, staggered entrance with framer-motion */}
              <motion.div variants={heroContainer} initial="hidden" animate="show">
                <motion.div variants={heroItem} className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-7">
                  <Sparkles className="w-3.5 h-3.5" />
                  IA nativa · Agente 24/7 · WhatsApp + Instagram
                </motion.div>

                <motion.h1 variants={titleContainer} className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-[1.08] tracking-tight">
                  {HEADLINE.map((line, li) => (
                    <span key={li} className="block">
                      {line.text.split(" ").map((word, wi) => (
                        <motion.span key={wi} variants={wordItem} className={`inline-block ${line.gradient ? "gradient-text" : ""}`} style={{ marginRight: "0.22em" }}>
                          {word}
                        </motion.span>
                      ))}
                    </span>
                  ))}
                </motion.h1>

                <motion.p variants={heroItem} className="text-lg text-slate-400 mt-6 leading-relaxed max-w-lg">
                  Lead scoring automático, agente IA 24/7 en WhatsApp e Instagram, Meta Ads con
                  ROAS y pipeline visual — todo desde <span className="text-white font-semibold">$29/mes</span>.
                </motion.p>

                <motion.div variants={heroItem} className="flex flex-col sm:flex-row items-start gap-4 mt-10">
                  <motion.div whileHover={{ scale: 1.045 }} whileTap={{ scale: 0.96 }} className="inline-block">
                    <Link to="/auth" className="shimmer-btn group inline-flex items-center gap-2 text-white px-7 py-3.5 rounded-xl text-base font-bold shadow-xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow">
                      Crear cuenta gratis
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </motion.div>
                  <motion.button whileHover={{ scale: 1.045 }} whileTap={{ scale: 0.96 }} onClick={() => scrollTo("pricing")} className="inline-flex items-center gap-2 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-7 py-3.5 rounded-xl text-base font-semibold transition-colors">
                    Ver planes <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </motion.div>

                <motion.div variants={heroItem} className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-7">
                  {["Sin tarjeta de crédito", "7 días gratis", "Cancela cuando quieras"].map((b) => (
                    <div key={b} className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      <span className="text-sm text-slate-500">{b}</span>
                    </div>
                  ))}
                </motion.div>

                <motion.div variants={heroItem} className="mt-10 pt-8 border-t border-slate-800/60">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-4">Se integra con</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {[
                      { name: "WhatsApp",  Icon: WhatsAppIcon },
                      { name: "Meta Ads",  Icon: FacebookIcon },
                      { name: "Instagram", Icon: InstagramIcon },
                      { name: "Google Calendar", Icon: GoogleCalendarIcon },
                    ].map(({ name, Icon }, i) => (
                      <motion.div key={name} title={name}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 0.9, scale: 1 }}
                        transition={{ delay: 0.9 + i * 0.08, duration: 0.4, ease: "backOut" }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 shadow-sm ring-1 ring-white/10 hover:opacity-100 hover:scale-110 transition-transform duration-300">
                        <Icon size={22} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>

              {/* Right — product mockup: slides in, then floats idly */}
              <motion.div
                initial={{ opacity: 0, x: 48, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
                className="hidden lg:block">
                <motion.div
                  className="scan-line-track"
                  animate={{ y: [0, -14, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
                  <PipelineMockup />
                </motion.div>
              </motion.div>
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

        {/* ── FEATURES — horizontal scroll-driven slider (pinned) ───────────── */}
        <HorizontalFeatures />

        {/* ── STACK CTA BAND — clean, dark ──────────────────────────────────── */}
        <section className="bg-slate-950 py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative text-center"
            >
              {/* subtle orange glow accent */}
              <div aria-hidden className="pointer-events-none absolute left-1/2 -top-28 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-orange-500/12 blur-3xl" />

              <h3 className="relative text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.1]">
                Todo tu marketing y ventas, <span className="text-orange-400">en un solo lugar</span>
              </h3>
              <p className="relative text-slate-400 text-lg mt-4 max-w-xl mx-auto">
                Sin Zapier, sin apps externas, sin pagar herramientas distintas.
              </p>

              <div className="relative mt-9 flex flex-col items-center gap-3">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Link to="/auth" className="shimmer-btn group inline-flex items-center gap-2 text-white px-9 py-4 rounded-xl text-base font-bold shadow-xl shadow-orange-500/25">
                    Empezar gratis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>
                <p className="text-slate-500 text-xs">7 días gratis · sin tarjeta de crédito</p>
              </div>
            </motion.div>
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
                    <p className="text-3xl font-black text-white font-mono mb-2">$59/mes</p>
                    <div className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold mb-2">
                      <BadgePercent className="w-3.5 h-3.5" /> Ahorras $118/mes
                    </div>
                    <p className="text-slate-500 text-xs">$1.416/año en tu bolsillo</p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch max-w-5xl mx-auto pb-8">
              {plans.map((plan, i) => (
                <FadeUp key={plan.name} delay={i * 100} className="h-full">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
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
