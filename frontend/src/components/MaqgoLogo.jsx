import React from 'react';

/**
 * Logo MAQGO - SVG nativo
 * Transparencia perfecta, sin dependencia de imágenes. Escala en cualquier tamaño.
 *
 * Tamaños: large (180) | medium (160) | small (100) | mini (80)
 */
const SIZES = {
  large: 180,
  medium: 160,
  small: 100,
  mini: 80
};

function MaqgoLogo({ size = 'small', customSize = null, style = {}, transparent }) {
  const logoSize = customSize || SIZES[size] || SIZES.small;

  return (
    <div
      className="maqgo-logo-cropped"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...style
      }}
      aria-hidden="true"
    >
      <svg
        width={logoSize}
        height={logoSize * 0.4}
        viewBox="0 0 120 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <text
          x="0"
          y="36"
          fill="var(--maqgo-orange)"
          fontFamily="'Space Grotesk', 'Inter', sans-serif"
          fontSize="40"
          fontWeight="700"
          letterSpacing="-0.03em"
        >
          MAQGO
        </text>
      </svg>
    </div>
  );
}

export default MaqgoLogo;
