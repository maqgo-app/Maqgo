import { Navigate, Outlet, useLocation } from "react-router-dom";

const ProtectedRoute = ({ user }) => {
  const location = useLocation();

  // Si no hay usuario → login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = user?.role;
  const path = location.pathname;

  // 🔒 BLOQUEO TOTAL DE FLUJOS
  if (userRole === "client" && path.startsWith("/operator")) {
    return <Navigate to="/client/home" replace />;
  }

  if (userRole === "operator" && path.startsWith("/client")) {
    return <Navigate to="/operator/home" replace />;
  }

  // ✅ Permitir acceso normal
  return <Outlet />;
};

export default ProtectedRoute;
