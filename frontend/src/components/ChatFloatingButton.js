import React, { useState, useEffect } from 'react';
import ServiceChat from './ServiceChat';

/**
 * Botón flotante de chat - Aparece solo cuando el servicio está confirmado
 * Discreto, no invade el diseño principal
 */
function ChatFloatingButton({ 
  serviceId, 
  userType, 
  userName, 
  otherName,
  unreadCount = 0 
}) {
  const [showChat, setShowChat] = useState(false);
  const [openedSinceUnread, setOpenedSinceUnread] = useState(false);
  const hasNewMessage = unreadCount > 0 && !openedSinceUnread;

  useEffect(() => {
    if (unreadCount === 0) {
      setOpenedSinceUnread(false);
    }
  }, [unreadCount]);

  const handleOpenChat = () => {
    setShowChat(true);
    setOpenedSinceUnread(true);
  };

  return (
    <>
      {/* Botón flotante - Posición discreta */}
      <button
        onClick={handleOpenChat}
        style={{
          position: 'fixed',
          bottom: 140, // Entre nav y chatbot
          right: 16,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: hasNewMessage ? '#EC6819' : '#90BDD3',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 900,
          transition: 'all 0.2s'
        }}
        data-testid="chat-fab"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path 
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" 
            stroke="#fff" 
            strokeWidth="2"
            fill="none"
          />
        </svg>
        
        {/* Badge de mensajes nuevos */}
        {hasNewMessage && (
          <div style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#E53935',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #1A1A1F'
          }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
              {unreadCount > 9 ? '9+' : unreadCount || '!'}
            </span>
          </div>
        )}
      </button>

      {/* Chat modal */}
      {showChat && (
        <ServiceChat
          serviceId={serviceId}
          userType={userType}
          userName={userName}
          otherName={otherName}
          onClose={() => setShowChat(false)}
        />
      )}
    </>
  );
}

export default ChatFloatingButton;
