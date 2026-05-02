import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasPersistedSessionCredentials } from "../utils/api";

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const path = location.pathname || "/";
  const fullPath = `${path}${location.search || ""}`;
  const hasSession = hasPersistedSessionCredentials();
  if (!hasSession) {
    const entry = path.startsWith("/provider")
      ? "provider"
      : path.startsWith("/operator")
        ? "operator"
        : "client";
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

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
