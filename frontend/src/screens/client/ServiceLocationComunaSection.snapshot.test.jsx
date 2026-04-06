/**
 * Snapshots del bloque comuna: cualquier cambio de estructura/markup debe actualizar snapshot a propósito (revisión producto).
 */
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ServiceLocationComunaSection } from './ServiceLocationComunaSection.jsx';

describe('ServiceLocationComunaSection snapshots', () => {
  it('estado Places canónico (bloque comuna oculto)', () => {
    const html = renderToString(
      <ServiceLocationComunaSection
        hideComunaField
        comuna="Las Condes"
        onComunaChange={() => {}}
        comunaError=""
      />
    );
    expect(html).toMatchSnapshot();
  });

  it('estado manual (editable)', () => {
    const html = renderToString(
      <ServiceLocationComunaSection
        hideComunaField={false}
        comuna=""
        onComunaChange={() => {}}
        comunaError=""
      />
    );
    expect(html).toMatchSnapshot();
  });
});
