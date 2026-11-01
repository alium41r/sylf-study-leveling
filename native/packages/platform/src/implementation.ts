// Fallback for runtimes without a platform-specific file (Node tests). Metro selects
// implementation.native.ts on Android/iOS and implementation.web.ts for the desktop/web build.
import type { PlatformCapabilities } from "./capabilities";
import type { PlatformAdapters } from "./adapters/types";
import { PlatformNotImplementedError } from "./adapters/types";

export function detectCapabilities(): PlatformCapabilities {
  throw new PlatformNotImplementedError("Capability detection for this runtime", "no supported runtime");
}

export function createAdapters(): PlatformAdapters {
  throw new PlatformNotImplementedError("Platform adapters for this runtime", "no supported runtime");
}
