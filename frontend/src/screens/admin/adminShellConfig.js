export const ADMIN_SHELL_THEME = {
  appBg: '#070B12',
  panelBg: '#0F172A',
  panelBgSoft: '#0B1220',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textMuted: 'rgba(255,255,255,0.70)',
  brand: '#EC6819',
  info: '#8FB3C9',
  success: '#66BB6A',
  warning: '#D9A15A',
};

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Control',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/admin' },
      { key: 'reportes', label: 'Reportes', path: '/admin/reportes' },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { key: 'clientes', label: 'Clientes', path: '/admin/clientes' },
      { key: 'proveedores', label: 'Proveedores', path: '/admin/proveedores' },
      { key: 'operadores', label: 'Operadores', path: '/admin/operadores' },
      { key: 'maquinarias', label: 'Maquinarias', path: '/admin/maquinarias' },
      { key: 'precios', label: 'Precios', path: '/admin/pricing' },
      { key: 'reservas', label: 'Reservas', path: '/admin/reservas' },
      { key: 'matching', label: 'Asignacion', path: '/admin/matching' },
    ],
  },
  {
    label: 'Operacion',
    items: [
      { key: 'pagos', label: 'Pagos', path: '/admin/pagos' },
      { key: 'facturacion', label: 'Facturacion', path: '/admin/facturacion' },
      { key: 'soporte', label: 'Soporte', path: '/admin/soporte' },
      { key: 'logs', label: 'Actividad', path: '/admin/logs' },
    ],
  },
  {
    label: 'Ajustes',
    items: [
      { key: 'growth-ai', label: 'Growth AI', path: '/admin/growth-ai' },
      { key: 'configuracion', label: 'Configuracion', path: '/admin/configuracion' },
      { key: 'parametros', label: 'Reglas de negocio', path: '/admin/parametros' },
      { key: 'roles-permisos', label: 'Equipo y accesos', path: '/admin/roles-permisos' },
    ],
  },
];

export const ADMIN_DOMAIN_META = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Torre de control del marketplace',
  },
  clientes: {
    title: 'Clientes',
    subtitle: 'Base de clientes y actividad de demanda',
    summary:
      'Revisa identidad, historial e incidencias de cada cliente desde una vista dedicada.',
    actions: [
      { label: 'Ver clientes actuales', to: '/admin/users?tab=clients', tone: 'primary' },
    ],
  },
  proveedores: {
    title: 'Proveedores',
    subtitle: 'Cuentas proveedoras y salud de oferta',
    summary:
      'Concentra la cuenta proveedora, su relación con la operación y su estado general.',
    responsibilities: [
      'Gobernar la cuenta empresarial de oferta',
      'Relacionar equipo, catalogo y salud de cuenta',
      'Separar identidad del proveedor de operadores y maquinarias',
    ],
    actions: [
      { label: 'Ver proveedores actuales', to: '/admin/users?tab=providers', tone: 'primary' },
    ],
  },
  operadores: {
    title: 'Operadores',
    subtitle: 'Ejecutores operativos del servicio',
    summary:
      'Da visibilidad al estado operativo, documentación y vínculo de cada operador.',
    responsibilities: [
      'Gobernar la identidad operativa del ejecutor humano',
      'Vincular operador con proveedor y maquinarias habilitadas',
      'Hacer visible el estado operativo y la documentacion',
    ],
    actions: [],
  },
  maquinarias: {
    title: 'Maquinarias',
    subtitle: 'Catalogo listo para publicar y operar',
    summary:
      'Centraliza catálogo, publicación, completitud y relación de cada maquinaria con la oferta.',
    responsibilities: [
      'Administrar cada maquinaria y su estado',
      'Separar completitud, disponibilidad y publicacion',
      'Expresar relaciones con proveedor y operadores habilitados',
    ],
    actions: [
      { label: 'Ver maquinarias actuales', to: '/admin/users?tab=machines', tone: 'primary' },
      { label: 'Abrir precios de maquinarias', to: '/admin/pricing', tone: 'secondary' },
    ],
  },
  precios: {
    title: 'Precios',
    subtitle: 'Tarifas base y referencia de traslado por maquinaria',
    summary:
      'Concentra los precios de referencia que ordenan la publicacion y la operacion comercial de cada maquinaria.',
    responsibilities: [
      'Definir tarifa base por maquinaria',
      'Mantener referencias por capacidad y traslado',
      'Alinear publicacion comercial con reglas de negocio',
    ],
    actions: [
      { label: 'Abrir precios', to: '/admin/pricing', tone: 'primary' },
    ],
  },
  reservas: {
    title: 'Reservas',
    subtitle: 'Centro transaccional del servicio',
    summary:
      'Reúne el estado de cada servicio y su contexto operativo de principio a fin.',
    responsibilities: [
      'Contar el estado y timeline del servicio',
      'Unificar contexto de cliente, proveedor, operador y maquinaria',
      'Referenciar pagos, facturacion y soporte sin absorberlos',
    ],
    actions: [
      { label: 'Abrir reservas', to: '/admin/reservas', tone: 'primary' },
    ],
  },
  matching: {
    title: 'Asignacion',
    subtitle: 'Asignacion separada de la ejecucion',
    summary:
      'Muestra la carga de asignacion y los intentos realizados antes de la ejecucion.',
    responsibilities: [
      'Gobernar la carga activa de asignacion',
      'Registrar intentos, fallos y reintentos',
      'Escalar senales estructurales de avance insuficiente',
    ],
    actions: [
      { label: 'Abrir asignacion', to: '/admin/matching', tone: 'primary' },
    ],
  },
  pagos: {
    title: 'Pagos',
    subtitle: 'Cobros, pagos y comisiones',
    summary:
      'Concentra cobros, pagos, comisiones y alertas financieras del marketplace.',
    responsibilities: [
      'Gobernar cobros, pagos y comisiones',
      'Mostrar diferencias y conciliacion operativa',
      'Separar dinero de facturas y documentos tributarios',
    ],
    actions: [
      { label: 'Abrir pagos', to: '/admin/pagos', tone: 'primary' },
    ],
  },
  facturacion: {
    title: 'Facturacion',
    subtitle: 'Facturas y documentos tributarios',
    summary:
      'Ordena facturas, validaciones y documentos tributarios de cada servicio.',
    responsibilities: [
      'Gestionar documentos esperados y recibidos',
      'Separar revision de facturas del flujo de pagos',
      'Hacer visible el estado de facturas por reserva y actor',
    ],
    actions: [
      { label: 'Abrir facturación', to: '/admin/facturacion', tone: 'primary' },
    ],
  },
  soporte: {
    title: 'Soporte',
    subtitle: 'Incidencias, accesos y excepciones',
    summary:
      'Reúne tickets, bloqueos y excepciones que requieren seguimiento del equipo.',
    responsibilities: [
      'Gobernar tickets, bloqueos y accesos',
      'Escalar al area correcta sin mezclar responsabilidades',
      'Mantener historial y tiempos de respuesta de incidencias',
    ],
    actions: [
      { label: 'Abrir soporte', to: '/admin/soporte', tone: 'primary' },
    ],
  },
  reportes: {
    title: 'Reportes',
    subtitle: 'Informes semanales, mensuales y distribucion',
    summary:
      'Consulta informes semanales y mensuales, destinatarios y descargas desde una sola superficie.',
    responsibilities: [
      'Administrar informes semanales, mensuales y destinatarios',
      'Conservar una sola superficie de generacion y envio',
      'Permitir al panel resumir sin absorber el flujo completo',
    ],
    actions: [
      { label: 'Abrir reportes', to: '/admin/reportes', tone: 'primary' },
      { label: 'Ir a marketing', to: '/admin/marketing', tone: 'secondary' },
    ],
  },
  logs: {
    title: 'Actividad',
    subtitle: 'Eventos y seguimiento del sistema',
    summary:
      'Reserva una vista clara para revisar eventos y seguimiento del sistema.',
    responsibilities: [
      'Registrar eventos clave del negocio',
      'Relacionar actor, entidad, accion y severidad',
      'Dar soporte a investigacion y seguimiento interno',
    ],
    actions: [],
  },
  configuracion: {
    title: 'Configuracion',
    subtitle: 'Integraciones y ajustes globales',
    summary:
      'Centraliza integraciones y ajustes globales sensibles del sistema.',
    responsibilities: [
      'Controlar integraciones y ajustes globales',
      'Mantener minima la configuracion global',
      'Evitar absorber reglas variables del negocio',
    ],
    actions: [],
  },
  parametros: {
    title: 'Reglas de negocio',
    subtitle: 'Precios de referencia y reglas variables del negocio',
    summary:
      'Concentra precios de referencia y reglas variables del negocio en una sola vista.',
    responsibilities: [
      'Centralizar reglas ajustables del negocio',
      'Separar reglas operativas de configuracion tecnica',
      'Alimentar precios, asignacion y criterios de seleccion',
    ],
    actions: [
      { label: 'Ver reglas actuales', to: '/admin/pricing', tone: 'primary' },
    ],
  },
  'roles-permisos': {
    title: 'Equipo y accesos',
    subtitle: 'Personas del equipo y permisos de acceso',
    summary:
      'Ordena los accesos del equipo segun rol, area y responsabilidad.',
    responsibilities: [
      'Definir perfiles y permisos por area',
      'Separar quien ve, decide y ejecuta',
      'Hacer crecer el equipo sin perder control',
    ],
    actions: [],
  },
  'growth-ai': {
    title: 'Growth AI',
    subtitle: 'Expansion integrada al Admin',
    summary:
      'Growth AI queda integrado al Admin para expansión y activación comercial.',
    responsibilities: [
      'Gobernar expansion y activacion de oferta',
      'Relacionarse con reportes y reglas de negocio sin absorber catalogo base',
      'Converger a la misma gramatica del Admin oficial',
    ],
    actions: [
      { label: 'Abrir Growth AI', to: '/admin/growth-ai', tone: 'primary' },
    ],
  },
};
