import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import BACKEND_URL from '../utils/api';

// Fallback: respuestas cuando el backend no está disponible
const FALLBACK_RESPONSES = {
  solicito: 'Para solicitar una maquinaria:\n\n• Ve a Inicio → Empezar ahora\n• Selecciona tipo (retro, excavadora, etc.)\n• Elige día y horas\n• Marca la ubicación de tu obra\n• Elige entre los proveedores disponibles\n\nTu tarjeta solo se cobra cuando alguien acepta.',
  registroCliente: 'Para registrarte como cliente:\n\n• Toca "Empezar ahora" en la pantalla de inicio\n• Completa tus datos (nombre, email, teléfono)\n• Verifica tu número por SMS\n• Listo: ya puedes solicitar maquinaria',
  registroProveedor: 'Para registrarte como proveedor:\n\n• Toca "Empezar ahora" en la pantalla de inicio\n• Completa tus datos y verifica tu número por SMS\n• Cuando te pregunten "¿Cómo usarás la app?", elige "Soy Proveedor"\n• Luego completa datos de empresa, maquinarias y operadores\n• Una vez listo, empezarás a recibir solicitudes',
  registroOperador: 'Si eres operador:\n\n1. Toca "Soy operador (tengo código)" en la pantalla de inicio\n2. Ingresa el código de 6 dígitos que recibiste por SMS\n3. Quedarás activo y asociado a la maquinaria\n\nTu empresa y tú recibirán confirmación.',
  registro: 'Para registrarte:\n\n• Cliente: Empezar ahora → completa datos → verifica SMS → elige "Soy Cliente"\n• Proveedor: Empezar ahora → completa datos → verifica SMS → elige "Soy Proveedor"\n• Operador: "Soy operador (tengo código)" en la pantalla de inicio → ingresa el código de 6 dígitos',
  operador: 'Si eres operador:\n\n1. Toca "Soy operador (tengo código)" en la pantalla de inicio\n2. Ingresa el código de 6 dígitos que recibiste por SMS\n3. Quedarás activo y asociado a la maquinaria\n\nTu empresa y tú recibirán confirmación.',
  proveedor: 'Para registrarte como proveedor:\n\n• Toca "Empezar ahora" en la pantalla de inicio\n• Completa tus datos y verifica tu número por SMS\n• Cuando te pregunten "¿Cómo usarás la app?", elige "Soy Proveedor"\n• Luego completa datos de empresa, maquinarias y operadores\n• Una vez listo, empezarás a recibir solicitudes',
  funciona: 'Para usar MAQGO:\n\n1. Elige el tipo de maquinaria que necesitas\n2. Indica cuándo (hoy, mañana o fecha)\n3. Marca la ubicación en el mapa\n4. Revisa proveedores disponibles\n5. Confirma y listo — el operador se contactará',
  pago: 'Para pagos, comisiones y facturación hay respuestas detalladas en el FAQ. ¿Te llevo?',
};
const PAYMENT_WORDS = ['comision', 'comisiones', 'pago', 'pagos', 'factura', 'tarifa', 'cobro', 'iva', 'precio'];

function getFallbackResponse(text) {
  const t = text.toLowerCase();
  if (PAYMENT_WORDS.some(w => t.includes(w))) return FALLBACK_RESPONSES.pago;
  if (t.includes('solicito') || t.includes('solicitar') || t.includes('reserv')) return FALLBACK_RESPONSES.solicito;
  // Específico por rol: proveedor antes que registro genérico
  if ((t.includes('registro') || t.includes('registrar')) && t.includes('proveedor')) return FALLBACK_RESPONSES.registroProveedor;
  if ((t.includes('registro') || t.includes('registrar')) && t.includes('cliente')) return FALLBACK_RESPONSES.registroCliente;
  if (t.includes('operador') || (t.includes('uno') && t.includes('operador'))) return FALLBACK_RESPONSES.registroOperador;
  if (t.includes('proveedor')) return FALLBACK_RESPONSES.proveedor;
  if (t.includes('registro') || t.includes('registrar')) return FALLBACK_RESPONSES.registro;
  if (t.includes('funciona') || t.includes('cómo') || t.includes('como')) return FALLBACK_RESPONSES.funciona;
  return '¿En qué te puedo ayudar? Puedo orientarte sobre cómo solicitar maquinaria, registrarte como cliente o proveedor, o usar el código de operador. También puedes revisar FAQ para más detalles.';
}

/**
 * Chatbot MAQGO - Asistente operativo
 * Usa backend si está disponible; si no, responde localmente.
 */
function ChatBot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '¡Hola! 👋 Soy el asistente MAQGO.\n\n¿En qué te ayudo?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll al final cuando hay nuevos mensajes o termina de cargar
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const scrollToBottom = () => { el.scrollTop = el.scrollHeight; };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
    const t = setTimeout(scrollToBottom, 200);
    return () => clearTimeout(t);
  }, [messages, loading]);

  // Recuperar sessionId de localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chatbot_session');
    if (saved) setSessionId(saved);
  }, []);

  // Escuchar evento para abrir desde Welcome/otros
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-maqgo-assistant', handler);
    return () => window.removeEventListener('open-maqgo-assistant', handler);
  }, []);

  const sendMessage = async (textOverride) => {
    const msg = (textOverride ?? input).trim();
    if (!msg || loading) return;

    setInput('');
    
    // Agregar mensaje del usuario
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${BACKEND_URL}/api/chatbot/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          session_id: sessionId
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        localStorage.setItem('chatbot_session', data.session_id);
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        actions: data.actions || null
      }]);
    } catch {
      // Backend no disponible: usar fallback local
      const fallback = getFallbackResponse(msg);
      const isPago = PAYMENT_WORDS.some(w => msg.toLowerCase().includes(w));
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: fallback,
        actions: isPago ? [{ label: 'Ver FAQ', path: '/faq' }, { label: 'Ver Términos', path: '/terms' }] : null
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Sugerencias rápidas - Cliente, Proveedor, Operador
  const quickSuggestions = [
    '¿Cómo solicito maquinaria como cliente?',
    '¿Cómo me registro como cliente?',
    '¿Cómo me registro como proveedor?',
    '¿Cómo me uno como operador?'
  ];

  return (
    <>
      {/* Botón flotante - más visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        data-testid="chatbot-toggle"
        title="Asistente MAQGO - ¿Tenés dudas?"
        aria-label="Abrir asistente MAQGO"
        style={{
          position: 'fixed',
          bottom: 90,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #EC6819 0%, #d55a14 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(236, 104, 25, 0.4)',
          zIndex: 998,
          transition: 'transform 0.2s'
        }}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 14.52 2.98 16.82 4.6 18.47L3 22L7.13 20.73C8.58 21.54 10.23 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" fill="#fff"/>
            <circle cx="8" cy="12" r="1.5" fill="#EC6819"/>
            <circle cx="12" cy="12" r="1.5" fill="#EC6819"/>
            <circle cx="16" cy="12" r="1.5" fill="#EC6819"/>
          </svg>
        )}
      </button>

      {/* Ventana del chat */}
      {isOpen && (
        <div
          data-testid="chatbot-window"
          style={{
            position: 'fixed',
            bottom: 160,
            right: 20,
            width: 340,
            maxWidth: 'calc(100vw - 40px)',
            height: 520,
            maxHeight: 'calc(100vh - 180px)',
            background: '#1A1A1A',
            borderRadius: 16,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 999,
            border: '1px solid #333'
          }}
        >
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #EC6819 0%, #d55a14 100%)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z" fill="#fff"/>
                <circle cx="8" cy="11" r="1.5" fill="#EC6819"/>
                <circle cx="16" cy="11" r="1.5" fill="#EC6819"/>
                <path d="M8 15C8 15 9.5 17 12 17C14.5 17 16 15 16 15" stroke="#EC6819" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
                Asistente MAQGO
              </p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0 }}>
                Ayuda con el uso diario
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Mensajes */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: 16,
              paddingBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            {messages.map((msg, index) => (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user' ? '#EC6819' : '#2A2A2A',
                    color: '#fff',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {msg.content}
                  </div>
                </div>
                {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
                    {msg.actions.map((action, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          navigate(action.path);
                          setIsOpen(false);
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 10,
                          background: 'rgba(236, 104, 25, 0.2)',
                          border: '1px solid rgba(236, 104, 25, 0.5)',
                          color: '#EC6819',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {/* Indicador de escritura */}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '14px 14px 14px 4px',
                  background: '#2A2A2A',
                  display: 'flex',
                  gap: 4
                }}>
                  <span style={{ 
                    width: 8, height: 8, borderRadius: '50%', background: '#666',
                    animation: 'bounce 1s infinite'
                  }}/>
                  <span style={{ 
                    width: 8, height: 8, borderRadius: '50%', background: '#666',
                    animation: 'bounce 1s infinite 0.2s'
                  }}/>
                  <span style={{ 
                    width: 8, height: 8, borderRadius: '50%', background: '#666',
                    animation: 'bounce 1s infinite 0.4s'
                  }}/>
                </div>
              </div>
            )}
          </div>

          {/* Sugerencias + WhatsApp - siempre visibles */}
          <div style={{
            padding: '0 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 4px 0', fontWeight: 500 }}>
              Toca para preguntar:
            </p>
            {quickSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => sendMessage(suggestion)}
                style={{
                  background: 'rgba(236, 104, 25, 0.15)',
                  border: '1px solid rgba(236, 104, 25, 0.4)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  color: '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div style={{
            padding: '12px 16px',
            margin: '0 12px 12px',
            background: 'rgba(37, 211, 102, 0.1)',
            borderRadius: 12,
            border: '1px solid rgba(37, 211, 102, 0.3)'
          }}>
            <a
              href={`https://wa.me/${(import.meta.env.VITE_WHATSAPP_SUPPORT || '+56994336579').replace('+', '')}?text=${encodeURIComponent('Hola MAQGO, necesito ayuda con...')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textDecoration: 'none',
                color: '#25D366',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              ¿No resolvió tu duda? Escríbenos por WhatsApp
            </a>
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #333', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="O escribe aquí si prefieres"
              data-testid="chatbot-input"
              style={{
                flex: 1,
                background: '#2A2A2A',
                border: '1px solid #444',
                borderRadius: 20,
                padding: '10px 16px',
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              data-testid="chatbot-send"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: input.trim() ? '#EC6819' : '#444',
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Estilos de animación */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}

export default ChatBot;
