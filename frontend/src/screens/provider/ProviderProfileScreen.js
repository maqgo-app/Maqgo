import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObject } from '../../utils/safeStorage';

/**
 * Pantalla: Perfil del Proveedor (Estilo Airbnb)
 * - Titular/Gerente (super_master, master, owner): ve todo (Inicio, Máquinas, Cobros, Empresa, Banco, Ayuda, Legal)
 * - Operador: ve solo lo suyo (Inicio, Historial, Ayuda, Legal) — sin máquinas, cobros ni datos empresa/banco
 */
function ProviderProfileScreen() {
  const navigate = useNavigate();
  const [providerData, setProviderData] = useState({});
  const [bankComplete, setBankComplete] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const providerRole = localStorage.getItem('providerRole') || 'super_master';
  const isOperator = providerRole === 'operator';
  const operatorName = localStorage.getItem('operatorName') || 'Operador';

  useEffect(() => {
    const saved = getObject('providerData', {});
    const bank = getObject('bankData', {});
    setProviderData(saved);
    setBankComplete(!!bank.bank && !!bank.accountNumber);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const MenuItem = ({ label, sublabel, onClick, showBadge }) => (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '16px 0',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
        fontSize: 15,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        textAlign: 'left'
      }}
    >
      <div>
        <span style={{ display: 'block' }}>{label}</span>
        {sublabel && (
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2, display: 'block' }}>
            {sublabel}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showBadge && (
          <span style={{
            background: '#EC6819',
            color: '#fff',
            fontSize: 10,
            padding: '2px 6px',
            borderRadius: 4
          }}>
            Pendiente
          </span>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 6L15 12L9 18" stroke="#666" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    </button>
  );

  const SectionTitle = ({ title }) => (
    <p style={{
      color: 'rgba(255,255,255,0.4)',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      margin: '24px 0 8px',
      fontWeight: 600
    }}>
      {title}
    </p>
  );

  return (
    <div className="maqgo-app">
      <div className="maqgo-screen" style={{ padding: 'var(--maqgo-screen-padding-top) 24px 120px' }}>
        {/* Header: empresa (titular) o nombre operador */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 8,
          paddingBottom: 24,
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: '#EC6819',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>
              {isOperator ? (operatorName.charAt(0) || 'O') : (providerData.businessName?.charAt(0) || 'M')}
            </span>
          </div>
          <div>
            <h1 className="maqgo-h1" style={{ margin: 0 }}>
              {isOperator ? operatorName : (providerData.businessName || 'Mi Empresa')}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0 0' }}>
              {isOperator ? 'Operador de maquinaria' : (providerData.rut || 'Completa tu perfil')}
            </p>
          </div>
        </div>

        {/* TITULAR/GERENTE: ve todo */}
        {!isOperator && (
          <>
            <SectionTitle title="Mi negocio" />
            <MenuItem 
              label="Inicio" 
              sublabel="Ver solicitudes y estado"
              onClick={() => navigate('/provider/home')}
            />
            <MenuItem 
              label="Mis máquinas" 
              sublabel="Gestionar maquinaria registrada"
              onClick={() => navigate('/provider/machines')}
            />
            <MenuItem 
              label="Mis cobros" 
              sublabel="Historial de pagos recibidos"
              onClick={() => navigate('/provider/cobros')}
            />

            <SectionTitle title="Mi cuenta" />
            <MenuItem 
              label="Datos de la empresa" 
              sublabel={providerData.businessName || 'Sin completar'}
              onClick={() => navigate('/provider/profile/empresa')}
            />
            {providerData.emitsInvoice !== false && (
              <MenuItem 
                label="Datos para facturar a MAQGO" 
                sublabel="Razón social, RUT, giro, dirección"
                onClick={() => navigate('/provider/profile/maqgo-billing')}
              />
            )}
            <MenuItem 
              label="Datos bancarios" 
              sublabel={bankComplete ? 'Configurado' : 'Requerido para recibir pagos'}
              onClick={() => navigate('/provider/profile/banco')}
              showBadge={!bankComplete}
            />
          </>
        )}

        {/* OPERADOR: solo Inicio, Historial */}
        {isOperator && (
          <>
            <SectionTitle title="Acceso" />
            <MenuItem 
              label="Inicio" 
              sublabel="Ver solicitudes asignadas"
              onClick={() => navigate('/operator/home')}
            />
            <MenuItem 
              label="Historial" 
              sublabel="Servicios completados"
              onClick={() => navigate('/provider/history')}
            />
          </>
        )}

        {/* AYUDA - ambos */}
        <SectionTitle title="Ayuda" />
        <MenuItem 
          label="Preguntas frecuentes" 
          onClick={() => navigate('/faq')}
        />

        {/* LEGAL */}
        <SectionTitle title="Legal" />
        <MenuItem 
          label="Términos y condiciones" 
          onClick={() => navigate('/terms')}
        />
        <MenuItem 
          label="Política de privacidad" 
          onClick={() => navigate('/privacy')}
        />

        {/* Cerrar sesión */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          style={{
            width: '100%',
            padding: 16,
            marginTop: 40,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 30,
            color: 'rgba(255,255,255,0.6)',
            fontSize: 14,
            cursor: 'pointer'
          }}
        >
          Cerrar sesión
        </button>

        <p style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 11,
          marginTop: 20
        }}>
          MAQGO v1.0
        </p>

        {/* Modal de confirmación de logout */}
        {showLogoutConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24
          }}>
            <div style={{
              background: '#2A2A2A',
              borderRadius: 16,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
                ¿Cerrar sesión?
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 24px' }}>
                Tendrás que volver a iniciar sesión para continuar.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#444',
                    border: 'none',
                    borderRadius: 25,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    flex: 1,
                    padding: 12,
                    background: '#ff6b6b',
                    border: 'none',
                    borderRadius: 25,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProviderProfileScreen;
