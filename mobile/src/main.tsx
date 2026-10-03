import React from "react";
import ReactDOM from "react-dom/client";
import MobileApp from "./MobileApp";
import "@/app/globals.css";
import { configureApiTransport } from "@/lib/api-transport";
import { setupMockApiInterception } from "./adapters/api/mock-api";

// Configure ApiTransport for the mobile client
configureApiTransport({
  baseUrl: (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || "",
});

// Mark runtime as mobile client platform (fail-closed default)
if (typeof window !== "undefined") {
  (window as unknown as { __SYLF_MOBILE_PLATFORM__?: boolean }).__SYLF_MOBILE_PLATFORM__ = true;
  (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = false;
}

// If running in development or standalone demo mode, enable mock API fallback
setupMockApiInterception();

// Apply initial dark mode attribute to document root
try {
  document.documentElement.setAttribute("data-mode", "dark");
  document.documentElement.classList.add("dark");
  document.documentElement.setAttribute("data-app-background", "void");
} catch {
  // SSR or non-DOM
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MobileApp />
    </React.StrictMode>
  );
}
