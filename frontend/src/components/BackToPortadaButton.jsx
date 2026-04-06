import React from 'react';
import { BackArrowIcon } from './BackArrowIcon';

/**
 * Vuelve a /welcome — mismo lenguaje visual que el “atrás” del embudo (chevron + superficie suave).
 */
function BackToPortadaButton({ onClick, label = 'Volver al inicio' }) {
  return (
    <button type="button" className="maqgo-back-portada" onClick={onClick}>
      <BackArrowIcon size={22} />
      <span>{label}</span>
    </button>
  );
}

export default BackToPortadaButton;
