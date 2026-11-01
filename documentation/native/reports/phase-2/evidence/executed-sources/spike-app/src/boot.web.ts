import { registerRootComponent } from "expo";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
export function start() {
  const t0 = performance.now();
  LoadSkiaWeb({ locateFile: () => "/canvaskit.wasm" }).then(async () => {
    (globalThis as any).__canvaskitMs = performance.now() - t0;
    const { default: App } = await import("../App");
    registerRootComponent(App);
  });
}
