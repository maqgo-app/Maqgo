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
      { key: 'reservas', label: 'Reservas', path: '/admin/reservas' },
      { key: 'matching', label: 'Matching', path: '/admin/matching' },
    ],
  },
  {
    label: 'Operacion',
    items: [
      { key: 'pagos', label: 'Pagos', path: '/admin/pagos' },
      { key: 'facturacion', label: 'Facturacion', path: '/admin/facturacion' },
      { key: 'soporte', label: 'Soporte', path: '/admin/soporte' },
      { key: 'logs', label: 'Logs', path: '/admin/logs' },
    ],
  },
  {
    label: 'Gobierno',
    items: [
      { key: 'growth-ai', label: 'Growth AI', path: '/admin/growth-ai' },
      { key: 'configuracion', label: 'Configuracion', path: '/admin/configuracion' },
      { key: 'parametros', label: 'Parametros', path: '/admin/parametros' },
      { key: 'roles-permisos', label: 'Roles y permisos', path: '/admin/roles-permisos' },
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
    subtitle: 'Catalogo publicable y operable',
    summary:
      'Centraliza catálogo, publicación, completitud y relación de cada maquinaria con la oferta.',
    responsibilities: [
      'Administrar el activo y su lifecycle',
      'Separar completitud, readiness y publicacion',
      'Expresar relaciones con proveedor y operadores habilitados',
    ],
    actions: [
      { label: 'Ver maquinarias actuales', to: '/admin/users?tab=machines', tone: 'primary' },
      { label: 'Ver reglas actuales', to: '/admin/pricing', tone: 'secondary' },
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
    title: 'Matching',
    subtitle: 'Asignacion separada de la ejecucion',
    summary:
      'Muestra la cola de asignación y los intentos de cobertura antes de la ejecución.',
    responsibilities: [
      'Gobernar la cola de asignacion',
      'Registrar intentos, fallos y reintentos',
      'Escalar senales estructurales de cobertura',
    ],
    actions: [
      { label: 'Abrir matching', to: '/admin/matching', tone: 'primary' },
    ],
  },
  pagos: {
    title: 'Pagos',
    subtitle: 'Dominio monetario del marketplace',
    summary:
      'Concentra cobros, pagos, comisiones y alertas financieras del marketplace.',
    responsibilities: [
      'Gobernar cobros, pagos y comisiones',
      'Mostrar discrepancias y conciliacion operativa',
      'Separar dinero de documentos fiscales',
    ],
    actions: [
      { label: 'Abrir pagos', to: '/admin/pagos', tone: 'primary' },
    ],
  },
  facturacion: {
    title: 'Facturacion',
    subtitle: 'Gobierno documental y fiscal',
    summary:
      'Ordena documentos, validaciones y seguimiento fiscal de cada servicio.',
    responsibilities: [
      'Gestionar documentos esperados y recibidos',
      'Separar aprobacion documental del flujo monetario',
      'Hacer visible el estado fiscal por reserva y actor',
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
      'Escalar al dominio correcto sin absorber su verdad',
      'Mantener trazabilidad y SLA de incidencias',
    ],
    actions: [
      { label: 'Abrir soporte', to: '/admin/soporte', tone: 'primary' },
    ],
  },
  reportes: {
    title: 'Reportes',
    subtitle: 'Informes semanales, mensuales y distribucion',
    summary:
      'Consulta reportes semanales y mensuales, suscriptores y descargas desde una sola superficie.',
    responsibilities: [
      'Administrar semanal, mensual, suscriptores e historial',
      'Conservar una sola superficie de generacion y envio',
      'Permitir al Dashboard resumir sin absorber workflow',
    ],
    actions: [
      { label: 'Abrir reportes', to: '/admin/reportes', tone: 'primary' },
      { label: 'Ir a marketing', to: '/admin/marketing', tone: 'secondary' },
    ],
  },
  logs: {
    title: 'Logs',
    subtitle: 'Dominio transversal de trazabilidad',
    summary:
      'Reserva una vista clara para trazabilidad y auditoría del sistema.',
    responsibilities: [
      'Registrar eventos auditables de negocio',
      'Relacionar actor, entidad, accion y severidad',
      'Dar soporte a investigacion y gobierno',
    ],
    actions: [],
  },
  configuracion: {
    title: 'Configuracion',
    subtitle: 'Settings globales y sensibles del sistema',
    summary:
      'Centraliza integraciones y ajustes globales sensibles del sistema.',
    responsibilities: [
      'Gobernar integraciones y toggles estructurales',
      'Mantener minima la configuracion global',
      'Evitar absorber reglas variables del negocio',
    ],
    actions: [],
  },
  parametros: {
    title: 'Parametros',
    subtitle: 'Reglas variables del negocio',
    summary:
      'Concentra pricing y reglas variables del negocio en una sola vista.',
    responsibilities: [
      'Centralizar reglas ajustables del negocio',
      'Separar parametros operativos de configuracion tecnica',
      'Alimentar pricing, matching y criterios de elegibilidad',
    ],
    actions: [
      { label: 'Ver parámetros actuales', to: '/admin/pricing', tone: 'primary' },
    ],
  },
  'roles-permisos': {
    title: 'Roles y permisos',
    subtitle: 'Gobierno de acceso y segregacion de funciones',
    summary:
      'Prepara una administración de acceso por rol, dominio y responsabilidad.',
    responsibilities: [
      'Definir perfiles y grants por dominio',
      'Separar quien ve, decide y ejecuta',
      'Hacer crecer el equipo sin perder gobierno',
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
      'Relacionarse con reportes y parametros sin absorber catalogo base',
      'Converger a la misma gramatica del Admin oficial',
    ],
    actions: [
      { label: 'Abrir Growth AI', to: '/admin/growth-ai', tone: 'primary' },
    ],
  },
};
