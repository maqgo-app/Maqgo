import React from 'react';
import MaqgoCard from '../base/MaqgoCard';

function ServicePrimaryActionCard({ title, children, style = {} }) {
  return (
    <MaqgoCard style={{ borderRadius: 14, padding: 16, ...style }}>
      {title ? (
        <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          {title}
        </div>
      ) : null}
      {children}
    </MaqgoCard>
  );
}

export default ServicePrimaryActionCard;

