import React from 'react';

export default function MaqgoTitleCard({ title, maxWidth = 380 }) {
  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto', textAlign: 'center', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <div
          style={{
            background: '#1E1E24',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '10px 14px',
            width: '100%',
          }}
        >
          <h1 className="maqgo-h1" style={{ margin: 0 }}>
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}
