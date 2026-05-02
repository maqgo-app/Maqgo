import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isProviderSession, isClientSession, getSessionRole } from "../utils/userAuthState";

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const role = getSessionRole();
  const path = location.pathname || "/";
  const fullPath = `${path}${location.search || ""}`;

  const isPublicPath =
    path === "/provider/register" ||
    path === "/provider/add-machine" ||
    path === "/operator/join";

  if (!role && isPublicPath) {
    return children ? children : <Outlet />;
  }

  // Si no hay sesión → login
  if (!role) {
    console.log("PROTECTED_ROUTE: No session found, redirecting to /login");
    const entry = path.startsWith("/provider") ? "provider" : "client";
    return (
      <Navigate
        to="/login"
        replace
        state={{
          redirect: fullPath,
          entry,
        }}
      />
    );
  }

  // 🔒 BLOQUEO TOTAL DE CRUCE DE ROLES (incluye botón atrás)
  // Un cliente nunca entra a /provider/*
  if (isClientSession() && path.startsWith("/provider")) {
    console.log("PROTECTED_ROUTE: Client trying to access provider route. Redirecting to /client/home");
    return <Navigate to="/client/home" replace />;
  }

  // Un proveedor nunca entra a /client/*
  if (isProviderSession() && path.startsWith("/client")) {
    console.log("PROTECTED_ROUTE: Provider trying to access client route. Redirecting to /provider/home");
    return <Navigate to="/provider/home" replace />;
  }

  // Los admins tienen su propio AdminRoute, pero si caen aquí les dejamos pasar a rutas comunes
  // si es necesario, o podemos ser más estrictos.

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
