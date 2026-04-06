import { Navigate } from 'react-router-dom';

/** Ruta legacy: una sola pantalla con fotos + tarifas. */
export default function MachinePhotosScreen() {
  return <Navigate to="/provider/machine-photos-pricing" replace />;
}
