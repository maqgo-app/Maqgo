import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MaqgoLogo from '../../components/MaqgoLogo';
import ProviderOnboardingProgress from '../../components/ProviderOnboardingProgress';
import { getArray } from '../../utils/safeStorage';

/**
 * P06 - Fotos de la Máquina
 * Opcional: recomendamos al menos 1 frontal; incentivamos lateral y trasera. No mostramos la máquina al cliente tipo Uber por ahora (post-MVP si hay demanda).
 * Fotos se redimensionan y comprimen al subir para no relentizar la app (max 1200px, JPEG 0.82).
 */
const MAX_PHOTOS = 3;
const MAX_PHOTO_PX = 1200;
const JPEG_QUALITY = 0.82;

/** Redimensiona y comprime la imagen para no guardar en alta resolución (mejor rendimiento y navegación). */
function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, MAX_PHOTO_PX / Math.max(w, h));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Error al cargar la imagen'));
    img.src = dataUrl;
  });
}

function MachinePhotosScreen() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    const saved = getArray('machinePhotos', []);
    if (saved.length > 0) setPhotos(saved);
    
    // Check if demo mode
    const demoMode = localStorage.getItem('demoMode') === 'true';
    setIsDemo(demoMode);
  }, []);

  const handleAddPhoto = (e) => {
    if (photos.length >= MAX_PHOTOS) return;
    const file = e?.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const photoLabels = ['Frontal', 'Lateral', 'Trasera'];
    const label = photoLabels[photos.length] || `Foto ${photos.length + 1}`;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target.result;
        const compressed = await compressImage(dataUrl);
        const newPhoto = { url: compressed, label };
        const updated = [...photos, newPhoto];
        setPhotos(updated);
        localStorage.setItem('machinePhotos', JSON.stringify(updated));
      } catch (err) {
        console.error('Error al procesar la foto:', err);
        const newPhoto = { url: event.target.result, label };
        const updated = [...photos, newPhoto];
        setPhotos(updated);
        localStorage.setItem('machinePhotos', JSON.stringify(updated));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = (index) => {
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);
    localStorage.setItem('machinePhotos', JSON.stringify(updated));
  };

  const updatePhotoLabel = (index, newLabel) => {
    setPhotos(prev => {
      const updated = prev.map((p, i) => {
        if (i !== index) return p;
        if (typeof p === 'string') return { url: p, label: newLabel };
        return { ...p, label: newLabel };
      });
      localStorage.setItem('machinePhotos', JSON.stringify(updated));
      return updated;
    });
  };

  const handleContinue = () => {
    // Fase MVP: no bloquear si no hay fotos
    localStorage.setItem('providerOnboardingStep', '4'); // Guardar paso actual
    navigate('/provider/pricing');
  };

  const handleSkipDemo = () => {
    // Modo demo: permitir continuar sin fotos
    localStorage.setItem('demoMode', 'true');
    localStorage.setItem('providerOnboardingStep', '4'); // Guardar paso actual
    navigate('/provider/pricing');
  };

  const handleBack = () => navigate('/provider/machine-data');

  const canContinue = true; // Fotos opcionales desde día cero

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ paddingBottom: 120, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          marginBottom: 20
        }}>
          <button 
            onClick={handleBack}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            aria-label="Volver"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <MaqgoLogo size="small" />
          </div>
          <div style={{ width: 24 }}></div>
        </div>

        <ProviderOnboardingProgress currentStep={3} />

        <h1 className="maqgo-h1" style={{ textAlign: 'center', marginBottom: 10 }}>
          Fotos de la Máquina
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 8
        }}>
          Te recomendamos subir al menos una foto frontal (opcional). Si quieres, agrega también lateral y trasera.
        </p>

        {/* Indicador de fotos */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20
        }}>
          <div style={{
            background: 'rgba(144, 189, 211, 0.2)',
            border: '1px solid #90BDD3',
            borderRadius: 20,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 8L7 11L12 5" stroke="#90BDD3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ color: '#90BDD3', fontSize: 13, fontWeight: 600 }}>
                {photos.length === 0
                  ? 'Sin fotos aún (opcional)'
                  : `${photos.length} foto${photos.length !== 1 ? 's' : ''} subida${photos.length !== 1 ? 's' : ''}`}
              </span>
            </>
          </div>
        </div>

        {/* Sugerencias de fotos */}
        {photos.length < MAX_PHOTOS && (
          <div style={{
            background: '#363636',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16
          }}>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, margin: 0 }}>
              {photos.length === 0
                ? 'Recomendado: una foto frontal. Opcional: lateral y trasera.'
                : 'Puedes agregar hasta 2 fotos más (lateral y trasera).'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {['Frontal', 'Lateral', 'Trasera'].map((tipo, i) => (
                <span key={tipo} style={{
                  background: photos.length > i ? 'rgba(144, 189, 211, 0.2)' : '#444',
                  color: photos.length > i ? '#90BDD3' : 'rgba(255,255,255,0.9)',
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 12
                }}>
                  {photos.length > i ? '✓ ' : ''}{tipo}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grid de fotos */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginBottom: 20
          }}>
            {photos.map((photo, index) => {
              const currentLabel = typeof photo === 'object' ? (photo.label || `Foto ${index + 1}`) : `Foto ${index + 1}`;
              const labelOptions = ['Frontal', 'Lateral', 'Trasera'];
              return (
                <div key={index}>
                  <div style={{
                    position: 'relative',
                    background: '#363636',
                    borderRadius: 12,
                    overflow: 'hidden',
                    aspectRatio: '4/3'
                  }}>
                    <img 
                      src={typeof photo === 'string' ? photo : photo.url} 
                      alt={`Foto ${index + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Label de la foto + feedback de carga inmediata */}
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0,0,0,0.7)',
                      padding: '4px 8px',
                      fontSize: 11,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6
                    }}>
                      <span>{currentLabel}</span>
                      <span style={{ color: '#90BDD3', fontWeight: 600 }}>✓ Cargada</span>
                    </div>
                    <button
                      onClick={() => handleRemovePhoto(index)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'rgba(255,107,107,0.9)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {/* Selector de tipo de foto: frontal, lateral o trasera */}
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {labelOptions.map((type) => {
                      const isActive = currentLabel === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updatePhotoLabel(index, type)}
                          style={{
                            borderRadius: 16,
                            border: isActive ? '1px solid #EC6819' : '1px solid #555',
                            padding: '4px 10px',
                            fontSize: 11,
                            background: isActive ? 'rgba(236, 104, 25, 0.15)' : 'transparent',
                            color: isActive ? '#EC6819' : 'rgba(255,255,255,0.8)',
                            cursor: 'pointer'
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Botón agregar foto - solo si no llegó al máximo */}
            {photos.length < MAX_PHOTOS && (
            <label
              style={{
                background: '#363636',
                border: '2px dashed #555',
                borderRadius: 12,
                aspectRatio: '4/3',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#EC6819'
              }}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAddPhoto}
                style={{ display: 'none' }}
                aria-label={photos.length === 0 ? 'Tomar o subir foto frontal' : 'Tomar o subir foto opcional'}
              />
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="4" y="8" width="32" height="24" rx="3" stroke="#EC6819" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="16" r="3" stroke="#EC6819" strokeWidth="2" fill="none"/>
                <path d="M8 28L14 22L18 26L26 18L32 24" stroke="#EC6819" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="30" cy="12" r="6" fill="#2D2D2D" stroke="#EC6819" strokeWidth="2"/>
                <path d="M30 9V15M27 12H33" stroke="#EC6819" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, marginTop: 8 }}>
                {photos.length === 0 ? 'Tomar o subir foto frontal' : 'Agregar foto (opcional)'}
              </span>
            </label>
            )}
          </div>
        </div>
      </div>

      {/* Botón fijo - siempre visible */}
      <div className="maqgo-fixed-bottom-bar">
        <button 
          className="maqgo-btn-primary"
          onClick={handleContinue}
        >
          Siguiente
        </button>

        {/* Link para modo demo - solo en desarrollo */}
        {import.meta.env.DEV && (
          <button
            onClick={handleSkipDemo}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              padding: 10,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Saltar para pruebas (modo demo)
          </button>
        )}
      </div>
    </div>
  );
}

export default MachinePhotosScreen;
