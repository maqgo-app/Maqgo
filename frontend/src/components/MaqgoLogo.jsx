import React from 'react';

/**
 * Logo MAQGO (SVG limpio en /public)
 *
 * @param {string} size - 'large' | 'medium' | 'small' | 'mini'
 * @param {number} customSize - Tamaño en px (altura, opcional)
 * @param {object} style - Estilos adicionales para el contenedor
 */
const SIZES = {
  large: 180,
  medium: 160,
  small: 100,
  mini: 80
};

function MaqgoLogo({ size = 'small', customSize = null, style = {} }) {
  const logoSize = customSize ?? SIZES[size] ?? SIZES.small;

  return (
    <div
      className="maqgo-logo"
      style={{ minWidth: 1, minHeight: logoSize, height: logoSize, ...style }}
    >
      <img
        src="/maqgo_logo_clean.svg"
        alt="MAQGO"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        width={logoSize}
        height={logoSize}
        style={{
          height: logoSize,
          width: 'auto',
          display: 'block',
          objectFit: 'contain'
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export default MaqgoLogo;
