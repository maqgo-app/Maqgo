import React from 'react';
import { ComunaAutocomplete } from '../../components/ComunaAutocomplete';

const COMUNA_INPUT_MIN_PX = 50;

const comunaEditableInputStyle = {
  minHeight: COMUNA_INPUT_MIN_PX,
  boxSizing: 'border-box',
  fontSize: 16
};

/**
 * Bloque UI comuna: oculto si Places entregó comuna canónica; si no, lista obligatoria.
 */
export function ServiceLocationComunaSection({
  hideComunaField,
  comuna,
  onComunaChange,
  comunaError
}) {
  if (hideComunaField) {
    return null;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        htmlFor="service-comuna"
        style={{
          color: 'rgba(255,255,255,0.8)',
          fontSize: 14,
          display: 'block',
          marginBottom: 8,
          fontWeight: 500
        }}
      >
        Comuna <span style={{ color: '#EC6819' }}>*</span>
      </label>

      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 6px', lineHeight: 1.35 }}>
        Busca en la lista (2+ letras).
      </p>
      <ComunaAutocomplete
        id="service-comuna"
        value={comuna}
        onChange={onComunaChange}
        placeholder="Escribe para buscar..."
        style={comunaEditableInputStyle}
      />
      {comunaError && (
        <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 6 }}>{comunaError}</p>
      )}
    </div>
  );
}
