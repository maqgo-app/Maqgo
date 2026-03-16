import React, { useState, useRef, useEffect } from 'react';
import { searchComunas } from '../data/comunas';

/**
 * Input con autocomplete para comunas de Chile
 */
export const ComunaAutocomplete = ({ 
  value, 
  onChange, 
  placeholder = "Ej: Providencia",
  className = "maqgo-input",
  style = {}
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    onChange(inputValue);
    
    if (inputValue.length >= 2) {
      const results = searchComunas(inputValue);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelect = (comuna) => {
    onChange(comuna.nombre);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
        }}
        placeholder={placeholder}
        className={className}
        style={style}
        autoComplete="off"
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#2A2A2A',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          marginTop: 4,
          maxHeight: 240,
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          {suggestions.map((comuna, index) => (
            <div
              key={comuna.nombre}
              onClick={() => handleSelect(comuna)}
              style={{
                padding: '12px 14px',
                cursor: 'pointer',
                background: highlightedIndex === index ? 'rgba(236, 104, 25, 0.2)' : 'transparent',
                borderBottom: index < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background 0.15s'
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span style={{ 
                color: highlightedIndex === index ? '#EC6819' : '#fff', 
                fontSize: 14,
                fontWeight: highlightedIndex === index ? 500 : 400
              }}>
                {comuna.nombre}
              </span>
              <span style={{ 
                color: 'rgba(255,255,255,0.9)', 
                fontSize: 11 
              }}>
                {comuna.region}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ComunaAutocomplete;
