import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para íconos de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Ícono personalizado para el operador (naranja MAQGO)
const operatorIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path fill="#EC6819" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z"/>
      <circle fill="white" cx="12" cy="12" r="6"/>
      <circle fill="#EC6819" cx="12" cy="12" r="3"/>
    </svg>
  `),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

// Ícono para la obra/destino (cyan)
const destinationIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
      <path fill="#90BDD3" d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z"/>
      <circle fill="white" cx="12" cy="12" r="6"/>
      <path fill="#90BDD3" d="M9 10h6v6H9z"/>
    </svg>
  `),
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
});

/**
 * Componente de mapa simple para mostrar operador en camino
 * 
 * Props:
 * - operatorLocation: { lat, lng, name } - Ubicación del operador
 * - serviceLocation: { lat, lng, address } - Ubicación de la obra
 * 
 * Uso: Solo post-pago y post-aceptación
 */
function OnTheWayMap({ operatorLocation, serviceLocation }) {
  // Coordenadas por defecto (Santiago Centro) si no se proporcionan
  const defaultOperator = { lat: -33.4372, lng: -70.6506, name: 'Operador' };
  const defaultService = { lat: -33.4489, lng: -70.6693, address: 'Obra' };
  
  const operator = operatorLocation || defaultOperator;
  const service = serviceLocation || defaultService;
  
  // Centro del mapa entre ambos puntos
  const centerLat = (operator.lat + service.lat) / 2;
  const centerLng = (operator.lng + service.lng) / 2;
  
  return (
    <div style={{ 
      width: '100%', 
      height: 200, 
      borderRadius: 12, 
      overflow: 'hidden',
      marginBottom: 16,
      border: '2px solid #363636'
    }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={13}
        minZoom={11}
        maxZoom={15}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Pin del operador */}
        <Marker position={[operator.lat, operator.lng]} icon={operatorIcon}>
          <Popup>
            <strong style={{ color: '#EC6819' }}>🚜 {operator.name || 'Operador'}</strong>
            <br />
            En camino
          </Popup>
        </Marker>
        
        {/* Pin de la obra */}
        <Marker position={[service.lat, service.lng]} icon={destinationIcon}>
          <Popup>
            <strong style={{ color: '#90BDD3' }}>📍 Tu obra</strong>
            <br />
            {service.address || 'Destino'}
          </Popup>
        </Marker>
      </MapContainer>
      
      {/* Leyenda */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 20,
        padding: '8px 0',
        background: '#2A2A2A',
        marginTop: -4
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EC6819' }}></div>
          <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Operador</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#90BDD3' }}></div>
          <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Tu obra</span>
        </div>
      </div>
    </div>
  );
}

export default OnTheWayMap;
