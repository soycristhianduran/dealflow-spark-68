import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  MessageCircle,
  BarChart3,
  Brain,
  GitBranch,
  Check,
  X,
  Menu,
  Shield,
  TrendingUp,
  Layout,
  Plus,
  Minus,
  Zap,
  Sparkles,
  Star,
  BadgePercent,
  Wand2,
  Target,
  Rocket,
  UserPlus,
  Heart,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: string;
}

interface Plan {
  name: string;
  monthly: number;
  annual: number;
  desc: string;
  features: string[];
  notIncluded: string[];
  cta: string;
  popular: boolean;
}

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  desc: string;
  bullets: string[];
  color: string;
}

interface AddOn {
  icon: LucideIcon;
  label: string;
  price: string;
  iconColor: string;
  iconBg: string;
}

interface StackTool {
  domain: string;
  name: string;
  price: string;
  brandColor: string;
}

interface IntegrationLogo {
  domain: string;
  name: string;
  brandColor: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const plans: Plan[] = [
  {
    name: "Starter",
    monthly: 29,
    annual: 24,
    desc: "Para emprendedores que están comenzando",
    features: [
      "1 usuario",
      "500 contactos",
      "3 landings con IA",
      "3 flujos de automatización",
      "WhatsApp Business nativo",
      "Meta Ads + ROAS",
      "Todas las integraciones",
    ],
    notIncluded: ["IA Boost (scoring)", "Automatizaciones de Instagram"],
    cta: "Empezar gratis",
    popular: false,
  },
  {
    name: "Pro",
    monthly: 39,
    annual: 32,
    desc: "Para equipos de ventas en crecimiento",
    features: [
      "3 usuarios incluidos",
      "+$9/seat adicional",
      "5.000 contactos",
      "15 landings con IA",
      "Flujos ilimitados",
      "IA Boost — 1.000 leads/mes",
      "Automatizaciones de Instagram",
      "WhatsApp Business nativo",
      "Meta Ads + ROAS",
    ],
    notIncluded: [],
    cta: "Comenzar ahora →",
    popular: true,
  },
  {
    name: "Business",
    monthly: 89,
    annual: 74,
    desc: "Para agencias y equipos grandes",
    features: [
      "10 usuarios incluidos",
      "+$9/seat adicional",
      "Contactos ilimitados",
      "50 landings con IA",
      "IA Boost — 5.000 leads/mes",
      "Soporte prioritario",
      "Todo lo del Pro",
    ],
    notIncluded: [],
    cta: "Contactar ventas",
    popular: false,
  },
];

const faqItems: FaqItem[] = [
  {
    q: "¿Necesito conocimientos técnicos?",
    a: "No. Klosify está diseñado para que cualquier persona lo configure en menos de 30 minutos, sin ayuda técnica.",
  },
  {
    q: "¿Puedo conectar mi número de WhatsApp actual?",
    a: "Sí. Conectas tu número de WhatsApp Business API directamente. Si no tienes uno, te guiamos en la activación.",
  },
  {
    q: "¿Qué pasa cuando se acaban mis créditos de IA?",
    a: "Puedes comprar paquetes adicionales desde $9 en cualquier momento, sin necesidad de cambiar de plan.",
  },
  {
    q: "¿Hay contrato de permanencia?",
    a: "No. Cancela cuando quieras. Si cancelas, conservas el acceso hasta el final del período pagado.",
  },
  {
    q: "¿Los precios son en dólares?",
    a: "Sí, en USD. Aceptamos tarjetas de crédito/débito internacionales a través de Stripe, de forma segura.",
  },
  {
    q: "¿Puedo importar mis contactos actuales?",
    a: "Sí. Importa contactos desde Excel o CSV en segundos. También soportamos importación desde otros CRMs.",
  },
];

const toolStack: StackTool[] = [
  { domain: "kommo.com", name: "Kommo CRM", price: "$50/mes", brandColor: "bg-blue-600" },
  { domain: "lovable.dev", name: "Lovable", price: "$25/mes", brandColor: "bg-pink-500" },
  { domain: "zapier.com", name: "Zapier Professional", price: "$49/mes", brandColor: "bg-orange-500" },
  { domain: "mailchimp.com", name: "Mailchimp Standard", price: "$20/mes", brandColor: "bg-yellow-500" },
  { domain: "manychat.com", name: "ManyChat Pro", price: "$15/mes", brandColor: "bg-blue-500" },
];

const klosifyIncludes = [
  "CRM completo",
  "Landings con IA",
  "Integraciones nativas (sin Zapier)",
  "Email marketing",
  "Automatizaciones Instagram",
  "WhatsApp Business nativo",
  "Meta Ads + ROAS",
];

const integrationLogos: IntegrationLogo[] = [
  { domain: "whatsapp.com", name: "WhatsApp", brandColor: "bg-green-500" },
  { domain: "meta.com", name: "Meta", brandColor: "bg-blue-600" },
  { domain: "instagram.com", name: "Instagram", brandColor: "bg-pink-500" },
  { domain: "tiktok.com", name: "TikTok", brandColor: "bg-slate-800" },
  { domain: "google.com", name: "Google", brandColor: "bg-blue-500" },
];

const featureCards: FeatureCard[] = [
  {
    icon: MessageCircle,
    title: "WhatsApp Business Nativo",
    desc: "Gestión completa de conversaciones desde el CRM. Sin apps externas.",
    bullets: [
      "Plantillas aprobadas por Meta",
      "Respuestas automáticas 24/7",
      "Bandeja multiagente centralizada",
    ],
    color: "bg-green-500",
  },
  {
    icon: BarChart3,
    title: "Meta Ads + ROAS Real",
    desc: "Conecta tus campañas y ve el retorno real de cada peso invertido.",
    bullets: [
      "Facebook e Instagram Ads",
      "ROAS por campaña y ad set",
      "Leads sincronizados al pipeline",
    ],
    color: "bg-blue-500",
  },
  {
    icon: Layout,
    title: "Landings con IA",
    desc: "Describe tu página y la IA la genera en segundos, lista para capturar leads.",
    bullets: [
      "Editor drag & drop incluido",
      "Formularios → leads automáticos",
      "Subdominio gratis incluido",
    ],
    color: "bg-purple-500",
  },
  {
    icon: Brain,
    title: "IA Boost — Lead Scoring",
    desc: "La IA prioriza tus leads según probabilidad de cierre y temperatura de compra.",
    bullets: [
      "Score de 1 a 10 por lead",
      "Detección automática de objeciones",
      "Recomendaciones de siguiente paso",
    ],
    color: "bg-orange-500",
  },
  {
    icon: GitBranch,
    title: "Automatizaciones",
    desc: "Flujos inteligentes para WhatsApp, asignación de leads y seguimientos.",
    bullets: [
      "WhatsApp + email + tareas",
      "Condiciones y bifurcaciones",
      "Plantillas por industria listas",
    ],
    color: "bg-pink-500",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Visual",
    desc: "Kanban de oportunidades sin nada perdido. Todo tu proceso comercial en un vistazo.",
    bullets: [
      "Etapas 100% personalizables",
      "Alertas de seguimiento vencido",
      "Pronóstico de ingresos del mes",
    ],
    color: "bg-teal-500",
  },
];

const addOns: AddOn[] = [
  {
    icon: Wand2,
    label: "+5 Landings IA",
    price: "$9",
    iconColor: "text-purple-600",
    iconBg: "bg-purple-100",
  },
  {
    icon: Target,
    label: "+1.000 IA Boost",
    price: "$9",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
  },
  {
    icon: Rocket,
    label: "+5.000 IA Boost",
    price: "$39",
    iconColor: "text-orange-600",
    iconBg: "bg-orange-100",
  },
  {
    icon: UserPlus,
    label: "Seat adicional",
    price: "$9/mes",
    iconColor: "text-teal-600",
    iconBg: "bg-teal-100",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Renders a Clearbit logo; falls back to a branded initial badge on error */
function LogoWithFallback({
  domain,
  name,
  brandColor,
  size = "w-8 h-8",
}: {
  domain: string;
  name: string;
  brandColor: string;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = name.charAt(0).toUpperCase();

  if (failed) {
    return (
      <div
        className={`${brandColor} ${size} rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={name}
      className={`${size} rounded-lg object-contain flex-shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors"
          >
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
      ))}
    </div>
  );
}

function PlanCard({ plan, isAnnual }: { plan: Plan; isAnnual: boolean }) {
  const price = isAnnual ? plan.annual : plan.monthly;

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 ${
        plan.popular
          ? "border-2 border-orange-500 shadow-2xl shadow-orange-500/10 md:scale-105 bg-white"
          : "border border-slate-200 bg-white shadow-sm"
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
            <Star className="w-3 h-3 fill-current" />
            Más Popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
        <p className="text-sm text-slate-500">{plan.desc}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-black text-slate-900">${price}</span>
          <span className="text-slate-500 mb-1">/mes</span>
        </div>
        {isAnnual && (
          <p className="text-xs text-green-600 font-medium mt-1">
            Facturado anualmente · Ahorras ${(plan.monthly - plan.annual) * 12}/año
          </p>
        )}
      </div>

      <Link
        to="/auth"
        className={`block text-center py-3 px-6 rounded-xl font-semibold text-sm transition-all mb-8 ${
          plan.popular
            ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:from-orange-400 hover:to-orange-500"
            : "border-2 border-slate-200 text-slate-700 hover:border-orange-500 hover:text-orange-500"
        }`}
      >
        {plan.cta}
      </Link>

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* ── NAVBAR ────────────────────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "backdrop-blur-md bg-slate-900/95 border-b border-slate-800 shadow-lg shadow-slate-900/20"
            : "backdrop-blur-md bg-slate-900/95 border-b border-slate-800"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Zap className="w-5 h-5 text-white fill-white" />
              </div>
              <span className="text-white font-bold text-lg tracking-tight">
                Klosify <span className="text-orange-500">CRM</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => scrollTo("features")}
                className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Funcionalidades
              </button>
              <button
                onClick={() => scrollTo("pricing")}
                className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Precios
              </button>
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                to="/auth"
                className="text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              >
                Iniciar sesión
              </Link>
              <Link
                to="/auth"
                className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
              >
                Empezar gratis →
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900">
            <div className="px-4 py-4 space-y-2">
              <button
                onClick={() => scrollTo("features")}
                className="block w-full text-left text-slate-300 hover:text-white py-2 px-3 rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Funcionalidades
              </button>
              <button
                onClick={() => scrollTo("pricing")}
                className="block w-full text-left text-slate-300 hover:text-white py-2 px-3 rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Precios
              </button>
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="block text-center border border-slate-700 text-slate-300 py-2.5 px-4 rounded-lg text-sm font-medium hover:border-slate-500 hover:text-white transition-all"
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="block text-center bg-orange-500 hover:bg-orange-400 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-all"
                >
                  Empezar gratis →
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 pt-32 pb-24 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(249,115,22,0.12),transparent)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_80%_80%,rgba(249,115,22,0.05),transparent)] pointer-events-none" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Nuevo — IA Boost: scoring automático de leads
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black text-white leading-tight mt-0">
            El CRM para equipos que
            <br />
            <span className="text-orange-500">venden por WhatsApp</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mt-6 leading-relaxed">
            Pipeline de ventas, WhatsApp Business nativo, Meta Ads con ROAS y landing
            pages con IA — todo desde $29/mes.
          </p>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              to="/auth"
              className="bg-orange-500 hover:bg-orange-400 text-white px-8 py-4 rounded-xl text-base font-bold transition-all shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5"
            >
              Crear cuenta gratis →
            </Link>
            <button
              onClick={() => scrollTo("pricing")}
              className="text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-8 py-4 rounded-xl text-base font-semibold transition-all"
            >
              Ver planes
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8">
            {["Sin tarjeta de crédito", "14 días gratis", "Cancela cuando quieras"].map(
              (badge) => (
                <div key={badge} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm text-slate-400">{badge}</span>
                </div>
              )
            )}
          </div>

          {/* Integration logos */}
          <div className="mt-16 pt-8 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-6">
              Se integra con
            </p>
            <div className="flex items-center justify-center gap-8 flex-wrap">
              {integrationLogos.map((logo) => (
                <div
                  key={logo.domain}
                  className="grayscale opacity-60 hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                >
                  <LogoWithFallback
                    domain={logo.domain}
                    name={logo.name}
                    brandColor={logo.brandColor}
                    size="w-8 h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────────── */}
      <section id="features" className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">
              Por qué Klosify
            </p>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900">
              Todo lo que necesitas para vender más
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="group p-8 rounded-2xl border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white cursor-default"
                >
                  <div
                    className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-5 shadow-lg`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{card.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">{card.desc}</p>
                  <ul className="space-y-2">
                    {card.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0 mt-1.5" />
                        <span className="text-xs text-slate-400">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── STACK SAVINGS ────────────────────────────────────────────────────── */}
      <section className="bg-orange-50/50 py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">
              ¿Cuánto pagarías sin Klosify?
            </h2>
            <p className="text-lg text-slate-500">Suma las herramientas que reemplazamos</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6">
            {/* LEFT — traditional stack */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-5">
                Stack tradicional
              </p>
              <div className="space-y-4">
                {toolStack.map((tool) => (
                  <div key={tool.domain} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <LogoWithFallback
                        domain={tool.domain}
                        name={tool.name}
                        brandColor={tool.brandColor}
                        size="w-8 h-8"
                      />
                      <span className="text-sm font-medium text-slate-700">{tool.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-red-500 flex-shrink-0">
                      {tool.price}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Total mensual</span>
                <span className="text-2xl font-black text-red-500">$159/mes</span>
              </div>
            </div>

            {/* VS badge */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black tracking-tighter">VS</span>
              </div>
            </div>

            {/* RIGHT — Klosify */}
            <div className="bg-white rounded-2xl border-2 border-orange-500 p-6 shadow-xl shadow-orange-500/10 relative">
              <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-5">
                Klosify Pro
              </p>
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

              {/* Price box */}
              <div className="bg-slate-900 rounded-xl p-5 mt-6 text-center">
                <p className="text-3xl font-black text-white mb-2">$39/mes</p>
                <div className="inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold mb-2">
                  <BadgePercent className="w-3.5 h-3.5" />
                  Ahorras $120/mes
                </div>
                <p className="text-slate-500 text-xs">$1.440/año en tu bolsillo</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">
              Precios
            </p>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6">
              Simple, transparente, sin sorpresas
            </h2>

            {/* Billing toggle */}
            <div className="inline-flex items-center bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  !isAnnual
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isAnnual
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Anual
                <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  2 meses gratis
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto pb-8">
            {plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} isAnnual={isAnnual} />
            ))}
          </div>

          {/* Add-ons */}
          <div className="mt-10">
            <p className="text-center text-sm font-semibold text-slate-500 mb-5 uppercase tracking-wide">
              Complementos disponibles
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {addOns.map((addon) => {
                const AddonIcon = addon.icon;
                return (
                  <div
                    key={addon.label}
                    className="bg-slate-50 rounded-xl p-5 text-center border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all"
                  >
                    <div
                      className={`w-10 h-10 ${addon.iconBg} rounded-xl flex items-center justify-center mx-auto mb-3`}
                    >
                      <AddonIcon className={`w-5 h-5 ${addon.iconColor}`} />
                    </div>
                    <p className="text-xs font-semibold text-slate-700 mb-1">{addon.label}</p>
                    <p className="text-sm font-black text-orange-500">{addon.price}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-black text-slate-900">Preguntas frecuentes</h2>
          </div>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────────── */}
      <section className="bg-slate-900 py-24 text-center relative overflow-hidden">
        {/* Radial orange glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(249,115,22,0.15),transparent)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_30%_40%_at_50%_50%,rgba(249,115,22,0.08),transparent)] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
            Empieza hoy. Es gratis.
          </h2>
          <p className="text-lg text-slate-400 mb-10">
            14 días de prueba sin tarjeta de crédito. Cancela cuando quieras.
          </p>
          <Link
            to="/auth"
            className="inline-block bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white px-10 py-4 rounded-xl text-base font-bold transition-all shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-0.5"
          >
            Crear mi cuenta gratis →
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6">
            {["Sin setup técnico", "Soporte en español", "Datos seguros en LATAM"].map((b) => (
              <div key={b} className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-600">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 text-slate-400 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-10 border-b border-slate-800">
            {/* Brand */}
            <div className="md:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                  <Zap className="w-4 h-4 text-white fill-white" />
                </div>
                <span className="text-white font-bold">
                  Klosify <span className="text-orange-500">CRM</span>
                </span>
              </Link>
              <p className="text-sm leading-relaxed text-slate-500">
                El CRM hecho para LATAM
              </p>
            </div>

            {/* Producto */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wide">
                Producto
              </h4>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => scrollTo("features")}
                    className="text-sm hover:text-white transition-colors"
                  >
                    Funcionalidades
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollTo("pricing")}
                    className="text-sm hover:text-white transition-colors"
                  >
                    Precios
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wide">
                Legal
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/terms" className="text-sm hover:text-white transition-colors">
                    Términos
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="text-sm hover:text-white transition-colors">
                    Privacidad
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wide">
                Contacto
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="mailto:soporte@klosify.com"
                    className="text-sm hover:text-white transition-colors"
                  >
                    soporte@klosify.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/klosifycrm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:text-white transition-colors"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="https://wa.me/message/klosify"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:text-white transition-colors"
                  >
                    WhatsApp
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-600 flex items-center gap-1.5">
              © 2026 Klosify CRM · Hecho con
              <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 inline" />
              para LATAM
            </p>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" />
              <span className="text-xs text-slate-700">SSL · GDPR · Datos seguros</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
