import React from 'react';
import { useNavigate } from 'react-router-dom';

export function buildChatPath(serviceId, otherName) {
  if (!serviceId) return null;
  const other = encodeURIComponent(otherName || 'Contacto');
  return `/chat/${encodeURIComponent(serviceId)}?other=${other}`;
}

/**
 * Botón para abrir el chat del servicio.
 * Usar ruta (no modal) como canal obligatorio cliente ↔ proveedor.
 */
function OpenServiceChatButton({
  serviceId,
  otherName,
  label = 'Abrir chat',
  className,
  style,
  disabled,
}) {
  const navigate = useNavigate();

  const path = buildChatPath(serviceId, otherName);
  if (!path) return null;

  return (
    <button
      type="button"
      className={className || 'maqgo-btn-secondary'}
      style={{ width: '100%', marginTop: 12, ...(style || {}) }}
      disabled={disabled}
      onClick={() => navigate(path)}
      data-testid="open-service-chat-btn"
    >
      {label}
    </button>
  );
}

export default OpenServiceChatButton;

