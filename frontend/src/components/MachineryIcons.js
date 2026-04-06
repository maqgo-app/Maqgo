import React from 'react';

/**
 * Lista oficial de maquinaria MAQGO
 * Basado en diseño 7.1.png - Ordenado por frecuencia de arriendo
 */

// Retroexcavadora (22%)
export const RetroexcavadoraIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="38" r="6" fill={color}/>
    <circle cx="10" cy="38" r="3" fill="#1a1a1a"/>
    <circle cx="38" cy="38" r="6" fill={color}/>
    <circle cx="38" cy="38" r="3" fill="#1a1a1a"/>
    <rect x="6" y="26" width="36" height="10" rx="2" fill={color}/>
    <rect x="16" y="16" width="12" height="12" rx="2" fill={color}/>
    <rect x="18" y="18" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M4 28L2 22L10 20L12 26" fill={color}/>
    <path d="M36 24L42 14L46 16L40 26" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// Camión Tolva
export const CamionTolvaIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="38" r="5" fill={color}/>
    <circle cx="10" cy="38" r="2" fill="#1a1a1a"/>
    <circle cx="32" cy="38" r="5" fill={color}/>
    <circle cx="32" cy="38" r="2" fill="#1a1a1a"/>
    <circle cx="40" cy="38" r="5" fill={color}/>
    <circle cx="40" cy="38" r="2" fill="#1a1a1a"/>
    <path d="M16 34L20 16H44L46 34Z" fill={color}/>
    <rect x="4" y="22" width="14" height="14" rx="2" fill={color}/>
    <rect x="6" y="24" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
  </svg>
);

// Excavadora Hidráulica (16%)
export const ExcavadoraHidraulicaIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="36" width="12" height="6" rx="3" fill={color} opacity="0.8"/>
    <rect x="30" y="36" width="12" height="6" rx="3" fill={color} opacity="0.8"/>
    <rect x="8" y="28" width="32" height="10" rx="2" fill={color}/>
    <rect x="24" y="18" width="14" height="12" rx="2" fill={color}/>
    <rect x="26" y="20" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M8 26L4 18L12 14L16 22" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 20L6 14L14 12L10 20Z" fill={color}/>
  </svg>
);

// Bulldozer
export const BulldozerIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="32" width="16" height="10" rx="5" fill={color} opacity="0.8"/>
    <rect x="28" y="32" width="16" height="10" rx="5" fill={color} opacity="0.8"/>
    <rect x="8" y="22" width="32" height="12" rx="2" fill={color}/>
    <rect x="28" y="12" width="10" height="12" rx="2" fill={color}/>
    <rect x="30" y="14" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <rect x="2" y="18" width="4" height="18" rx="1" fill={color}/>
  </svg>
);

// Motoniveladora (8%)
export const MotoniveladoraIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="38" r="5" fill={color}/>
    <circle cx="8" cy="38" r="2" fill="#1a1a1a"/>
    <circle cx="40" cy="38" r="5" fill={color}/>
    <circle cx="40" cy="38" r="2" fill="#1a1a1a"/>
    <rect x="14" y="28" width="24" height="8" rx="2" fill={color}/>
    <rect x="28" y="16" width="10" height="14" rx="2" fill={color}/>
    <rect x="30" y="18" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M6 36L18 30" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <rect x="4" y="34" width="12" height="3" rx="1" fill={color} transform="rotate(-20 4 34)"/>
  </svg>
);

// Grúa Móvil
export const GruaMovilIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="40" r="5" fill={color}/>
    <circle cx="10" cy="40" r="2" fill="#1a1a1a"/>
    <circle cx="38" cy="40" r="5" fill={color}/>
    <circle cx="38" cy="40" r="2" fill="#1a1a1a"/>
    <rect x="6" y="30" width="36" height="8" rx="2" fill={color}/>
    <rect x="20" y="10" width="4" height="22" fill={color}/>
    <rect x="6" y="8" width="28" height="4" rx="1" fill={color}/>
    <line x1="10" y1="12" x2="10" y2="26" stroke={color} strokeWidth="2"/>
    <path d="M6 26L10 30L14 26" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Camión Pluma / Hiab (6%)
export const CamionPlumaIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="40" r="5" fill={color}/>
    <circle cx="10" cy="40" r="2" fill="#1a1a1a"/>
    <circle cx="36" cy="40" r="5" fill={color}/>
    <circle cx="36" cy="40" r="2" fill="#1a1a1a"/>
    <rect x="4" y="24" width="14" height="14" rx="2" fill={color}/>
    <rect x="6" y="26" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <rect x="18" y="30" width="26" height="8" rx="2" fill={color}/>
    <path d="M22 30L22 12L30 8" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="30" cy="8" r="3" fill={color}/>
  </svg>
);

// Compactadora / Rodillo
export const RodilloIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="36" rx="8" ry="8" fill={color}/>
    <ellipse cx="12" cy="36" rx="4" ry="4" fill="#1a1a1a"/>
    <circle cx="38" cy="38" r="6" fill={color}/>
    <circle cx="38" cy="38" r="3" fill="#1a1a1a"/>
    <rect x="14" y="26" width="22" height="8" rx="2" fill={color}/>
    <rect x="24" y="16" width="10" height="12" rx="2" fill={color}/>
    <rect x="26" y="18" width="6" height="5" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <rect x="8" y="28" width="8" height="4" fill={color}/>
  </svg>
);

// Camión Aljibe (4%)
export const CamionAljibeIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="40" r="5" fill={color}/>
    <circle cx="10" cy="40" r="2" fill="#1a1a1a"/>
    <circle cx="36" cy="40" r="5" fill={color}/>
    <circle cx="36" cy="40" r="2" fill="#1a1a1a"/>
    <rect x="4" y="26" width="14" height="12" rx="2" fill={color}/>
    <rect x="6" y="28" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <ellipse cx="32" cy="32" rx="12" ry="6" fill={color}/>
    <ellipse cx="32" cy="32" rx="8" ry="4" fill="#1a1a1a" opacity="0.2"/>
  </svg>
);

// Minicargador
export const MinicargadorIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="32" width="16" height="10" rx="5" fill={color} opacity="0.8"/>
    <rect x="28" y="32" width="16" height="10" rx="5" fill={color} opacity="0.8"/>
    <rect x="8" y="22" width="32" height="12" rx="2" fill={color}/>
    <rect x="26" y="14" width="12" height="10" rx="2" fill={color}/>
    <rect x="28" y="16" width="8" height="5" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M8 24L4 16L12 12" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 18L6 10H16L12 18Z" fill={color}/>
  </svg>
);

// Rodillo Compactador (nuevo)
export const RodilloCompactadorIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="36" rx="10" ry="10" fill={color}/>
    <ellipse cx="12" cy="36" rx="6" ry="6" fill="#1a1a1a"/>
    <ellipse cx="12" cy="36" rx="2" ry="2" fill={color}/>
    <circle cx="40" cy="36" r="6" fill={color}/>
    <circle cx="40" cy="36" r="3" fill="#1a1a1a"/>
    <rect x="18" y="24" width="18" height="10" rx="2" fill={color}/>
    <rect x="28" y="14" width="10" height="12" rx="2" fill={color}/>
    <rect x="30" y="16" width="6" height="5" rx="1" fill="#1a1a1a" opacity="0.5"/>
  </svg>
);

// Cargador Frontal (nuevo)
export const CargadorFrontalIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="38" r="7" fill={color}/>
    <circle cx="10" cy="38" r="4" fill="#1a1a1a"/>
    <circle cx="38" cy="38" r="7" fill={color}/>
    <circle cx="38" cy="38" r="4" fill="#1a1a1a"/>
    <rect x="12" y="24" width="28" height="12" rx="2" fill={color}/>
    <rect x="28" y="14" width="12" height="12" rx="2" fill={color}/>
    <rect x="30" y="16" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M12 28L4 22L2 26L6 34H12" fill={color}/>
    <path d="M2 24L8 18L14 20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// Plataforma Elevadora (nuevo)
export const PlataformaElevadoraIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="42" r="4" fill={color}/>
    <circle cx="10" cy="42" r="2" fill="#1a1a1a"/>
    <circle cx="38" cy="42" r="4" fill={color}/>
    <circle cx="38" cy="42" r="2" fill="#1a1a1a"/>
    <rect x="6" y="34" width="36" height="6" rx="2" fill={color}/>
    <rect x="20" y="8" width="8" height="28" fill={color}/>
    <rect x="14" y="4" width="20" height="8" rx="2" fill={color}/>
    <rect x="16" y="6" width="6" height="4" fill="#1a1a1a" opacity="0.3"/>
    <rect x="26" y="6" width="6" height="4" fill="#1a1a1a" opacity="0.3"/>
  </svg>
);

// Telehandler / Manipulador Telescópico (nuevo)
export const TelehandlerIcon = ({ size = 48, color = '#ff8c42' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="40" r="6" fill={color}/>
    <circle cx="10" cy="40" r="3" fill="#1a1a1a"/>
    <circle cx="38" cy="40" r="6" fill={color}/>
    <circle cx="38" cy="40" r="3" fill="#1a1a1a"/>
    <rect x="6" y="28" width="36" height="10" rx="2" fill={color}/>
    <rect x="28" y="18" width="12" height="12" rx="2" fill={color}/>
    <rect x="30" y="20" width="8" height="6" rx="1" fill="#1a1a1a" opacity="0.5"/>
    <path d="M14 30L6 14L12 12" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <rect x="2" y="10" width="8" height="6" rx="1" fill={color}/>
  </svg>
);

/**
 * Lista de maquinaria oficial MAQGO
 * Ordenada por frecuencia de arriendo (de más a menos)
 */
export const MACHINERY_LIST = [
  { id: 'retroexcavadora', name: 'Retroexcavadora', Icon: RetroexcavadoraIcon, popularity: 22 },
  { id: 'camion_tolva', name: 'Camión Tolva', Icon: CamionTolvaIcon, popularity: 18 },
  { id: 'excavadora_hidraulica', name: 'Excavadora Hidráulica', Icon: ExcavadoraHidraulicaIcon, popularity: 16 },
  { id: 'bulldozer', name: 'Bulldozer', Icon: BulldozerIcon, popularity: 12 },
  { id: 'motoniveladora', name: 'Motoniveladora', Icon: MotoniveladoraIcon, popularity: 8 },
  { id: 'grua_movil', name: 'Grúa Móvil', Icon: GruaMovilIcon, popularity: 7 },
  { id: 'camion_pluma', name: 'Camión Pluma (Hiab)', Icon: CamionPlumaIcon, popularity: 6 },
  { id: 'rodillo_compactador', name: 'Rodillo Compactador', Icon: RodilloCompactadorIcon, popularity: 5 },
  { id: 'cargador_frontal', name: 'Cargador Frontal', Icon: CargadorFrontalIcon, popularity: 5 },
  { id: 'compactadora', name: 'Compactadora', Icon: RodilloIcon, popularity: 4 },
  { id: 'camion_aljibe', name: 'Camión Aljibe', Icon: CamionAljibeIcon, popularity: 4 },
  { id: 'plataforma_elevadora', name: 'Plataforma Elevadora', Icon: PlataformaElevadoraIcon, popularity: 3 },
  { id: 'telehandler', name: 'Manipulador Telescópico', Icon: TelehandlerIcon, popularity: 3 },
  { id: 'minicargador', name: 'Minicargador', Icon: MinicargadorIcon, popularity: 2 },
];

const MachineryIcons = {
  retroexcavadora: RetroexcavadoraIcon,
  camion_tolva: CamionTolvaIcon,
  excavadora_hidraulica: ExcavadoraHidraulicaIcon,
  bulldozer: BulldozerIcon,
  motoniveladora: MotoniveladoraIcon,
  grua_movil: GruaMovilIcon,
  camion_pluma: CamionPlumaIcon,
  rodillo_compactador: RodilloCompactadorIcon,
  cargador_frontal: CargadorFrontalIcon,
  compactadora: RodilloIcon,
  camion_aljibe: CamionAljibeIcon,
  plataforma_elevadora: PlataformaElevadoraIcon,
  telehandler: TelehandlerIcon,
  minicargador: MinicargadorIcon,
};

export default MachineryIcons;
