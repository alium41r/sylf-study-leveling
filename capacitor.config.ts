import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.sylf.study",
  appName: "Sylf",
  webDir: "mobile/dist",
  server: {
    // Default secure local origin: Capacitor 8 serves local assets over https://localhost on Android
    // No remote server.url configured for production
    // No cleartext traffic enabled
    // No broad allowNavigation rules
    androidScheme: "https",
  },
};

export default config;
