/**
 * Chilean Validation Utilities
 * RUT, email, celular validation and Chilean municipalities data
 */

// =======================================
// EMAIL VALIDATION
// =======================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida formato de email
 * @param {string} email
 * @returns {string} Mensaje de error vacío si es válido
 */
export function validateEmail(email) {
  if (!email || !email.trim()) return 'El correo es requerido';
  if (!EMAIL_REGEX.test(email.trim())) return 'Por favor ingresa un correo válido';
  return '';
}

// =======================================
// CELULAR CHILE VALIDATION
// =======================================

/**
 * Valida celular chileno (9 dígitos, empieza con 9)
 * Acepta: 912345678, +56912345678, 9 1234 5678
 * @param {string} celular
 * @returns {string} Mensaje de error vacío si es válido
 */
export function validateCelularChile(celular) {
  if (!celular || !String(celular).trim()) return 'El celular es requerido';
  const digits = String(celular).replace(/\D/g, '');
  if (digits.length !== 9) return 'El celular debe tener 9 dígitos';
  if (digits[0] !== '9') return 'El celular debe empezar con 9';
  return '';
}

// =======================================
// RUT VALIDATION
// =======================================

/** Longitud máxima del RUT en Chile: 8 dígitos (cuerpo) + 1 dígito verificador (0-9 o K) = 9 caracteres */
export const RUT_MAX_LENGTH = 9;

/** Longitud mínima: 7 dígitos + 1 DV = 8 caracteres */
export const RUT_MIN_LENGTH = 8;

/**
 * Sanitiza y limita el input de RUT al estándar chileno (solo números y K, máx. 9 caracteres).
 * Para facturación electrónica el RUT debe ser exacto.
 * @param {string} value - Valor ingresado
 * @returns {string} - RUT limpio (solo 0-9 y K, máximo 9 caracteres)
 */
export function sanitizeRutInput(value) {
  if (!value || typeof value !== 'string') return '';
  const clean = value.replace(/[^\dK]/gi, '').toUpperCase();
  return clean.slice(0, RUT_MAX_LENGTH);
}

/**
 * Validates Chilean RUT format and checksum
 * Accepts formats: 12.345.678-9, 12345678-9, 123456789
 * @param {string} rut - The RUT to validate
 * @returns {boolean} - True if valid
 */
export function validateRut(rut) {
  if (!rut || typeof rut !== 'string') return false;
  
  // Clean RUT: remove dots, dashes, spaces
  const cleanRut = rut.replace(/[.\-\s]/g, '').toUpperCase();
  
  // Check minimum length
  if (cleanRut.length < 8 || cleanRut.length > 9) return false;
  
  // Separate body and verifier
  const body = cleanRut.slice(0, -1);
  const verifier = cleanRut.slice(-1);
  
  // Validate body is numeric
  if (!/^\d+$/.test(body)) return false;
  
  // Validate verifier is digit or K
  if (!/^[\dK]$/.test(verifier)) return false;
  
  // Calculate expected verifier
  const expectedVerifier = calculateRutVerifier(body);
  
  return verifier === expectedVerifier;
}

/**
 * Calculate RUT verifier digit using module 11 algorithm
 * @param {string} body - RUT body (numbers only)
 * @returns {string} - Verifier digit (0-9 or K)
 */
function calculateRutVerifier(body) {
  let sum = 0;
  let multiplier = 2;
  
  // Process from right to left
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const remainder = 11 - (sum % 11);
  
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return remainder.toString();
}

/**
 * Format RUT with dots and dash
 * @param {string} rut - Raw RUT input
 * @returns {string} - Formatted RUT (XX.XXX.XXX-X)
 */
export function formatRut(rut) {
  if (!rut) return '';
  
  // Clean input
  let clean = rut.replace(/[^\dkK]/g, '').toUpperCase();
  
  if (clean.length === 0) return '';
  
  // Separate body and verifier
  const verifier = clean.slice(-1);
  let body = clean.slice(0, -1);
  
  // Add dots every 3 digits from right
  let formatted = '';
  while (body.length > 3) {
    formatted = '.' + body.slice(-3) + formatted;
    body = body.slice(0, -3);
  }
  
  if (body.length > 0) {
    formatted = body + formatted;
  }
  
  // Add verifier if present
  if (clean.length > 1) {
    formatted += '-' + verifier;
  } else {
    // Si solo hay un dígito, es el cuerpo inicial
    formatted = clean;
  }
  
  return formatted;
}

// =======================================
// CHILEAN MUNICIPALITIES (COMUNAS)
// =======================================

/**
 * List of Chilean municipalities grouped by region
 * Focused on Región Metropolitana + major cities
 */
export const COMUNAS_CHILE = {
  'Región Metropolitana': [
    'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central',
    'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja',
    'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo',
    'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda',
    'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal',
    'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón',
    'Santiago', 'Vitacura', 'Puente Alto', 'San Bernardo', 'Colina',
    'Lampa', 'Buin', 'Calera de Tango', 'Paine', 'Peñaflor',
    'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Pirque',
    'San José de Maipo', 'Melipilla', 'Curacaví', 'María Pinto', 'Alhué',
    'San Pedro', 'Tiltil'
  ],
  'Valparaíso': [
    'Valparaíso', 'Viña del Mar', 'Quilpué', 'Villa Alemana', 'Concón',
    'Quintero', 'Puchuncaví', 'San Antonio', 'Cartagena', 'El Quisco',
    'El Tabo', 'Algarrobo', 'Santo Domingo', 'Los Andes', 'San Felipe',
    'Quillota', 'La Calera', 'Limache', 'Olmué', 'San Esteban'
  ],
  "O'Higgins": [
    'Rancagua', 'Machalí', 'Graneros', 'Codegua', 'San Fernando',
    'Chimbarongo', 'Santa Cruz', 'Pichilemu', 'Rengo', 'Requínoa'
  ],
  'Biobío': [
    'Concepción', 'Talcahuano', 'Hualpén', 'San Pedro de la Paz', 'Chiguayante',
    'Coronel', 'Lota', 'Penco', 'Tomé', 'Los Ángeles', 'Chillán', 'Chillán Viejo'
  ],
  'La Araucanía': [
    'Temuco', 'Padre Las Casas', 'Villarrica', 'Pucón', 'Angol',
    'Victoria', 'Lautaro', 'Nueva Imperial', 'Freire', 'Carahue'
  ],
  'Los Lagos': [
    'Puerto Montt', 'Puerto Varas', 'Osorno', 'Castro', 'Ancud',
    'Calbuco', 'Frutillar', 'Llanquihue', 'Quellón', 'Dalcahue'
  ],
  'Coquimbo': [
    'La Serena', 'Coquimbo', 'Ovalle', 'Illapel', 'Vicuña',
    'Andacollo', 'Monte Patria', 'Combarbalá', 'Los Vilos', 'Salamanca'
  ],
  'Antofagasta': [
    'Antofagasta', 'Calama', 'Tocopilla', 'Mejillones', 'San Pedro de Atacama',
    'María Elena', 'Sierra Gorda', 'Taltal'
  ],
  'Atacama': [
    'Copiapó', 'Vallenar', 'Caldera', 'Chañaral', 'Diego de Almagro',
    'Tierra Amarilla', 'Huasco', 'Freirina'
  ],
  'Maule': [
    'Talca', 'Curicó', 'Linares', 'Constitución', 'Cauquenes',
    'Molina', 'San Clemente', 'Maule', 'Pelarco', 'Longaví'
  ]
};

/**
 * Flat list of all comunas for autocomplete
 */
export const ALL_COMUNAS = Object.values(COMUNAS_CHILE).flat().sort();

/**
 * Search comunas by partial name
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @returns {string[]} - Matching comunas
 */
export function searchComunas(query, limit = 10) {
  if (!query || query.length < 2) return [];
  
  const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  return ALL_COMUNAS
    .filter(comuna => {
      const normalizedComuna = comuna.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalizedComuna.includes(normalizedQuery);
    })
    .slice(0, limit);
}

/**
 * Get region for a given comuna
 * @param {string} comuna - Comuna name
 * @returns {string|null} - Region name or null
 */
export function getRegionForComuna(comuna) {
  for (const [region, comunas] of Object.entries(COMUNAS_CHILE)) {
    if (comunas.includes(comuna)) {
      return region;
    }
  }
  return null;
}
