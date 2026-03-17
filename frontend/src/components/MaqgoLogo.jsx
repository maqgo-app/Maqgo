import React from 'react';

/**
 * Logo MAQGO - Imagen PNG transparente (engranaje + pin + texto)
 * maqgo_logo_clean.png: fondo transparente, colores originales
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
      style={{ minWidth: 1, minHeight: 1, ...style }}
    >
      <img
        src="/maqgo_logo_clean.png"
        alt="MAQGO"
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
