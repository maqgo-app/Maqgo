import { Navigate } from 'react-router-dom';

/** Ruta legacy: tarifas unificadas con fotos en `/provider/machine-photos-pricing`. */
export default function PricingScreen() {
  return <Navigate to="/provider/machine-photos-pricing" replace />;
}
