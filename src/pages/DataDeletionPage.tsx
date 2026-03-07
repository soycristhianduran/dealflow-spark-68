const DataDeletionPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Eliminación de Datos de Usuario</h1>
        <p className="text-muted-foreground">
          Si deseas solicitar la eliminación de tus datos asociados a nuestra aplicación, 
          por favor envía un correo a <strong>soporte@tudominio.com</strong> con el asunto 
          "Solicitud de eliminación de datos" e incluye tu nombre y correo electrónico registrado.
        </p>
        <p className="text-muted-foreground">
          Procesaremos tu solicitud en un plazo máximo de 30 días hábiles y te notificaremos 
          cuando tus datos hayan sido eliminados.
        </p>
        <p className="text-sm text-muted-foreground/70">
          De acuerdo con la política de la plataforma Meta, los usuarios tienen derecho a 
          solicitar la eliminación de los datos recopilados a través de nuestra integración.
        </p>
      </div>
    </div>
  );
};

export default DataDeletionPage;
