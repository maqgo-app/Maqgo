import React from 'react';

/**
 * Botón estilizado MAQGO
 */
const MaqgoButton = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'large',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon = null,
  style = {}
}) => {
  const variants = {
    primary: {
      background: 'linear-gradient(135deg, #ff8c42 0%, #ff7a28 100%)',
      color: '#fff',
      border: 'none',
    },
    secondary: {
      background: 'transparent',
      color: '#ff8c42',
      border: '2px solid #ff8c42',
    },
    success: {
      background: 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)',
      color: '#fff',
      border: 'none',
    },
    danger: {
      background: 'transparent',
      color: '#f44336',
      border: '2px solid #f44336',
    },
    ghost: {
      background: 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
      border: 'none',
    },
  };

  const sizes = {
    small: { padding: '10px 16px', fontSize: 14 },
    medium: { padding: '14px 20px', fontSize: 15 },
    large: { padding: '18px 24px', fontSize: 16 },
  };

  const baseStyle = {
    ...variants[variant],
    ...sizes[size],
    width: fullWidth ? '100%' : 'auto',
    borderRadius: 14,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.3s ease',
    letterSpacing: 0.5,
    ...style,
  };

  return (
    <button 
      style={baseStyle} 
      onClick={onClick} 
      disabled={disabled || loading}
    >
      {loading ? (
        <span style={{
          width: 20,
          height: 20,
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      ) : (
        <>
          {icon && <span>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};

export default MaqgoButton;
