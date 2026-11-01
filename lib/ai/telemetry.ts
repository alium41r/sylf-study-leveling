import "server-only";

// Next.js boundary; the ordinary Node worker shares this exact runtime state.
export * from "./telemetry-runtime";
