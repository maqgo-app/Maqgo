import React from 'react';

/**
 * Flecha única MAQGO para “volver” / navegación hacia atrás.
 * El trazo usa `currentColor`; el contenedor (botón) define el color vía style o className.
 */
export function BackArrowIcon({ size = 24, className, style, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      style={style}
      {...rest}
    >
      <path
        d="M15 18L9 12L15 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
