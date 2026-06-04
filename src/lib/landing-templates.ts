// ── Landing Page Templates ─────────────────────────────────────────────────
// Each template has a seed_prompt that leverages FRESH_SYSTEM's CRO expertise.
// Selecting a template triggers direct generation — no typing required.

export type TemplateCategory = "leads" | "cita" | "evento" | "venta" | "recurso";

export interface LandingTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  industries: string[];
  gradient: string;       // Tailwind gradient classes for thumbnail
  iconName: string;       // lucide-react icon name
  seed_prompt: string;    // sent directly to the AI generator
}

export const TEMPLATE_CATEGORIES: { key: TemplateCategory | "all"; label: string }[] = [
  { key: "all",     label: "Todas" },
  { key: "leads",   label: "Captura de leads" },
  { key: "cita",    label: "Agendar cita" },
  { key: "evento",  label: "Eventos y webinars" },
  { key: "venta",   label: "Venta directa" },
  { key: "recurso", label: "Lead magnet" },
];

export const LANDING_TEMPLATES: LandingTemplate[] = [
  // ── CAPTURA DE LEADS ────────────────────────────────────────────────────────
  {
    id: "real-estate-launch",
    name: "Lanzamiento inmobiliario",
    description: "Pre-registro con urgencia, unidades limitadas y contador de tiempo.",
    category: "leads",
    industries: ["Inmobiliaria", "Construcción"],
    gradient: "from-emerald-600 to-teal-800",
    iconName: "Building2",
    seed_prompt: `Crea una landing page de alta conversión para el pre-lanzamiento de un proyecto inmobiliario residencial.
Objetivo: capturar leads interesados antes de la apertura oficial.
Estructura:
- Hero con headline de inversión/valorización, contador regresivo al lanzamiento, CTA "Reservar mi cupo"
- Sección de ubicación estratégica (ventajas del sector)
- Amenidades y características del proyecto (3 columnas con íconos)
- Planos o tipologías disponibles con precio desde
- Sección de urgencia: "Solo X unidades disponibles en pre-venta"
- Testimonios de compradores anteriores o del desarrollador
- Formulario de registro: nombre, teléfono, WhatsApp, presupuesto, ¿busca para vivir o invertir?
- Footer con logo, dirección y redes
Paleta: verdes profundos y dorados, sensación premium y natural. Tipografía elegante (Playfair Display + Inter).
Tono: exclusivo, aspiracional, orientado a inversión segura.`,
  },
  {
    id: "leads-service",
    name: "Servicio profesional",
    description: "Captura leads para servicios B2C con formulario de calificación.",
    category: "leads",
    industries: ["Consultoría", "Servicios", "Legal", "Contabilidad"],
    gradient: "from-blue-600 to-indigo-800",
    iconName: "Briefcase",
    seed_prompt: `Crea una landing page de alta conversión para capturar leads calificados para un servicio profesional (consultoría, asesoría legal, contabilidad o similar).
Objetivo: que el visitante deje sus datos para una llamada de diagnóstico gratuita.
Estructura:
- Hero: titular enfocado en el problema que resuelves + subtítulo con el resultado prometido + CTA "Quiero mi diagnóstico gratis"
- 3 problemas que enfrenta el cliente ideal (PAS — agitación)
- Solución: cómo trabajas, proceso en 3 pasos simples
- Resultados con números concretos (clientes atendidos, % de éxito, ahorro promedio)
- Testimonios con foto, nombre y empresa
- Sobre mí/nosotros: credenciales, años de experiencia
- Formulario: nombre, email, WhatsApp, empresa, ¿cuál es tu principal reto?
- Garantía o compromiso de respuesta en 24h
Paleta: azul corporativo confiable, blanco limpio, acentos dorados.
Tono: experto, cercano, orientado a resultados medibles.`,
  },
  {
    id: "saas-trial",
    name: "SaaS / Prueba gratis",
    description: "Prueba de 14 días, features y social proof para software.",
    category: "leads",
    industries: ["Tecnología", "SaaS", "Software"],
    gradient: "from-violet-600 to-purple-900",
    iconName: "Rocket",
    seed_prompt: `Crea una landing page de alta conversión para registrar usuarios a una prueba gratuita de un software SaaS.
Objetivo: máximo registro de trials con mínima fricción.
Estructura:
- Hero: headline con el beneficio principal (no la feature) + subtítulo + CTA "Empezar gratis — sin tarjeta" + badge "14 días gratis"
- Logos de empresas que lo usan (social proof inmediato)
- 3 problemas que resuelve vs 3 beneficios concretos (antes/después)
- Screenshot o mockup del producto con anotaciones
- Features principales (6 cards con ícono, nombre y descripción 1 línea)
- Testimonios con foto, nombre, cargo y empresa
- Precios (3 planes) con el plan popular destacado
- FAQ (5 preguntas más comunes)
- CTA final: "Empieza tu prueba gratuita hoy"
- Formulario: email, nombre, empresa, tamaño del equipo
Paleta: púrpura vibrante con fondo oscuro, gradientes modernos, estilo tech premium.
Tono: directo, orientado a ROI, lenguaje de producto.`,
  },
  {
    id: "local-business",
    name: "Negocio local",
    description: "Oferta especial para restaurante, spa, peluquería o tienda.",
    category: "leads",
    industries: ["Restaurante", "Salud y belleza", "Retail", "Entretenimiento"],
    gradient: "from-orange-500 to-red-700",
    iconName: "Store",
    seed_prompt: `Crea una landing page de alta conversión para un negocio local que quiere capturar datos de clientes potenciales con una oferta especial.
Objetivo: que el visitante deje su WhatsApp o email a cambio de un descuento, regalo o experiencia exclusiva.
Estructura:
- Hero: foto de producto/local de fondo + oferta irresistible destacada (ej: "20% en tu primera visita") + CTA "Quiero mi descuento"
- Qué incluye la oferta (bullets cortos, íconos)
- Galería de fotos del local / producto / servicio (grid 3 columnas)
- Reseñas de Google / testimonios de clientes reales (estrellas + texto)
- Ubicación + horarios + cómo llegar
- Formulario mínimo: nombre + WhatsApp
- Urgencia: "Válido solo hasta [fecha] o primeras X personas"
Paleta: cálida, vibrante, apetitosa. Colores anaranjados/rojos según el negocio.
Tono: cercano, entusiasta, local y auténtico.`,
  },

  // ── AGENDAR CITA ────────────────────────────────────────────────────────────
  {
    id: "medical-appointment",
    name: "Consulta médica / estética",
    description: "Primera cita gratis o a precio especial. Genera confianza y agenda.",
    category: "cita",
    industries: ["Salud", "Medicina estética", "Odontología", "Psicología"],
    gradient: "from-cyan-500 to-blue-700",
    iconName: "Stethoscope",
    seed_prompt: `Crea una landing page de alta conversión para agendar una primera consulta médica o estética.
Objetivo: que el visitante agende su cita (o deje datos para que lo contacten).
Estructura:
- Hero: foto del médico/clínica + titular enfocado en el resultado (ej: "Recupera tu confianza" no "Agenda tu cita") + subtítulo con la especialidad + CTA "Agenda mi consulta gratuita"
- El problema del paciente en sus propias palabras (empatía)
- Tu solución: tratamientos o servicios principales (3-4 cards con imagen y descripción)
- Antes/después o resultados representativos con disclaimer
- Credenciales: años de experiencia, certificaciones, número de pacientes atendidos
- Testimonios con foto y nombre (con permiso)
- Cómo funciona: 3 pasos (Agenda → Consulta → Tratamiento)
- Formulario: nombre, teléfono, WhatsApp, motivo de consulta, horario preferido
- Ubicación con mapa integrado
Paleta: azul claro y blanco, transmite limpieza, confianza y profesionalismo. Toques de verde salud.
Tono: empático, profesional, tranquilizador. Sin jerga médica.`,
  },
  {
    id: "consulting-appointment",
    name: "Consulta estratégica B2B",
    description: "Agenda una sesión de diagnóstico para servicios empresariales.",
    category: "cita",
    industries: ["Consultoría", "Marketing", "Finanzas", "Recursos humanos"],
    gradient: "from-slate-700 to-slate-900",
    iconName: "CalendarCheck",
    seed_prompt: `Crea una landing page de alta conversión para agendar una sesión de diagnóstico estratégico gratuita de 30 minutos para empresas.
Objetivo: que el decisor de una empresa agende una llamada de diagnóstico.
Estructura:
- Hero: titular directo al ROI (ej: "Descubre qué está frenando el crecimiento de tu empresa") + subtítulo con la promesa de la sesión + CTA "Agendar mi sesión gratuita"
- Qué vas a descubrir en la sesión (3-5 bullets concretos con íconos)
- Para quién es esta sesión (perfil de cliente ideal)
- Resultados que han logrado otros (métricas reales: % crecimiento, ahorro, etc.)
- Sobre el consultor: foto, credenciales, empresas con las que ha trabajado (logos)
- Testimonios de CEOs/directores con cargo y empresa
- Cómo funciona: selecciona horario → sesión por video → plan de acción
- CTA con urgencia: "Solo X espacios disponibles esta semana"
- Formulario: nombre, cargo, empresa, WhatsApp, ¿cuál es tu mayor reto ahora mismo?
Paleta: negro y gris oscuro, tipografía sans-serif moderna, acentos dorados. Aspecto premium ejecutivo.
Tono: directo, sin rodeos, orientado a resultados de negocio. Para tomadores de decisión.`,
  },

  // ── EVENTOS Y WEBINARS ──────────────────────────────────────────────────────
  {
    id: "webinar-registration",
    name: "Webinar / Masterclass",
    description: "Registro a clase en vivo con fecha, speakers y temario.",
    category: "evento",
    industries: ["Educación", "Marketing", "Negocios", "Tecnología"],
    gradient: "from-pink-500 to-rose-700",
    iconName: "Video",
    seed_prompt: `Crea una landing page de alta conversión para el registro a un webinar o masterclass gratuita en vivo.
Objetivo: máximos registros antes de la fecha del evento.
Estructura:
- Hero: imagen de fondo oscura + título del webinar impactante + fecha/hora prominente + contador regresivo + CTA "Quiero mi lugar gratis"
- Qué vas a aprender (5-7 bullets concretos, orientados a resultados)
- Para quién es (perfil del asistente ideal)
- Speaker(s): foto grande, nombre, cargo, empresa, credenciales en 2-3 líneas
- Agenda/temario (timeline o acordeón)
- Testimonios de ediciones anteriores o de seguidores
- FAQ (¿Es realmente gratis? ¿Habrá grabación? ¿Necesito experiencia previa?)
- Formulario de registro: nombre, email, WhatsApp, ¿cuál es tu mayor duda sobre el tema?
- Recordatorio: "Recibirás el link 1 hora antes por email y WhatsApp"
Paleta: oscura y vibrante, fúcsia/rosa con blanco. Energía y modernidad.
Tono: entusiasta, inspirador, accesible. Lenguaje de comunidad.`,
  },
  {
    id: "event-registration",
    name: "Evento presencial",
    description: "Inscripción a conferencia, taller o evento con aforo limitado.",
    category: "evento",
    industries: ["Empresarial", "Educación", "Networking", "Cultura"],
    gradient: "from-amber-500 to-orange-700",
    iconName: "Ticket",
    seed_prompt: `Crea una landing page de alta conversión para inscripción a un evento presencial (conferencia, taller, congreso o workshop).
Objetivo: vender entradas o inscripciones con urgencia de aforo.
Estructura:
- Hero: imagen del venue o edición anterior + nombre del evento grande + fecha, ciudad y venue + CTA "Quiero mi entrada"
- Propuesta de valor del evento (qué te llevas)
- Speakers o ponentes (grid de fotos con nombre, cargo y empresa)
- Agenda del día (horarios y temas)
- Tipos de entrada (general, VIP, etc.) con diferencias y precios
- Patrocinadores o aliados (logos)
- Testimonios de asistentes anteriores
- FAQ
- Urgencia: "X entradas disponibles — precio aumenta en [fecha]"
- Formulario: nombre, email, empresa, tipo de entrada, ciudad de origen
Paleta: naranja y dorado, energía y presencialidad. Foto de multitud o auditorio de fondo.
Tono: inspirador, exclusivo, sentido de comunidad y oportunidad única.`,
  },

  // ── VENTA DIRECTA ───────────────────────────────────────────────────────────
  {
    id: "online-course",
    name: "Curso online",
    description: "Venta de curso con módulos, garantía y precio con descuento.",
    category: "venta",
    industries: ["Educación", "Coaching", "Marketing digital", "Finanzas"],
    gradient: "from-green-500 to-emerald-800",
    iconName: "GraduationCap",
    seed_prompt: `Crea una landing page de alta conversión para vender un curso online.
Objetivo: convertir visitantes en compradores del curso directamente desde la página.
Estructura:
- Hero: resultado transformador como titular (ej: "Aprende a invertir en bolsa desde cero y genera tu primer ingreso en 60 días") + subtítulo con el para quién + precio tachado + precio actual + CTA "Quiero inscribirme"
- El antes y el después (problema que viven vs resultado que lograrán)
- Para quién ES y para quién NO ES este curso
- Módulos del curso (acordeón o cards con ícono, nombre y descripción corta)
- Bonos incluidos con valor monetario
- Sobre el instructor: foto, historia personal, credenciales, resultados propios
- Testimonios de alumnos con foto, nombre y resultado específico obtenido
- Garantía de satisfacción (ej: 7 días de devolución)
- Precio final con desglose de valor (suma de bonos vs precio del curso)
- FAQ (¿Cuánto tiempo necesito? ¿Tengo acceso de por vida? ¿Hay soporte?)
- CTA final con urgencia de precio o cupos
Paleta: verde y blanco, transmite crecimiento y aprendizaje. Acentos dorados para el precio.
Tono: motivador, transparente, orientado a transformación real. Evitar promesas exageradas.`,
  },

  // ── LEAD MAGNET / RECURSO ───────────────────────────────────────────────────
  {
    id: "lead-magnet-ebook",
    name: "Ebook / Guía gratuita",
    description: "Descarga un recurso gratuito a cambio del email del prospecto.",
    category: "recurso",
    industries: ["Marketing", "Finanzas", "Salud", "Negocios", "Legal"],
    gradient: "from-sky-500 to-blue-800",
    iconName: "BookOpen",
    seed_prompt: `Crea una landing page de alta conversión para la descarga gratuita de un ebook, guía o checklist.
Objetivo: capturar el email del visitante a cambio de un recurso de alto valor.
Estructura:
- Hero: mockup 3D del ebook/guía (describir como imagen de alta calidad) + titular con el beneficio concreto del recurso (ej: "La guía definitiva para...") + subtítulo + CTA "Quiero descargarlo gratis"
- Qué contiene el recurso (5-7 puntos concretos que van a aprender)
- Para quién es (perfil del lector ideal)
- El autor: foto, nombre, cargo, por qué está calificado para escribir esto
- Vista previa (3 páginas del contenido — describir como mockup)
- Testimonios de quienes ya lo descargaron y aplicaron
- Formulario mínimo: nombre + email
- Promesa de privacidad: "No spam. Solo contenido de valor."
- Frecuencia de envío si hay newsletter asociada
Paleta: azul cielo y blanco, clean y moderno. El recurso debe verse premium aunque sea gratuito.
Tono: educativo, generoso, posicionamiento de autoridad. Máxima simplicidad para máxima conversión.`,
  },
];

// Helper — filter by category
export function getTemplatesByCategory(category: TemplateCategory | "all"): LandingTemplate[] {
  if (category === "all") return LANDING_TEMPLATES;
  return LANDING_TEMPLATES.filter(t => t.category === category);
}
