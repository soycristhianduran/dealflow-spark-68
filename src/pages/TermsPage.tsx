/**
 * Public-facing Terms of Service.
 *
 * Required by Meta App Review (optional but recommended) — adds credibility
 * to the app submission.  Configured in Meta App Dashboard under
 * Settings → Basic → Terms of Service URL.
 */
const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <article className="max-w-3xl mx-auto prose prose-slate dark:prose-invert">
        <h1>Términos y Condiciones de Servicio</h1>
        <p className="text-sm text-muted-foreground">
          Última actualización: 14 de mayo de 2026
        </p>

        <h2>1. Aceptación</h2>
        <p>
          Estos Términos rigen el uso de <strong>Klosify CRM</strong> (en
          adelante, "el Servicio"), una plataforma de software como servicio
          (SaaS) operada por <strong>CRISTHIAN DURAN</strong>, identificado
          con NIT <strong>1094270110-2</strong>, domiciliado en Colombia (en
          adelante, "Klosify CRM" o "nosotros").
        </p>
        <p>
          Al registrarte, acceder o utilizar el Servicio, aceptas estos
          Términos en su totalidad. Si no estás de acuerdo, no debes
          utilizar el Servicio.
        </p>

        <h2>2. Descripción del Servicio</h2>
        <p>
          Klosify CRM es una herramienta de gestión de relaciones con
          clientes (CRM) que permite a empresas y profesionales:
        </p>
        <ul>
          <li>Gestionar leads provenientes de Facebook Lead Ads, Instagram,
            WhatsApp y formularios propios.</li>
          <li>Centralizar conversaciones de Instagram Direct Messages y
            WhatsApp Business en un solo panel.</li>
          <li>Administrar pipelines de ventas, tareas, reuniones y contactos.</li>
          <li>Utilizar automatizaciones de respuestas, comentarios y mensajes.</li>
          <li>Recibir análisis de IA sobre la calidad de los leads y el
            sentimiento de las conversaciones.</li>
        </ul>

        <h2>3. Cuenta y elegibilidad</h2>
        <ul>
          <li>Debes ser mayor de 18 años para registrarte.</li>
          <li>Debes proporcionar información veraz y actualizada.</li>
          <li>Eres responsable de mantener la confidencialidad de tus
            credenciales.</li>
          <li>Cualquier actividad realizada con tu cuenta es responsabilidad
            tuya.</li>
        </ul>

        <h2>4. Uso aceptable</h2>
        <p>Te comprometes a NO utilizar el Servicio para:</p>
        <ul>
          <li>Enviar spam, mensajes no solicitados masivos o
            comunicaciones engañosas.</li>
          <li>Violar las políticas de plataforma de Meta (Facebook,
            Instagram, WhatsApp), incluida la <em>Messenger Platform Policy</em>{" "}
            y la <em>WhatsApp Business Policy</em>.</li>
          <li>Recopilar datos personales sin consentimiento o sin base legal.</li>
          <li>Suplantar identidad de terceros.</li>
          <li>Realizar ingeniería inversa, decompilar o intentar acceder al
            código fuente del Servicio.</li>
          <li>Vender, sublicenciar o redistribuir el Servicio.</li>
          <li>Sobrecargar la infraestructura mediante uso anormal o
            automatizado abusivo.</li>
        </ul>
        <p>
          El incumplimiento puede resultar en suspensión o terminación
          inmediata de tu cuenta sin reembolso.
        </p>

        <h2>5. Integraciones con Meta</h2>
        <p>
          Al conectar tus cuentas de Facebook, Instagram o WhatsApp a
          Klosify CRM, autorizas a Klosify CRM a acceder, almacenar y
          procesar los datos descritos en nuestra{" "}
          <a href="/privacy" className="text-primary underline">Política de Privacidad</a>{" "}
          a través de las APIs oficiales de Meta.
        </p>
        <p>
          Puedes revocar este acceso en cualquier momento desde Instagram →
          Configuración → Apps y sitios web, o desde el panel de Klosify
          CRM. La revocación dispara la eliminación de los datos asociados
          según se detalla en la{" "}
          <a href="/data-deletion" className="text-primary underline">
            página de eliminación de datos
          </a>.
        </p>

        <h2>6. Propiedad intelectual</h2>
        <ul>
          <li>El código, diseño, marca y contenido del Servicio son propiedad
            exclusiva de CRISTHIAN DURAN.</li>
          <li>Los datos que el Cliente carga al Servicio (contactos, mensajes,
            archivos) siguen siendo propiedad del Cliente. Klosify CRM
            actúa como encargado del tratamiento, no como propietario.</li>
          <li>Otorgas a Klosify CRM una licencia limitada y no exclusiva
            para procesar tus datos solo en la medida necesaria para
            prestar el Servicio.</li>
        </ul>

        <h2>7. Disponibilidad y mantenimiento</h2>
        <p>
          Hacemos esfuerzos razonables para mantener el Servicio disponible
          24/7, pero no garantizamos disponibilidad ininterrumpida.
          Realizamos mantenimientos programados con previo aviso cuando es
          posible.
        </p>

        <h2>8. Suscripción, precios y cancelación</h2>
        <p>
          Los planes, precios y métodos de pago se publican en la página de
          precios de Klosify CRM. Puedes cancelar tu suscripción en
          cualquier momento; la cancelación se hace efectiva al final del
          ciclo de facturación en curso. No hay reembolsos por períodos
          parcialmente utilizados, salvo obligación legal.
        </p>

        <h2>9. Limitación de responsabilidad</h2>
        <p>
          En la máxima medida permitida por la ley aplicable:
        </p>
        <ul>
          <li>El Servicio se presta <em>"tal cual"</em> y <em>"según
            disponibilidad"</em>, sin garantías expresas o implícitas.</li>
          <li>Klosify CRM no es responsable de daños indirectos,
            incidentales, especiales, consecuentes o lucro cesante.</li>
          <li>La responsabilidad agregada de Klosify CRM por cualquier
            reclamo no excederá el monto pagado por el Cliente en los 12
            meses anteriores al evento que origina la reclamación.</li>
          <li>No nos hacemos responsables por interrupciones derivadas de
            cambios en las APIs de Meta, downtime de proveedores
            (Supabase, Vercel, OpenAI) o fuerza mayor.</li>
        </ul>

        <h2>10. Indemnización</h2>
        <p>
          Aceptas indemnizar y mantener indemne a CRISTHIAN DURAN y al
          equipo de Klosify CRM frente a cualquier reclamación de
          terceros derivada del uso indebido del Servicio por tu parte,
          incluido el incumplimiento de las políticas de plataforma de
          Meta, el envío de spam o la violación de derechos de terceros.
        </p>

        <h2>11. Terminación</h2>
        <p>
          Podemos suspender o terminar tu cuenta si:
        </p>
        <ul>
          <li>Violas estos Términos.</li>
          <li>Tu actividad pone en riesgo la integridad del Servicio o la
            relación de Klosify CRM con Meta u otros proveedores.</li>
          <li>Falta de pago.</li>
          <li>Solicitud de autoridad competente.</li>
        </ul>

        <h2>12. Ley aplicable y jurisdicción</h2>
        <p>
          Estos Términos se rigen por la legislación de la <strong>República
            de Colombia</strong>. Cualquier disputa será sometida a los
          jueces competentes del domicilio de Klosify CRM, renunciando las
          partes a cualquier otro fuero.
        </p>

        <h2>13. Cambios a los Términos</h2>
        <p>
          Podemos actualizar estos Términos. Notificaremos cambios materiales
          por correo electrónico con al menos 15 días de anticipación. El
          uso continuado del Servicio tras la entrada en vigor implica
          aceptación de los nuevos Términos.
        </p>

        <h2>14. Contacto</h2>
        <p>
          Preguntas, reclamos o notificaciones legales:
        </p>
        <ul>
          <li>Email:{" "}
            <a href="mailto:contacto@aceleradoradeventas.co" className="text-primary underline">
              contacto@aceleradoradeventas.co
            </a></li>
          <li>Responsable: CRISTHIAN DURAN — NIT 1094270110-2</li>
          <li>Domicilio: Colombia</li>
        </ul>
      </article>
    </div>
  );
};

export default TermsPage;
