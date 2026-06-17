import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BackArrowIcon } from '../BackArrowIcon';
import MaqgoLogo from '../MaqgoLogo';

function ServiceTopBar({
  showBack = false,
  backLabel = 'Volver',
  onBack,
  showHome = true,
  homeLabel = 'Inicio',
  onHome,
  rightSlot = null,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  };

  const handleHome = () => {
    if (onHome) {
      onHome();
      return;
    }
    navigate('/client/home');
  };

  return (
    <div className="w-full flex items-center justify-between" style={{ minHeight: 56 }}>
      <div className="flex items-center" style={{ minWidth: 96 }}>
        {showBack ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label={backLabel}
            className="inline-flex items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: 12, color: 'rgba(255,255,255,0.95)' }}
          >
            <BackArrowIcon />
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-center flex-1">
        <MaqgoLogo size="mini" customSize={28} />
      </div>

      <div className="flex items-center justify-end gap-2" style={{ minWidth: 96 }}>
        {rightSlot}
        {showHome ? (
          <button
            type="button"
            onClick={handleHome}
            aria-label={homeLabel}
            className="inline-flex items-center justify-center"
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: 12,
              color: 'rgba(255,255,255,0.90)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)'
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>{homeLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ServiceTopBar;

