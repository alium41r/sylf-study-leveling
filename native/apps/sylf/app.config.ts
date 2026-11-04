import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";
import { withAndroidStyles } from "expo/config-plugins";

// Identifiers are provisional: the existing Capacitor client owns app.sylf.study, and whether Sylf Native
// replaces it (master plan open question C1) must be decided before the first store build.
// Every face is embedded at build time so themes switch instantly and offline, with no flash of fallback text.
const FONTS = readdirSync(join(__dirname, "../../packages/design-system/assets/fonts"))
  .filter((file) => file.endsWith(".ttf"))
  .map((file) => `../../packages/design-system/assets/fonts/${file}`);

const config: ExpoConfig = {
  name: "Sylf",
  slug: "sylf-native",
  version: "0.1.0",
  scheme: "sylf-native",
  orientation: "default",
  userInterfaceStyle: "automatic",
  // The secure store plugin keeps its values out of Android's Auto Backup, and asks for no biometric permission: nothing here uses one.
  // Audio keeps playing with the screen off, and asks for no microphone: nothing here records. Notifications are local only, for a phase ending.
  plugins: [
    ["expo-font", { fonts: FONTS }],
    ["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: false }],
    ["expo-audio", { enableBackgroundPlayback: true, microphonePermission: false, recordAudioAndroid: false }],
    ["expo-notifications", { defaultChannel: "phase" }],
  ],
  ios: {
    bundleIdentifier: "app.sylf.client",
    supportsTablet: true,
    // iPad multitasking (Split View, Slide Over, Stage Manager) requires not demanding full screen.
    requireFullScreen: false,
  },
  android: {
    package: "app.sylf.client",
  },
  web: {
    bundler: "metro",
    output: "single",
  },
};

// Android otherwise paints a band behind the gesture bar, which cuts the bottom edge off every Space.
export default withAndroidStyles(config, (next) => {
  const theme = next.modResults.resources.style?.find((style) => style.$.name === "AppTheme");
  theme?.item.push({ $: { name: "android:enforceNavigationBarContrast" }, _: "false" });
  return next;
});
