/**
 * Tema MAQGO - Premium Industrial 2025
 * 
 * REGLAS DE COLOR (NO NEGOCIABLES):
 * 1. Naranja = ÚNICO color de acción (botones, CTAs, selección)
 * 2. Azul = SOLO info pasiva (iconos info, links secundarios, ayuda)
 * 3. Máximo 1 protagonista por pantalla (naranja)
 */

export const MAQGO = {
  colors: {
    // Fondos - Premium Dark
    bgDark: '#18181C',        // Fondo principal
    bgCard: '#1A1A1F',        // Cards
    bgCardHover: '#242429',   // Hover
    
    // Texto - CONTRASTE MEJORADO
    textPrimary: '#FAFAFA',
    textSecondary: '#E0E0E0',  // Gris claro (mejor contraste)
    textMuted: 'rgba(250,250,250,0.9)',  // Más visible
    
    // Bordes
    border: '#2A2A2A',
    
    // ACCIÓN (ÚNICO) - Todo lo que avanza el flujo
    orange: '#EC6819',
    orangeHover: '#D85A10',
    
    // INFO PASIVA (solo para info, ayuda, estados pasivos)
    // ❌ NUNCA para botones, badges de urgencia, selección
    infoAccent: '#90BDD3',
    
    // Estados
    error: '#E53935',
    warning: '#F5A623',
  },
  
  radius: {
    sm: 8,
    md: 14,
    lg: 16,
    xl: 20,
  },
  
  font: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};

export default MAQGO;
