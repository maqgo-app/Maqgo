import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

import BACKEND_URL from '../utils/api';
import { validateChatMessage } from '../utils/chatSecurity';
import { showSystemNotification } from '../utils/uberUX';
import { playChatIncomingSound, unlockAudio } from '../utils/notificationSounds';

// Mensajes rápidos por rol - Optimizados para uso mientras se maneja
const QUICK_MESSAGES = {
  client: [
    { id: 1, text: 'Estoy disponible', icon: '✅' },
    { id: 2, text: '¿Dónde estás?', icon: '📍' },
    { id: 3, text: 'Estoy en camino', icon: '🚗' }
  ],
  operator: [
    { id: 1, text: 'Voy en camino', icon: '🚗' },
    { id: 2, text: 'Llegaré en unos minutos', icon: '⏱️' },
    { id: 3, text: 'Estoy retrasado', icon: '🚧' },
    { id: 4, text: 'Ya estoy en el lugar', icon: '✅' }
  ]
};

/**
 * Chat in-app entre cliente y operador
 * Optimizado para uso mientras se maneja (botones grandes, mensajes rápidos)
 */
function ServiceChat({ serviceId, userType, otherName, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false); // Para feedback visual
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef(null);
  const userId = localStorage.getItem('userId') || 'user-1';
  const knownMessageIdsRef = useRef(new Set());
  const didInitRef = useRef(false);
  const notifRequestedRef = useRef(false);
  const latestCreatedAtRef = useRef(null);
  const pollInFlightRef = useRef(false);
  const errorStreakRef = useRef(0);

  // Best practice: pedir permiso solo 1 vez al abrir el chat (si está soportado).
  useEffect(() => {
    try {
      if (notifRequestedRef.current) return;
      notifRequestedRef.current = true;

      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;

      Notification.requestPermission().catch(() => {});
    } catch {
      // No bloqueamos el chat si falla el permiso.
    }
  }, [serviceId]);

  const POLL_BASE_MS = 6000;
  const POLL_MAX_MS = 30000;
  const DELTA_LIMIT = 100;

  const fetchInitialMessages = useCallback(async () => {
    const res = await axios.get(`${BACKEND_URL}/api/messages/service/${serviceId}`);
    const initialMessages = res.data || [];

    // Cargar historial completo una vez al abrir el chat.
    setMessages(initialMessages);

    const nextIds = new Set();
    initialMessages.forEach((m) => m?.id && nextIds.add(m.id));
    knownMessageIdsRef.current = nextIds;

    const last = initialMessages[initialMessages.length - 1];
    latestCreatedAtRef.current = last?.created_at || null;

    // Marcar como leídos sólo si hay mensajes nuevos del otro participante.
    const hasUnreadOther = initialMessages.some(
      (m) => m?.sender_type !== userType && m?.read === false
    );
    if (hasUnreadOther) {
      await axios.patch(`${BACKEND_URL}/api/messages/read/${serviceId}?reader_type=${userType}`);
    }

    // A partir de ahora, sí notificamos cuando lleguen mensajes nuevos.
    didInitRef.current = true;
  }, [serviceId, userType]);

  const fetchDeltaMessages = useCallback(async () => {
    const since = latestCreatedAtRef.current;
    const qs = since
      ? `?since=${encodeURIComponent(since)}&limit=${DELTA_LIMIT}`
      : `?limit=${DELTA_LIMIT}`;

    const res = await axios.get(`${BACKEND_URL}/api/messages/service/${serviceId}/delta${qs}`);
    const deltaMessages = res.data || [];
    if (!deltaMessages.length) return;

    const toAdd = deltaMessages.filter((m) => m?.id && !knownMessageIdsRef.current.has(m.id));
    if (!toAdd.length) {
      const last = deltaMessages[deltaMessages.length - 1];
      latestCreatedAtRef.current = last?.created_at || latestCreatedAtRef.current;
      return;
    }

    deltaMessages.forEach((m) => m?.id && knownMessageIdsRef.current.add(m.id));
    const last = deltaMessages[deltaMessages.length - 1];
    latestCreatedAtRef.current = last?.created_at || latestCreatedAtRef.current;

    // delta viene ordenado por created_at asc → appends preserva orden
    setMessages((prev) => prev.concat(toAdd));

    const newIncoming = toAdd.filter((m) => m.sender_type !== userType);
    if (didInitRef.current && newIncoming.length > 0) {
      await unlockAudio();
      playChatIncomingSound();
      showSystemNotification(
        'Nuevo mensaje',
        'Tienes un mensaje nuevo en MAQGO'
      );

      // Evita patch/read en cada poll: sólo cuando hay mensajes nuevos del otro participante.
      await axios.patch(`${BACKEND_URL}/api/messages/read/${serviceId}?reader_type=${userType}`);
    }
  }, [serviceId, userType]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    // Reiniciar estado cuando cambia la conversación.
    setMessages([]);
    knownMessageIdsRef.current = new Set();
    latestCreatedAtRef.current = null;
    didInitRef.current = false;
    errorStreakRef.current = 0;

    const runPollingLoop = async () => {
      if (cancelled) return;

      // Backpressure: nunca dispare más de una request al mismo tiempo.
      if (pollInFlightRef.current) {
        timeoutId = setTimeout(runPollingLoop, 1000);
        return;
      }

      pollInFlightRef.current = true;
      try {
        await fetchDeltaMessages();
        errorStreakRef.current = 0;
      } catch (e) {
        errorStreakRef.current += 1;
        // Evitar spam: sólo loggear en picos.
        if (errorStreakRef.current === 1 || errorStreakRef.current % 3 === 0) {
          console.warn('Chat delta poll error:', e?.response?.status || e?.message || e);
        }
      } finally {
        pollInFlightRef.current = false;
        const delay = Math.min(
          POLL_MAX_MS,
          POLL_BASE_MS * (2 ** errorStreakRef.current)
        );
        timeoutId = setTimeout(runPollingLoop, delay);
      }
    };

    (async () => {
      try {
        setLoading(true);
        await fetchInitialMessages();
      } catch (e) {
        console.error('Chat initial fetch error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) {
        timeoutId = setTimeout(runPollingLoop, POLL_BASE_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fetchInitialMessages, fetchDeltaMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    const content = newMessage.trim();
    const validation = validateChatMessage(content);
    if (!validation.ok) {
      setSendError(validation.message);
      return;
    }

    setSending(true);
    try {
      await axios.post(`${BACKEND_URL}/api/messages/send`, {
        service_id: serviceId,
        sender_type: userType,
        sender_id: userId,
        content
      });
      setNewMessage('');
      setSendError('');
      // Actualización eficiente: pedir sólo lo nuevo.
      void fetchDeltaMessages();
    } catch (e) {
      console.error('Error sending message:', e);
    }
    setSending(false);
  };

  // Enviar mensaje rápido (auto-envía sin escribir) con feedback visual
  const sendQuickMessage = async (text) => {
    if (sending) return;

    const validation = validateChatMessage(text);
    if (!validation.ok) {
      setSendError(validation.message);
      return;
    }

    setSending(true);
    setJustSent(true);
    
    try {
      await axios.post(`${BACKEND_URL}/api/messages/send`, {
        service_id: serviceId,
        sender_type: userType,
        sender_id: userId,
        content: text
      });
      setNewMessage('');
      setSendError('');
      // Actualización eficiente: pedir sólo lo nuevo.
      void fetchDeltaMessages();
      
      // Vibración de confirmación (si está disponible)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (e) {
      console.error('Error sending quick message:', e);
    }
    
    setSending(false);
    // Quitar feedback después de 1.5s
    setTimeout(() => setJustSent(false), 1500);
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#1A1A1F',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: '#2A2A2A',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: 4
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#EC6819',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
          </svg>
        </div>
        <div>
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>
            {otherName}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0 }}>
            {userType === 'client' ? 'Operador' : 'Cliente'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        {sendError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            padding: '10px 12px',
            borderRadius: 12,
            color: '#fff',
            fontSize: 13,
            marginBottom: 8
          }}>
            {sendError}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', paddingTop: 40 }}>
            Cargando mensajes...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', paddingTop: 40 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" style={{ marginBottom: 12 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p style={{ margin: 0, fontSize: 14 }}>Inicia la conversación</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>Coordina los detalles del servicio</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.sender_type === userType;
            return (
              <div
                key={msg.id || idx}
                style={{
                  alignSelf: isOwn ? 'flex-end' : 'flex-start',
                  maxWidth: '80%'
                }}
              >
                <div style={{
                  background: isOwn ? '#EC6819' : '#363636',
                  borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '10px 14px',
                }}>
                  <p style={{ color: '#fff', fontSize: 14, margin: 0, lineHeight: 1.4 }}>
                    {msg.content}
                  </p>
                </div>
                <p style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 10,
                  margin: '4px 8px 0',
                  textAlign: isOwn ? 'right' : 'left'
                }}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Feedback de mensaje enviado */}
      {justSent && (
        <div style={{
          background: 'rgba(76, 175, 80, 0.9)',
          padding: '10px 16px',
          textAlign: 'center'
        }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
            ✓ Mensaje enviado
          </span>
        </div>
      )}

      {/* Mensajes rápidos - Botones grandes para uso mientras se maneja */}
      <div style={{
        background: '#2A2A2A',
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <p style={{ 
          color: 'rgba(255,255,255,0.5)', 
          fontSize: 10, 
          margin: '0 0 10px', 
          textTransform: 'uppercase',
          letterSpacing: 1
        }}>
          Mensajes rápidos
        </p>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8
        }}>
          {QUICK_MESSAGES[userType]?.map((qm) => (
            <button
              key={qm.id}
              onClick={() => sendQuickMessage(qm.text)}
              disabled={sending}
              style={{
                padding: '12px 16px',
                background: sending ? '#555' : '#363636',
                border: '1px solid #555',
                borderRadius: 12,
                color: '#fff',
                fontSize: 14,
                cursor: sending ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 48, // Altura mínima para fácil toque
                transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 18 }}>{qm.icon}</span>
              <span>{qm.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Input para mensaje personalizado */}
      <div style={{
        background: '#1A1A1F',
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="O escribe un mensaje..."
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#2A2A2A',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            color: '#fff',
            fontSize: 14,
            outline: 'none'
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!newMessage.trim() || sending}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: newMessage.trim() ? '#EC6819' : '#444',
            border: 'none',
            cursor: newMessage.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ServiceChat;
