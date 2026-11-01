// Every way a backend call can fail, as one type. Screens decide what to show from `kind`, and never from a status code or an exception's text.
export type BackendErrorKind =
  | "not-configured" // This build has no backend. Nothing was sent.
  | "offline" // Nobody answered.
  | "timeout" // Sent, with no answer in time. For a mutation the outcome is unknown.
  | "cancelled" // The caller walked away. Not a failure.
  | "signed-out" // The session is over.
  | "forbidden"
  | "not-found"
  | "conflict" // The server's state moved on. Reload before retrying.
  | "invalid" // The server refused what was sent.
  | "rate-limited"
  | "server"
  | "contract"; // The server answered something this client does not understand.

export class BackendError extends Error {
  constructor(readonly kind: BackendErrorKind, message: string, readonly detail: { status?: number; code?: string; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "BackendError";
  }
  /** True when trying the same request later could work with nothing changed. */
  get transient() { return ["offline", "timeout", "rate-limited", "server"].includes(this.kind); }
}

const SAY: Record<BackendErrorKind, string> = {
  "not-configured": "This build is not connected to Sylf yet.",
  offline: "You appear to be offline.",
  timeout: "Sylf took too long to answer.",
  cancelled: "Cancelled.",
  "signed-out": "Sign in to continue.",
  forbidden: "You don't have access to this.",
  "not-found": "This no longer exists.",
  conflict: "This changed somewhere else. Reload and try again.",
  invalid: "That didn't look right. Check it and try again.",
  "rate-limited": "Too many requests. Please wait a moment.",
  server: "Sylf had a problem. Try again shortly.",
  contract: "This version of the app can't read that. Check for an update.",
};

/** What a person should read. Server text appears only for refusals the server wrote for people, never for a 5xx. */
export const describeFailure = (error: BackendError) => (["invalid", "conflict", "rate-limited", "forbidden"].includes(error.kind) && error.message ? error.message : SAY[error.kind]);

const KIND_BY_STATUS: Record<number, BackendErrorKind> = { 400: "invalid", 401: "signed-out", 403: "forbidden", 404: "not-found", 409: "conflict", 410: "not-found", 413: "invalid", 422: "invalid", 429: "rate-limited" };

/** Turns a refused response into an error. `body` is whatever JSON came back, if any. */
export function errorFromResponse(status: number, body: unknown, retryAfter: string | null): BackendError {
  const value = (body ?? {}) as { error?: unknown; message?: unknown; code?: unknown; detail?: { message?: unknown; code?: unknown } };
  const text = [value.detail?.message, value.message, value.error].find(item => typeof item === "string") as string | undefined;
  const code = [value.code, value.detail?.code].find(item => typeof item === "string") as string | undefined;
  const seconds = Number(retryAfter);
  // Electron's host answers this when it could not reach the server. To the renderer that is what no network looks like.
  if (status === 503 && code === "backend_unreachable") return new BackendError("offline", SAY.offline, { status, code });
  // Some routes use 401 for a wrong password with a good session. Those are refusals, written for the person, and the session is fine.
  if (status === 401 && code !== "session_ended" && text && text !== "Unauthorized") return new BackendError("invalid", text, { status, code });
  const kind = KIND_BY_STATUS[status] ?? "server";
  return new BackendError(kind, status >= 500 ? SAY.server : text ?? SAY[kind], { status, code, ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: seconds * 1000 } : {}) });
}

/** Sorts out whatever a transport threw. Timeouts come from lib/api-transport, and a caller's abort is not a failure. */
export function errorFromThrown(error: unknown, signal: AbortSignal | undefined): BackendError {
  if (error instanceof BackendError) return error;
  if (signal?.aborted) return new BackendError("cancelled", SAY.cancelled);
  const message = error instanceof Error ? error.message : "";
  if (message === "Request timed out") return new BackendError("timeout", SAY.timeout);
  if ((error as { name?: string } | null)?.name === "AbortError") return new BackendError("timeout", SAY.timeout);
  return new BackendError("offline", SAY.offline);
}
