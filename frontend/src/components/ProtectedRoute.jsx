import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import BACKEND_URL, { fetchWithAuth, hasPersistedSessionCredentials } from "../utils/api";

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const path = location.pathname || "/";
  const fullPath = `${path}${location.search || ""}`;
  const hasSession = hasPersistedSessionCredentials();
  const [legalState, setLegalState] = useState("unknown");

  const userId = useMemo(() => {
    try {
      return String(localStorage.getItem("userId") || "").trim();
    } catch {
      return "";
    }
  }, [hasSession]);

  useEffect(() => {
    let cancelled = false;
    if (!hasSession) {
      setLegalState("unknown");
      return () => void 0;
    }
    const fromStorage = () => {
      try {
        const v = String(localStorage.getItem("legalAcceptedAt") || "").trim();
        return Boolean(v);
      } catch {
        return false;
      }
    };
    if (fromStorage()) {
      setLegalState("accepted");
      return () => void 0;
    }
    if (!userId) {
      setLegalState("missing");
      return () => void 0;
    }
    setLegalState("unknown");
    fetchWithAuth(`${BACKEND_URL}/api/users/${encodeURIComponent(userId)}`, { method: "GET" }, 5000)
      .then(async (res) => {
        if (!res.ok) return null;
        return await res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const acceptedAt = String(data?.legalAcceptedAt || "").trim();
        if (acceptedAt) {
          try {
            localStorage.setItem("legalAcceptedAt", acceptedAt);
          } catch {
            void 0;
          }
          setLegalState("accepted");
        } else {
          setLegalState("missing");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLegalState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [hasSession, userId]);

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

  if (legalState === "unknown") {
    return null;
  }
  if (legalState === "missing") {
    return (
      <Navigate
        to={`/terms?accept=1&next=${encodeURIComponent(fullPath)}`}
        replace
        state={{ next: fullPath }}
      />
    );
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
