/**
 * Public-facing Data Deletion Instructions page.
 *
 * Meta App Review verifies this URL exists.  The reviewer needs to see:
 * - A clear way for an end user (the IG user that messaged a customer) to
 *   request that their data be removed.
 * - A defined timeframe and confirmation process.
 *
 * We don't host an automated callback at this URL (Meta accepts manual
 * instructions instead) — when Meta sends a Data Deletion Request via the
 * Webhook, we process it server-side.  This page is what the user sees if
 * they navigate here directly.
 */
const DataDeletionPage = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <article className="max-w-3xl mx-auto prose prose-slate dark:prose-invert">
        <h1>Eliminación de Datos Personales</h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: 14 de mayo de 2026
        </p>

        <h2>Tu derecho a la eliminación</h2>
        <p>
          De acuerdo con la Ley 1581 de 2012 (Colombia), el GDPR (Unión
          Europea) y las políticas de plataforma de Meta, cualquier persona
          cuyos datos sean tratados por <strong>Klosify CRM</strong>
          (operado por CRISTHIAN DURAN, NIT 1094270110-2) tiene derecho a
          solicitar su eliminación.
        </p>
        <p>Esto incluye:</p>
        <ul>
          <li>Usuarios de Instagram cuyas conversaciones (DMs) o comentarios
            están almacenados en nuestra base de datos.</li>
          <li>Contactos de WhatsApp del cliente que usa Klosify CRM.</li>
          <li>Leads generados a través de Facebook Lead Ads.</li>
          <li>Cualquier persona cuyos datos hayan sido almacenados por
            nuestros Clientes en el CRM.</li>
        </ul>

        <h2>Cómo solicitar la eliminación</h2>

        <h3>Opción 1 — Eliminación directa por el cliente del CRM</h3>
        <p>
          Si tus datos están en la cuenta de un Cliente de Klosify CRM,
          contacta directamente con esa empresa o profesional. Ellos pueden
          eliminar tus datos inmediatamente desde su panel.
        </p>

        <h3>Opción 2 — Solicitud directa a Klosify CRM</h3>
        <p>
          Envía un correo a{" "}
          <a href="mailto:hola@klosify.com" className="text-primary underline">
            hola@klosify.com
          </a>{" "}
          con:
        </p>
        <ul>
          <li><strong>Asunto:</strong> "Solicitud de eliminación de datos"</li>
          <li><strong>Cuerpo:</strong> Tu nombre completo, identificador
            público (por ejemplo, tu @username de Instagram, número de
            teléfono o correo) y la razón de la solicitud.</li>
          <li>Opcionalmente, indica de qué empresa cliente proviene la
            recolección de tus datos (si lo sabes).</li>
        </ul>

        <h3>Opción 3 — Solicitud automatizada a través de Meta</h3>
        <p>
          Si previamente conectaste tu cuenta de Instagram o Facebook a
          Klosify CRM y deseas revocar el acceso completo:
        </p>
        <ol>
          <li>Abre Instagram → Configuración → <strong>Apps y sitios web</strong>{" "}
            (<a
              href="https://www.instagram.com/accounts/manage_access/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              instagram.com/accounts/manage_access
            </a>)
          </li>
          <li>Busca <strong>"CRM ADV Messages"</strong> o
            <strong> "Klosify CRM"</strong></li>
          <li>Click en <strong>"Eliminar"</strong> — esto revoca todos los
            permisos otorgados y dispara automáticamente una notificación a
            Klosify CRM para eliminar tus datos.</li>
        </ol>

        <h2>Tiempo de procesamiento</h2>
        <p>
          Eliminaremos los datos en un plazo máximo de{" "}
          <strong>30 días hábiles</strong> desde la recepción de la solicitud.
          Te enviaremos confirmación por correo electrónico cuando la
          eliminación se haya completado.
        </p>

        <h2>Qué se elimina</h2>
        <ul>
          <li>Tu identificador en Meta (IGSID, PSID, número de WhatsApp).</li>
          <li>Contenido de mensajes y comentarios asociados a tu identidad.</li>
          <li>Archivos multimedia (imágenes, audio, video) enviados desde o
            recibidos por tu cuenta.</li>
          <li>Tu nombre, foto de perfil y datos derivados.</li>
          <li>Cualquier análisis de IA (puntuación, sentimiento) generado a
            partir de tus interacciones.</li>
        </ul>

        <h2>Excepciones</h2>
        <p>
          Algunos datos pueden conservarse por obligación legal (por ejemplo,
          registros tributarios o de facturación de los Clientes), pero
          anonimizados — sin posibilidad de relacionarlos contigo.
        </p>

        <h2>Contacto</h2>
        <p>
          Cualquier duda sobre el proceso de eliminación:
        </p>
        <ul>
          <li>Email:{" "}
            <a href="mailto:hola@klosify.com" className="text-primary underline">
              hola@klosify.com
            </a></li>
          <li>Responsable: CRISTHIAN DURAN — NIT 1094270110-2</li>
        </ul>
      </article>
    </div>
  );
};

export default DataDeletionPage;
