// Turns whatever a backend call threw into a sentence. Typed through `kind` rather than a class, because @sylf/backend stays behind import() and
// this file must not load it. The words themselves come from the server for a refusal written for people, and from here for anything else.
import type { BackendError } from "@sylf/backend";

const SAY: Record<string, string> = {
  offline: "Sylf can't be reached right now. Check your connection and try again.",
  timeout: "Sylf took too long to answer. Try again.",
  server: "Sylf had a problem. Try again shortly.",
  contract: "This version of the app can't read that. Check for an update.",
  "signed-out": "Sign in to continue.",
  "not-found": "That no longer exists.",
  cancelled: "Cancelled.",
};

export function describeFailureText(error: unknown) {
  const failure = error as Partial<BackendError> | null;
  const kind = failure?.kind ?? "server";
  return SAY[kind] ?? (failure?.message || SAY.server);
}
