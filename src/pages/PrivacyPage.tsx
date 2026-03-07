const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Política de Privacidad</h1>
        <p className="text-muted-foreground">Última actualización: Marzo 2026</p>
        
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Datos que recopilamos</h2>
          <p className="text-muted-foreground">
            Recopilamos información de contacto (nombre, correo electrónico, teléfono) proporcionada 
            voluntariamente a través de formularios de Facebook Lead Ads y otras fuentes integradas.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Uso de los datos</h2>
          <p className="text-muted-foreground">
            Los datos se utilizan exclusivamente para la gestión de relaciones con clientes (CRM), 
            seguimiento comercial y comunicación con los leads.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Eliminación de datos</h2>
          <p className="text-muted-foreground">
            Puedes solicitar la eliminación de tus datos en cualquier momento visitando nuestra 
            página de <a href="/data-deletion" className="text-primary underline">eliminación de datos</a> o 
            contactándonos por correo electrónico.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Contacto</h2>
          <p className="text-muted-foreground">
            Para cualquier consulta sobre privacidad, escríbenos a soporte@tudominio.com.
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPage;
