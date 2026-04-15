import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LoginScreen from "./screens/LoginScreen";

// CLIENT
import ClientHome from "./screens/client/ClientHomeScreen";

// PROVIDER
import ProviderHome from "./screens/provider/ProviderHomeScreen";

import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Router>
      <Routes>

        {/* 🔓 PUBLIC */}
        <Route path="/login" element={<LoginScreen />} />

        {/* 🔒 CLIENT */}
        <Route
          path="/client/*"
          element={
            <ProtectedRoute>
              <ClientHome />
            </ProtectedRoute>
          }
        />

        {/* 🔒 PROVIDER */}
        <Route
          path="/provider/*"
          element={
            <ProtectedRoute>
              <ProviderHome />
            </ProtectedRoute>
          }
        />

        {/* DEFAULT */}
        <Route path="*" element={<LoginScreen />} />

      </Routes>
    </Router>
  );
}

export default App;
