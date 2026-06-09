import { LegalPageLayout } from "@/components/landing/LegalPageLayout";

const sections = [
  { id: "responsable",   title: "1. Responsable del tratamiento" },
  { id: "datos",         title: "2. Datos que recopilamos" },
  { id: "uso",           title: "3. Uso de los datos" },
  { id: "terceros",      title: "4. Compartición con terceros" },
  { id: "retencion",     title: "5. Retención de datos" },
  { id: "derechos",      title: "6. Derechos del titular" },
  { id: "seguridad",     title: "7. Seguridad" },
  { id: "cookies",       title: "8. Cookies" },
  { id: "menores",       title: "9. Menores de edad" },
  { id: "cambios",       title: "10. Cambios a esta política" },
  { id: "contacto",      title: "11. Contacto" },
];

const PrivacyPage = () => (
  <LegalPageLayout
    title="Política de Privacidad"
    subtitle="Cómo recopilamos, usamos y protegemos tus datos personales en Klosify CRM."
    lastUpdated="14 de mayo de 2026"
    sections={sections}
  >
    <h2 id="responsable">1. Responsable del tratamiento</h2>
    <p>
      <strong>CRISTHIAN DURAN</strong> (en adelante, "Klosify CRM" o "nosotros"),
      con identificación tributaria <strong>NIT 1094270110-2</strong>, domiciliado
      en Colombia, es el responsable del tratamiento de los datos personales
      recopilados a través de la aplicación accesible en <code>klosify.com</code> y
      sus subdominios.
    </p>
    <p>
      Esta política describe cómo recopilamos, usamos, almacenamos y protegemos
      los datos de los usuarios de Klosify CRM ("Clientes") y de los terceros que
      interactúan con ellos a través de las plataformas integradas — Meta
      (Facebook, Instagram, WhatsApp) y otras.
    </p>

    <h2 id="datos">2. Datos que recopilamos</h2>
    <h3>2.1. De nuestros Clientes (suscriptores del CRM)</h3>
    <ul>
      <li>Nombre, correo electrónico, número de teléfono.</li>
      <li>Datos de la organización (empresa, cargo, dominio).</li>
      <li>Credenciales OAuth (tokens) emitidos por Meta para acceder a las cuentas
        de Facebook, Instagram y WhatsApp del Cliente — almacenados de forma
        cifrada y nunca expuestos al usuario final.</li>
      <li>Configuración de la cuenta, automatizaciones y preferencias.</li>
    </ul>

    <h3>2.2. Datos provenientes de Meta (Instagram, Facebook, WhatsApp)</h3>
    <p>
      Cuando un Cliente conecta sus cuentas de Meta a Klosify CRM, recibimos a
      través de las APIs oficiales de Meta los siguientes datos:
    </p>
    <ul>
      <li><strong>Mensajes directos de Instagram (DMs)</strong> entrantes y salientes
        — texto, imágenes, audio, video, archivos y reels compartidos. Permiso
        requerido: <code>instagram_business_manage_messages</code>.</li>
      <li><strong>Comentarios públicos</strong> en publicaciones del Cliente, con el
        nombre de usuario público del comentarista. Permiso:{" "}
        <code>instagram_manage_comments</code>.</li>
      <li><strong>Información básica de la cuenta de Instagram</strong> del Cliente:
        nombre de usuario, foto de perfil, ID de la cuenta y de las publicaciones.
        Permiso: <code>instagram_business_basic</code>.</li>
      <li><strong>Información del perfil público</strong> del remitente de un mensaje
        (IGSID, nombre y foto de perfil) — solo cuando esa persona ha iniciado una
        conversación con el Cliente.</li>
      <li><strong>Mensajes de WhatsApp Business</strong> entrantes y salientes del
        número conectado por el Cliente.</li>
      <li><strong>Leads generados por Facebook Lead Ads</strong>: los campos que el
        lead llenó voluntariamente en el formulario.</li>
    </ul>

    <h2 id="uso">3. Uso de los datos</h2>
    <p>Utilizamos los datos exclusivamente para:</p>
    <ul>
      <li>Mostrar las conversaciones, mensajes y leads en el panel del Cliente para
        que pueda gestionar sus relaciones comerciales.</li>
      <li>Permitir al Cliente responder mensajes, publicar comentarios y gestionar
        su pipeline de ventas.</li>
      <li>Ejecutar automatizaciones configuradas por el Cliente (por ejemplo,
        responder automáticamente a comentarios con palabras clave).</li>
      <li>Análisis con IA del contenido de las conversaciones — únicamente para
        generar puntuación de leads, sentimiento y sugerencias para el Cliente.{" "}
        <strong>El contenido no se utiliza para entrenar modelos de IA
        generales.</strong></li>
      <li>Soporte técnico y mejoras del producto.</li>
    </ul>
    <p>
      <strong>No vendemos, alquilamos ni cedemos datos a terceros con fines
      publicitarios.</strong> No utilizamos los mensajes de Instagram/WhatsApp para
      enviar publicidad propia ni de terceros.
    </p>

    <h2 id="terceros">4. Compartición con terceros</h2>
    <p>
      Compartimos datos únicamente con los siguientes subprocesadores, todos
      vinculados por acuerdos de confidencialidad y procesamiento de datos:
    </p>
    <ul>
      <li><strong>Supabase Inc.</strong> — alojamiento de base de datos, almacenamiento
        de archivos multimedia y funciones serverless (servidores en EE.UU. y Europa).</li>
      <li><strong>Vercel Inc.</strong> — alojamiento del frontend (servidores en EE.UU.).</li>
      <li><strong>OpenAI, L.L.C.</strong> — procesamiento del contenido de las
        conversaciones para la generación de puntuación de leads y análisis de
        sentimiento (uso bajo el modo <em>API</em>, sin entrenamiento con tus datos).</li>
      <li><strong>Meta Platforms, Inc.</strong> — APIs de Facebook, Instagram y WhatsApp
        utilizadas para enviar y recibir mensajes en nombre del Cliente.</li>
    </ul>
    <p>
      No compartimos datos con terceros con fines comerciales propios. No transferimos
      datos a autoridades salvo requerimiento judicial legalmente válido.
    </p>

    <h2 id="retencion">5. Retención de datos</h2>
    <ul>
      <li>Los datos de cuenta del Cliente se mantienen mientras la suscripción esté activa.</li>
      <li>Los mensajes, conversaciones y leads se conservan mientras el Cliente mantenga
        su cuenta — el Cliente puede eliminarlos en cualquier momento desde el panel.</li>
      <li>Tras la cancelación de la cuenta, eliminamos todos los datos del Cliente en un
        plazo máximo de <strong>30 días</strong>, salvo obligación legal de conservación.</li>
      <li>Los registros (logs) técnicos sin datos personales se conservan hasta 12 meses
        para auditoría de seguridad.</li>
    </ul>

    <h2 id="derechos">6. Derechos del titular del dato</h2>
    <p>
      De acuerdo con la Ley 1581 de 2012 (Colombia) y el GDPR (cuando aplicable),
      cualquier titular de datos personales puede:
    </p>
    <ul>
      <li>Acceder a la información que tenemos sobre él/ella.</li>
      <li>Solicitar rectificación o actualización.</li>
      <li>Solicitar eliminación (ver{" "}
        <a href="/data-deletion">página de eliminación de datos</a>).</li>
      <li>Revocar consentimientos otorgados.</li>
      <li>Presentar reclamación ante la autoridad de protección de datos (SIC en Colombia).</li>
    </ul>
    <p>
      Para ejercer cualquiera de estos derechos, escríbenos a{" "}
      <a href="mailto:hola@klosify.com">hola@klosify.com</a>. Respondemos en un
      plazo máximo de <strong>15 días hábiles</strong>.
    </p>

    <h2 id="seguridad">7. Seguridad</h2>
    <p>Implementamos las siguientes medidas:</p>
    <ul>
      <li>Cifrado en tránsito (TLS 1.2+) y en reposo (AES-256) para todos los datos almacenados.</li>
      <li>Aislamiento por organización en la base de datos mediante Row Level Security (RLS)
        — cada Cliente solo accede a sus propios datos.</li>
      <li>Tokens de Meta almacenados de forma cifrada, nunca expuestos al frontend.</li>
      <li>Acceso al sistema restringido y registrado.</li>
    </ul>

    <h2 id="cookies">8. Cookies</h2>
    <p>
      Klosify CRM utiliza únicamente cookies técnicas necesarias para el funcionamiento
      de la sesión (autenticación). No utilizamos cookies de rastreo publicitario ni de
      terceros.
    </p>

    <h2 id="menores">9. Menores de edad</h2>
    <p>
      Klosify CRM es un producto B2B dirigido a empresas y profesionales mayores de 18
      años. No recopilamos intencionalmente datos de menores. Si un Cliente recibe
      mensajes de menores a través de sus canales conectados, es responsabilidad del
      Cliente cumplir con la normativa aplicable.
    </p>

    <h2 id="cambios">10. Cambios a esta política</h2>
    <p>
      Notificaremos cambios materiales por correo electrónico al menos con 15 días de
      anticipación. La fecha de última actualización aparece al inicio de este documento.
    </p>

    <h2 id="contacto">11. Contacto</h2>
    <ul>
      <li>Email: <a href="mailto:hola@klosify.com">hola@klosify.com</a></li>
      <li>Responsable: CRISTHIAN DURAN — NIT 1094270110-2</li>
      <li>Domicilio: Colombia</li>
    </ul>
  </LegalPageLayout>
);

export default PrivacyPage;
