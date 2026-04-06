import React, { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import ServiceChat from '../components/ServiceChat';
import { normalizeChatSenderType } from '../utils/chatSecurity';

/**
 * Chat por servicio: ruta obligatoria canal cliente ↔ proveedor.
 * Ruta: /chat/:serviceId
 */
function ServiceChatScreen() {
  const { serviceId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const role = localStorage.getItem('userRole') || 'client';
  const userType = useMemo(() => normalizeChatSenderType(role), [role]);

  const otherRaw = searchParams.get('other') || 'Contacto MAQGO';
  let otherName = 'Contacto MAQGO';
  try {
    otherName = decodeURIComponent(otherRaw);
  } catch {
    otherName = otherRaw;
  }

  if (!serviceId) {
    navigate(-1);
    return null;
  }

  return (
    <div className="maqgo-app maqgo-client-funnel">
      <ServiceChat
        serviceId={serviceId}
        userType={userType}
        otherName={otherName}
        onClose={() => navigate(-1)}
      />
    </div>
  );
}

export default ServiceChatScreen;

