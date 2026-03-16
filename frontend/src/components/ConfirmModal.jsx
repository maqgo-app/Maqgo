/**
 * Modal de confirmación – reemplazo de window.confirm
 * Estilo coherente con la app MAQGO (sin Radix/Tailwind)
 */
function ConfirmModal({ open, onClose, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', onConfirm, onCancel, variant = 'danger' }) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  const handleCancel = () => {
    onCancel?.();
    onClose?.();
  };

  const confirmBg = variant === 'danger' ? '#DC3545' : '#EC6819';

  return (
    <div
      className="maqgo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div className="maqgo-modal-dialog">
        <h3 id="confirm-modal-title" style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px', fontFamily: "'Inter', sans-serif" }}>
          {title}
        </h3>
        <p id="confirm-modal-desc" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.5, margin: '0 0 24px', fontFamily: "'Inter', sans-serif" }}>
          {message}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleConfirm}
            style={{
              padding: 16,
              background: confirmBg,
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={handleCancel}
            style={{
              padding: 16,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12,
              color: 'rgba(255,255,255,0.95)',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
