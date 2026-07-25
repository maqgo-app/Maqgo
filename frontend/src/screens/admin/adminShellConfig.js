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
    subtitle: 'Fuente de verdad funcional de la demanda',
    summary:
      'Este dominio gobernara identidad, historial e incidencias del cliente. En esta fase, la operacion actual vive en la herramienta legado de usuarios.',
    actions: [
      { label: 'Abrir herramienta actual', to: '/admin/users?tab=clients', tone: 'primary' },
    ],
  },
  proveedores: {
    title: 'Proveedores',
    subtitle: 'Cuenta empresarial oficial de la oferta',
    summary:
      'Este dominio centraliza la cuenta proveedora y sus relaciones. Mientras se materializa la ficha canonica, se conecta con la superficie legado de usuarios.',
    responsibilities: [
      'Gobernar la cuenta empresarial de oferta',
      'Relacionar equipo, catalogo y salud de cuenta',
      'Separar identidad del proveedor de operadores y maquinarias',
    ],
    actions: [
      { label: 'Abrir herramienta actual', to: '/admin/users?tab=providers', tone: 'primary' },
    ],
  },
  operadores: {
    title: 'Operadores',
    subtitle: 'Entidad de primera clase del marketplace',
    summary:
      'La arquitectura ya fija Operadores como dominio oficial. El modulo queda preparado en el shell y se materializa en el siguiente lote sin volver a esconderse dentro de Proveedores.',
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
      'El shell ya reconoce Maquinarias como dominio oficial. La gestion actual vive en la herramienta legado mientras se implementa la ficha canonica y el lifecycle oficial.',
    responsibilities: [
      'Administrar el activo y su lifecycle',
      'Separar completitud, readiness y publicacion',
      'Expresar relaciones con proveedor y operadores habilitados',
    ],
    actions: [
      { label: 'Abrir herramienta actual', to: '/admin/users?tab=machines', tone: 'primary' },
      { label: 'Abrir parametros actuales', to: '/admin/pricing', tone: 'secondary' },
    ],
  },
  reservas: {
    title: 'Reservas',
    subtitle: 'Centro transaccional del servicio',
    summary:
      'Reservas queda definido como dominio independiente. Mientras se construye su ficha canonica, la vista operativa actual permanece disponible desde el panel legado.',
    responsibilities: [
      'Contar el estado y timeline del servicio',
      'Unificar contexto de cliente, proveedor, operador y maquinaria',
      'Referenciar pagos, facturacion y soporte sin absorberlos',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/area/today', tone: 'primary' },
    ],
  },
  matching: {
    title: 'Matching',
    subtitle: 'Asignacion separada de la ejecucion',
    summary:
      'Matching ya tiene casa propia en la arquitectura. En esta fase, la visibilidad operativa actual se mantiene en el panel legado mientras se materializa la cola oficial.',
    responsibilities: [
      'Gobernar la cola de asignacion',
      'Registrar intentos, fallos y reintentos',
      'Escalar senales estructurales de cobertura',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/area/system', tone: 'primary' },
    ],
  },
  pagos: {
    title: 'Pagos',
    subtitle: 'Dominio monetario del marketplace',
    summary:
      'Pagos queda separado de Facturacion desde el shell. La operacion financiera actual sigue disponible en el panel legado hasta que exista el modulo dedicado.',
    responsibilities: [
      'Gobernar cobros, pagos y comisiones',
      'Mostrar discrepancias y conciliacion operativa',
      'Separar dinero de documentos fiscales',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/area/money', tone: 'primary' },
    ],
  },
  facturacion: {
    title: 'Facturacion',
    subtitle: 'Gobierno documental y fiscal',
    summary:
      'Facturacion ya tiene frontera funcional propia. Durante la transicion, la operacion heredada se consulta desde el panel legado, sin mezclarla conceptualmente con Pagos.',
    responsibilities: [
      'Gestionar documentos esperados y recibidos',
      'Separar aprobacion documental del flujo monetario',
      'Hacer visible el estado fiscal por reserva y actor',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/area/money', tone: 'primary' },
    ],
  },
  soporte: {
    title: 'Soporte',
    subtitle: 'Incidencias, accesos y excepciones',
    summary:
      'Soporte deja de ser una subseccion escondida del panel. Hasta construir su inbox oficial, la operacion actual queda accesible desde el area legado de acceso.',
    responsibilities: [
      'Gobernar tickets, bloqueos y accesos',
      'Escalar al dominio correcto sin absorber su verdad',
      'Mantener trazabilidad y SLA de incidencias',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/area/access', tone: 'primary' },
    ],
  },
  reportes: {
    title: 'Reportes',
    subtitle: 'Informes semanales, mensuales y distribucion',
    summary:
      'El dominio Reportes preserva semanal, mensual, suscriptores e historial. En la fase actual, los gatillos existentes se mantienen disponibles desde el panel legado.',
    responsibilities: [
      'Administrar semanal, mensual, suscriptores e historial',
      'Conservar una sola superficie de generacion y envio',
      'Permitir al Dashboard resumir sin absorber workflow',
    ],
    actions: [
      { label: 'Abrir panel legado', to: '/admin/legacy/dashboard', tone: 'primary' },
      { label: 'Abrir marketing actual', to: '/admin/marketing', tone: 'secondary' },
    ],
  },
  logs: {
    title: 'Logs',
    subtitle: 'Dominio transversal de trazabilidad',
    summary:
      'Logs queda definido como dominio oficial de trazabilidad. El shell ya reserva su espacio para la entidad Evento de Auditoria y el trabajo de investigacion posterior.',
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
      'Configuracion queda separada de Parametros. El shell fija su casa oficial antes de la implementacion profunda para evitar que vuelva a absorber reglas del negocio.',
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
      'Parametros se materializa como dominio oficial separado de Configuracion. Por ahora reutiliza la superficie actual de precios de referencia mientras se expande a mas reglas.',
    responsibilities: [
      'Centralizar reglas ajustables del negocio',
      'Separar parametros operativos de configuracion tecnica',
      'Alimentar pricing, matching y criterios de elegibilidad',
    ],
    actions: [
      { label: 'Abrir herramienta actual', to: '/admin/pricing', tone: 'primary' },
    ],
  },
  'roles-permisos': {
    title: 'Roles y permisos',
    subtitle: 'Gobierno de acceso y segregacion de funciones',
    summary:
      'Este dominio se reserva desde el shell para que la autorizacion futura se implemente sobre modulos oficiales y no sobre rutas heredadas.',
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
      'Growth AI ya existe y se integra al mapa oficial del Admin. En lotes posteriores convergera completamente a la misma gramatica de shell y fichas.',
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
