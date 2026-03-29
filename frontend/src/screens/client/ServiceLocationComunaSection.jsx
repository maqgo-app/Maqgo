import React from 'react';
import { ComunaAutocomplete } from '../../components/ComunaAutocomplete';

const COMUNA_INPUT_MIN_PX = 50;

const comunaEditableInputStyle = {
  minHeight: COMUNA_INPUT_MIN_PX,
  boxSizing: 'border-box',
  fontSize: 16
};

/**
 * Comuna inferida desde Places (canónica) + fuente places_canonical|google → no se muestra ni valida aparte.
 */
export function shouldHideServiceLocationComunaField(comunaSource, comuna) {
  const src = String(comunaSource || '');
  const fromPlaces = src === 'places_canonical' || src === 'google';
  return fromPlaces && !!String(comuna || '').trim();
}

/** @deprecated Usar shouldHideServiceLocationComunaField (antes: “readonly”) */
export function isServiceComunaReadonly(comunaSource, comuna) {
  return shouldHideServiceLocationComunaField(comunaSource, comuna);
}

/**
 * Bloque UI comuna: oculto si Places entregó comuna canónica; si no, lista obligatoria.
 */
export function ServiceLocationComunaSection({
  hideComunaField,
  comuna,
  onComunaChange,
  comunaError,
  hasApiKey,
  placesPhase,
  manualAddressNotFound
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

      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 8px', lineHeight: 1.4 }}>
        {hasApiKey && placesPhase === 'ready' && !manualAddressNotFound
          ? 'Si no elegiste una sugerencia de Google o falta comuna, elige la tuya en la lista (mín. 2 letras).'
          : 'Selecciona comuna de la lista (mín. 2 letras).'}
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
