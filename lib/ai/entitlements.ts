import "server-only";

// Shared server policy also runs in the supervised Node worker. This wrapper
// keeps the existing web import boundary and public API unchanged.
export * from "./entitlement-policy";
