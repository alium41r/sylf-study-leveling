// Android and iOS runtime. Capabilities combine React Native APIs with the @sylf/native-platform Expo module.
import * as ExpoCrypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Dimensions, PixelRatio, Platform } from "react-native";
import { formFactorFromScreen, type PlatformCapabilities } from "./capabilities";
import type { PlatformAdapters } from "./adapters/types";
import { toHex } from "./hex";
import { nativePreferences, readNativeDeviceInfo } from "./native-device";

export function detectCapabilities(): PlatformCapabilities {
  const screen = Dimensions.get("screen");
  const device = readNativeDeviceInfo();
  return {
    runtime: "native",
    os: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown",
    osVersion: String(Platform.Version),
    formFactor: formFactorFromScreen(Math.min(screen.width, screen.height)),
    input: { stylus: device?.stylus ?? "unknown", hover: device?.hover ?? "unknown", finePointer: false },
    display: { refreshRates: device?.refreshRates ?? [], scale: PixelRatio.get() },
    model: device?.model ?? "unknown",
  };
}

const SESSION_KEY = "sylf.native.session.v1";
// Off backups and off other devices. A value restored onto another device cannot be decrypted, and that read failure means signed out.
const SESSION_STORE = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function createAdapters(): PlatformAdapters {
  return {
    secureSession: {
      holder: "secure-store",
      read: () => SecureStore.getItemAsync(SESSION_KEY, SESSION_STORE).catch(() => null),
      write: (value) => SecureStore.setItemAsync(SESSION_KEY, value, SESSION_STORE),
      clear: () => SecureStore.deleteItemAsync(SESSION_KEY, SESSION_STORE),
    },
    crypto: {
      randomUUID: () => ExpoCrypto.randomUUID(),
      getRandomValues: (array) => ExpoCrypto.getRandomValues(array),
      sha256Hex: async (bytes) => toHex(await ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes as BufferSource)),
    },
    preferences: nativePreferences() ?? { getItem: () => null, setItem: () => undefined },
    storage: { backend: "unavailable" },
    pen: { sampleFormat: "sylf-ink/1" },
    pdf: { renderer: Platform.OS === "ios" ? "pdfkit" : "pdfrenderer" },
    audio: { backgroundPlayback: false },
    session: { backgroundSession: "unavailable" },
    files: { picker: false },
  };
}
