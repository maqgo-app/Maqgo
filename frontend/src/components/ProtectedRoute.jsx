import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem("role");

  // Si no hay sesión → login
  if (!role) return <Navigate to="/login" replace />;

  const path = window.location.pathname;

  // 🔒 BLOQUEO TOTAL DE CRUCE DE ROLES (incluye botón atrás)
  if (role === "client" && path.startsWith("/provider")) {
    return <Navigate to="/client/home" replace />;
  }

  if (role === "provider" && path.startsWith("/client")) {
    return <Navigate to="/provider/home" replace />;
  }

  return children;
};

export default ProtectedRoute;
