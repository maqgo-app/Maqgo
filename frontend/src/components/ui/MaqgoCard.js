import React from 'react';

/**
 * Tarjeta estilizada MAQGO
 */
const MaqgoCard = ({
  children,
  variant = 'default',
  selected = false,
  onClick = null,
  padding = 16,
  style = {},
}) => {
  const variants = {
    default: {
      background: '#1a1a1a',
      border: '2px solid transparent',
    },
    teal: {
      background: '#1a2f2f',
      border: '2px solid transparent',
    },
    success: {
      background: 'rgba(76, 175, 80, 0.1)',
      border: '1px solid rgba(76, 175, 80, 0.3)',
    },
    warning: {
      background: 'rgba(255, 140, 66, 0.1)',
      border: '1px solid rgba(255, 140, 66, 0.3)',
    },
    transparent: {
      background: 'transparent',
      border: '2px solid #333',
    },
  };

  const baseStyle = {
    ...variants[variant],
    borderRadius: 14,
    padding,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    ...(selected && {
      borderColor: '#ff8c42',
      background: 'rgba(255, 140, 66, 0.1)',
    }),
    ...style,
  };

  return (
    <div style={baseStyle} onClick={onClick}>
      {children}
    </div>
  );
};

export default MaqgoCard;
