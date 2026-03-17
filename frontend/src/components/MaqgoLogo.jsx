import React, { useState } from 'react';
import logoImg from '../assets/maqgo-logo.png';

/** Logo transparente (public) - evita parche de fondo distinto al #18181C */
const LOGO_TRANSPARENT = '/maqgo-logo-transparent.png';

/**
 * Logo MAQGO estandarizado
 * 
 * Tamaños predefinidos para consistencia visual:
 * - large: Solo para WelcomeScreen (onboarding inicial) - 260px
 * - medium: Para pantallas principales (Home) - 160px
 * - small: Para headers de pantallas internas - 100px
 * - mini: Para espacios muy reducidos - 80px
 */

const SIZES = {
  large: 260,   // Welcome screen única
  medium: 160,  // Home screens
  small: 100,   // Headers internos (default)
  mini: 80      // Espacios reducidos
};

const MaqgoLogo = ({ size = 'small', customSize = null, style = {}, transparent = false }) => {
  const [imgError, setImgError] = useState(false);
  const logoSize = customSize || SIZES[size] || SIZES.small;
  const logoSrc = transparent ? LOGO_TRANSPARENT : logoImg;
  
  return (
    <div 
      className="maqgo-logo-cropped" 
      style={{ 
        display: 'flex', 
        justifyContent: 'center',
        alignItems: 'center',
        background: 'transparent',
        ...style 
      }}
    >
      {imgError ? (
        <span style={{ 
          fontSize: logoSize * 0.4, 
          fontWeight: 700, 
          color: '#EC6819', 
          fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: '-0.03em'
        }}>
          MAQGO
        </span>
      ) : (
        <img 
          src={logoSrc} 
          alt="MAQGO" 
          onError={() => setImgError(true)}
          style={{ 
            width: logoSize, 
            maxWidth: logoSize,
            height: 'auto', 
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block'
          }} 
        />
      )}
    </div>
  );
};

export default MaqgoLogo;
