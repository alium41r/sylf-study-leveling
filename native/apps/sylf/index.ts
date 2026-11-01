// Polyfills first: shared Sylf code expects crypto.getRandomValues/randomUUID, which Hermes lacks.
import "@sylf/platform/polyfills";
import { registerRootComponent } from "expo";

// A build with EXPO_PUBLIC_SYLF_R15=1 contains the bare memory probe and none of the app (see src/r15/R15Probe.tsx). The value is
// inlined at build time, so the branch not taken is left out of the bundle.
if (process.env.EXPO_PUBLIC_SYLF_R15 === "1") registerRootComponent(require("./src/r15/R15Probe").default);
else registerRootComponent(require("./src/App").default);
