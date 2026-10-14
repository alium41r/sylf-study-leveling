/**
 * ============================================================================
 * Sylf Mobile Platform Entry — Phase 1D-A Canonical Shell
 * ============================================================================
 * Connects the Android/Capacitor runtime to the canonical shared Sylf application
 * shell architecture:
 *   • NavigationProvider (hash-based mobile router shimming next/navigation)
 *   • ThemeProvider (canonical theme tokens)
 *   • AuthProvider (cookie session; fixture only in explicitly enabled mock mode)
 *   • GlobalSystemWrapper (canonical system provider stack + background wallpaper)
 *   • SylfAppShell (canonical layout container with SidebarWrapper & safe-area insets)
 *   • MobileRouteOutlet (canonical route resolution and placeholders)
 * ============================================================================
 */

import React from "react";
import { NavigationProvider } from "./adapters/navigation/NavigationContext";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { AuthProvider } from "@/app/components/AuthProvider";
import { GlobalSystemWrapper } from "@/app/components/GlobalSystemWrapper";
import { SylfAppShell } from "@/app/components/SylfAppShell";
import { MOCK_STUDENT_USER, isMockApiInterceptionActive } from "./adapters/api/mock-api";
import { MobileRouteOutlet } from "./components/MobileRouteOutlet";

export default function MobileApp() {
  return (
    <NavigationProvider initialPath="/dashboard">
      <ThemeProvider>
        <AuthProvider initialUser={isMockApiInterceptionActive() ? MOCK_STUDENT_USER : undefined}>
          <GlobalSystemWrapper>
            <SylfAppShell>
              <MobileRouteOutlet />
            </SylfAppShell>
          </GlobalSystemWrapper>
        </AuthProvider>
      </ThemeProvider>
    </NavigationProvider>
  );
}
