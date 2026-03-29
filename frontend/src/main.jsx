import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./styles/maqgo.css";
import App from "./App.jsx";
import { validateMaqgoEnvAtStartup } from "./runtime/validateMaqgoEnv.js";

validateMaqgoEnvAtStartup();

/**
 * Canónico producción: forzar https + www (evita sesiones/cookies separadas entre apex y www).
 * No aplica en localhost ni IPs de desarrollo.
 */
(function enforceCanonicalHost() {
  if (typeof window === "undefined") return;
  const host = String(window.location.hostname || "").toLowerCase();
  const isProdFlag = import.meta.env.VITE_IS_PRODUCTION === "true";
  const isCanonicalHost = host === "www.maqgo.cl";
  const isApexHost = host === "maqgo.cl";
  if (!isProdFlag || (!isCanonicalHost && !isApexHost)) return;

  const mustUseHttps = window.location.protocol !== "https:";
  const mustUseWww = isApexHost;
  if (!mustUseHttps && !mustUseWww) return;

  const target = `https://www.maqgo.cl${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
})();

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App error:", error, info);
    const message = error?.message || String(error);
    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(message);
    if (isChunkError) {
      const reloadKey = "maqgo_chunk_reload_once";
      const alreadyReloaded = sessionStorage.getItem(reloadKey) === "1";
      if (!alreadyReloaded) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      } else {
        // Evita quedar bloqueado en un loop si persiste el error
        sessionStorage.removeItem(reloadKey);
      }
    }
  }
  handleReload = () => {
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
  };
  handleVolver = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const message = err?.message || String(err);
      const isChunkError = /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(message);
      return (
        <div style={{ padding: 24, background: "var(--maqgo-bg)", minHeight: "100vh", color: "#fff", fontFamily: "sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} role="alert">
          <h1 style={{ color: "#EC6819", marginBottom: 12 }}>Algo salió mal</h1>
          <p style={{ color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
            {isChunkError ? "La app se actualizó. Recarga la página para obtener la versión más reciente." : "Hubo un error inesperado. Intenta recargar la página."}
          </p>
          {message && !isChunkError && <pre style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", maxWidth: "100%", overflow: "auto", marginBottom: 24 }}>{message}</pre>}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={this.handleVolver} style={{ padding: "14px 28px", background: "transparent", border: "2px solid #EC6819", borderRadius: 12, color: "#EC6819", cursor: "pointer", fontWeight: 600 }} aria-label="Volver atrás">
              Volver
            </button>
            <button onClick={this.handleReload} style={{ padding: "14px 28px", background: "#EC6819", border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontWeight: 600 }} aria-label="Recargar la página">
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** ErrorBoundary que se resetea al cambiar de ruta: permite volver atrás sin quedar atrapado */
function AppWithErrorBoundary() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <App />
    </ErrorBoundary>
  );
}
export { AppWithErrorBoundary };

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AppWithErrorBoundary />
  </BrowserRouter>
);
