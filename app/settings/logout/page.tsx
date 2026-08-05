"use client";

import { useAuth } from "../../components/AuthProvider";
import { useEffect } from "react";

/**
 * Logout page — immediately logs the user out and redirects to the landing page.
 * This page exists as the settings route for the "Logout" tile, but its only
 * function is performing the logout action.
 */
export default function LogoutSettingsPage() {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ color: "var(--text-muted)" }}
    >
      <p style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        Logging out...
      </p>
    </div>
  );
}
