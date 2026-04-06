import React from 'react';

/**
 * Input estilizado MAQGO
 */
const MaqgoInput = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon = null,
  error = null,
  disabled = false,
  prefix = null,
  style = {},
}) => {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      {label && (
        <label style={{
          display: 'block',
          color: '#888',
          fontSize: 13,
          marginBottom: 8,
          fontWeight: 500,
        }}>
          {label}
        </label>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#1a1a1a',
        borderRadius: 12,
        border: error ? '2px solid #f44336' : '2px solid transparent',
        transition: 'border-color 0.2s ease',
      }}>
        {prefix && (
          <span style={{
            padding: '16px 0 16px 16px',
            color: '#888',
            fontSize: 15,
          }}>
            {prefix}
          </span>
        )}
        {icon && (
          <span style={{
            padding: '16px 0 16px 16px',
            color: '#666',
          }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: prefix || icon ? '16px 16px 16px 8px' : 16,
            color: '#fff',
            fontSize: 15,
            outline: 'none',
          }}
        />
      </div>
      {error && (
        <span style={{ color: '#f44336', fontSize: 12, marginTop: 4, display: 'block' }}>
          {error}
        </span>
      )}
    </div>
  );
};

export default MaqgoInput;
