import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para íconos de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Ícono para punto de salida (naranja MAQGO)
const originIcon = new L.Icon({
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

function OnTheWayMap({ originLocation, operatorLocation, serviceLocation }) {
  const defaultService = { lat: -33.4489, lng: -70.6693, address: 'Obra' };
  const service = serviceLocation || defaultService;

  const hasOrigin = Boolean(
    originLocation &&
      originLocation.lat != null &&
      originLocation.lng != null
  );
  const origin = hasOrigin ? originLocation : null;

  const hasOperator = Boolean(
    operatorLocation &&
      operatorLocation.lat != null &&
      operatorLocation.lng != null
  );
  const operator = hasOperator ? operatorLocation : null;

  const routeLine = useMemo(() => {
    if (!hasOrigin) return null;
    return [
      [origin.lat, origin.lng],
      [service.lat, service.lng],
    ];
  }, [hasOrigin, origin?.lat, origin?.lng, service.lat, service.lng]);

  const centerLat = hasOrigin
    ? (origin.lat + service.lat) / 2
    : hasOperator
      ? (operator.lat + service.lat) / 2
      : service.lat;
  const centerLng = hasOrigin
    ? (origin.lng + service.lng) / 2
    : hasOperator
      ? (operator.lng + service.lng) / 2
      : service.lng;
  
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
        zoom={hasOrigin ? 12 : hasOperator ? 13 : 14}
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
        
        {hasOrigin ? (
          <Marker position={[origin.lat, origin.lng]} icon={originIcon}>
            <Popup>
              <strong style={{ color: '#EC6819' }}>Origen</strong>
            </Popup>
          </Marker>
        ) : hasOperator ? (
          <Marker position={[operator.lat, operator.lng]} icon={originIcon}>
            <Popup>
              <strong style={{ color: '#EC6819' }}>{operator.name || 'Operador'}</strong>
              <br />
              Ubicación operativa
            </Popup>
          </Marker>
        ) : null}
        
        {/* Pin de la obra */}
        <Marker position={[service.lat, service.lng]} icon={destinationIcon}>
          <Popup>
            <strong style={{ color: '#90BDD3' }}>📍 Tu obra</strong>
            <br />
            {service.address || 'Destino'}
          </Popup>
        </Marker>

        {routeLine ? (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: '#90BDD3', weight: 3, opacity: 0.8, dashArray: '6 8' }}
          />
        ) : null}
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
        {hasOrigin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EC6819' }}></div>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Origen</span>
          </div>
        ) : hasOperator ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EC6819' }}></div>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Operador</span>
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#90BDD3' }}></div>
          <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13 }}>Tu obra</span>
        </div>
      </div>
    </div>
  );
}

export default OnTheWayMap;
