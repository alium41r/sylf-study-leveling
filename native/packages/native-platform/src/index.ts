import { requireOptionalNativeModule } from "expo";

export interface NativeDeviceInfo {
  model: string;
  /** Android: an input device reports SOURCE_STYLUS. iOS: "unknown" (Apple Pencil pairing is not observable). */
  stylus: boolean | "unknown";
  hover: boolean | "unknown";
  refreshRates: number[];
  totalMemoryMb: number;
}

interface SylfNativePlatformModule {
  getDeviceInfo(): NativeDeviceInfo;
  getPreference(key: string): string | null;
  setPreference(key: string, value: string): void;
}

const nativeModule = () => requireOptionalNativeModule<SylfNativePlatformModule>("SylfNativePlatform");

/** Small synchronous key-value store (SharedPreferences / UserDefaults). Undefined without the native module. */
export function nativePreferences() {
  const module = nativeModule();
  return module ? { getItem: (key: string) => module.getPreference(key), setItem: (key: string, value: string) => module.setPreference(key, value) } : undefined;
}

/** Undefined when the native module is absent (web, Expo Go, tests); callers degrade to "unknown". */
export function readNativeDeviceInfo(): NativeDeviceInfo | undefined {
  const module = nativeModule();
  try { return module?.getDeviceInfo(); } catch { return undefined; }
}
