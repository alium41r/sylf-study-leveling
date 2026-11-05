import { requireOptionalNativeModule } from "expo";
export * from "./ink-view";

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
  pdfHas?(key: string): Promise<boolean>;
  pdfPrepare?(key: string, bytes: Uint8Array): Promise<{ width: number; height: number }[]>;
  pdfPages?(key: string): Promise<{ width: number; height: number }[]>;
  pdfRender?(key: string, index: number, width: number): Promise<string>;
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

/** Android's PdfRenderer behind the module (Phase 14). Undefined where the module or its PDF functions are absent (iOS today, web, tests). */
export function nativePdf() {
  const module = nativeModule();
  if (!module?.pdfPrepare || !module.pdfRender || !module.pdfPages || !module.pdfHas) return undefined;
  return { has: module.pdfHas.bind(module), prepare: module.pdfPrepare.bind(module), pages: module.pdfPages.bind(module), render: module.pdfRender.bind(module) };
}
