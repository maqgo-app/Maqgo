import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/maqgo.css";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("App error:", error, info);
  }
  handleReload = () => {
    // Recarga forzada sin caché: evita "Failed to fetch dynamically imported module"
    // (ocurre cuando hay deploy nuevo y el navegador tiene chunks viejos cacheados)
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
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
          <button onClick={this.handleReload} style={{ padding: "14px 28px", background: "#EC6819", border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontWeight: 600 }} aria-label="Recargar la página">
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);
