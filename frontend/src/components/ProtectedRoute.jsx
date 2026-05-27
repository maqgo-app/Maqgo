import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import BACKEND_URL, { fetchWithAuth, hasPersistedSessionCredentials } from "../utils/api";
import MaqgoLogo from "./MaqgoLogo";

function shouldEnforceLegalForPath(path) {
  const p = String(path || "");
  if (p.startsWith("/provider/")) {
    return (
      p === "/provider/data" ||
      p === "/provider/machine-data" ||
      p === "/provider/machine-photos" ||
      p === "/provider/machine-photos-pricing" ||
      p === "/provider/pricing" ||
      p === "/provider/operator-data" ||
      p === "/provider/review"
    );
  }
  if (p.startsWith("/client/")) {
    return (
      p === "/client/booking" ||
      p === "/client/machinery" ||
      p === "/client/urgency" ||
      p === "/client/calendar" ||
      p === "/client/service-location" ||
      p === "/client/providers" ||
      p === "/client/confirm" ||
      p === "/client/billing" ||
      p === "/client/workday-confirmation" ||
      p === "/client/card"
    );
  }
  if (p === "/oneclick/complete") return true;
  return false;
}

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const path = location.pathname || "/";
  const fullPath = `${path}${location.search || ""}`;
  const hasSession = hasPersistedSessionCredentials();
  const [legalState, setLegalState] = useState("unknown");
  const [verifyNonce, setVerifyNonce] = useState(0);

  const mustAcceptLegalNow = useMemo(() => shouldEnforceLegalForPath(path), [path]);

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
    if (!mustAcceptLegalNow) {
      setLegalState("accepted");
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
        if (!res.ok) {
          const err = new Error("legal_verification_failed");
          err.status = res.status;
          throw err;
        }
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
        setLegalState("network_error");
      });
    return () => {
      cancelled = true;
    };
  }, [hasSession, mustAcceptLegalNow, userId, verifyNonce]);

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

  if (!mustAcceptLegalNow) {
    return children ? children : <Outlet />;
  }

  if (legalState === "unknown") {
    return (
      <div className="maqgo-app maqgo-client-funnel" aria-live="polite">
        <div
          className="maqgo-screen maqgo-screen--scroll"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--maqgo-screen-padding-top) 24px 40px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <MaqgoLogo size="small" />
            </div>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>
              Verificando acceso…
            </p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "10px 0 0", lineHeight: 1.45 }}>
              Estamos validando tu sesión y permisos para continuar.
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <span
                style={{
                  width: 32,
                  height: 32,
                  border: "3px solid rgba(236,104,25,0.25)",
                  borderTopColor: "var(--maqgo-orange)",
                  borderRadius: "50%",
                  animation: "maqgo-spin 0.8s linear infinite",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (legalState === "network_error") {
    const offline =
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? !navigator.onLine
        : false;
    return (
      <div className="maqgo-app maqgo-client-funnel" aria-live="polite">
        <div
          className="maqgo-screen maqgo-screen--scroll"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--maqgo-screen-padding-top) 24px 40px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <MaqgoLogo size="small" />
            </div>
            <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>
              No pudimos verificar tu conexión
            </p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "10px 0 0", lineHeight: 1.45 }}>
              {offline
                ? "Parece que estás sin internet. Revisa tu conexión y vuelve a intentar."
                : "Tu conexión está lenta o el servidor tardó en responder. Vuelve a intentar."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <button
                type="button"
                className="maqgo-btn-primary"
                onClick={() => setVerifyNonce((n) => n + 1)}
                style={{ width: "min(360px, 100%)" }}
              >
                Reintentar
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  border: "2px solid rgba(236,104,25,0.2)",
                  borderTopColor: "var(--maqgo-orange)",
                  borderRadius: "50%",
                  animation: "maqgo-spin 0.8s linear infinite",
                  opacity: 0.9,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
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
