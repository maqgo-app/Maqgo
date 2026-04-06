import React from 'react';

/**
 * Card base MAQGO.
 * Contenedor con estilo consistente. Usa variables CSS cuando estén disponibles.
 */
function MaqgoCard({ children, className = '', style = {}, onClick, ...rest }) {
  const cardStyle = {
    background: 'var(--maqgo-bg-card, #1A1A1F)',
    border: '1px solid var(--maqgo-border, #2A2A2A)',
    borderRadius: 'var(--maqgo-radius-md, 12px)',
    padding: 'var(--maqgo-space-md, 16px)',
    ...style
  };

  const Component = onClick ? 'button' : 'div';
  const componentProps = onClick
    ? {
        onClick,
        type: 'button',
        style: { ...cardStyle, cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none' }
      }
    : { style: cardStyle };

  return (
    <Component className={className} {...componentProps} {...rest}>
      {children}
    </Component>
  );
}

export default MaqgoCard;
