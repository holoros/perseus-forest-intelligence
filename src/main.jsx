import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource-variable/inter";
import "./styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Theme: an explicit choice (header toggle) wins; otherwise follow the OS setting.
// Storage can throw in private windows, so every access is guarded.
try {
  const t = window.localStorage.getItem("perseus-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) { /* no stored preference */ }

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
