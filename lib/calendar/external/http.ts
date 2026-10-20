import "server-only";
import { CalendarError } from "../personal-service";
export class ProviderError extends CalendarError {
  constructor(
    public providerStatus: number,
    public retrySeconds = 60
  ) {
    super(
      providerStatus === 401 || providerStatus === 403
        ? "Calendar access expired or was denied. Reconnect or check calendar permissions."
        : providerStatus === 409 || providerStatus === 412
          ? "The provider event changed. Refresh it before trying again."
          : "The calendar provider is unavailable. Sync will retry automatically.",
      providerStatus === 409 || providerStatus === 412
        ? 409
        : providerStatus === 403
          ? 403
          : [400, 404, 422].includes(providerStatus)
            ? 422
            : 503
    );
  }
}
export async function limitedJSON(
  response: Response,
  maxBytes = 3_000_000
): Promise<Record<string, unknown>> {
  if (Number(response.headers.get("content-length") || 0) > maxBytes)
    throw new CalendarError(
      "Provider response is too large. Use a smaller calendar window.",
      422
    );
  const reader = response.body?.getReader();
  if (!reader) return {};
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes)
        throw new CalendarError("Provider response is too large.", 422);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function providerRequest(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  const u = new URL(url);
  if (
    !["www.googleapis.com", "graph.microsoft.com"].includes(u.hostname) ||
    u.protocol !== "https:" ||
    u.username ||
    u.password
  )
    throw new CalendarError("Unsafe calendar provider URL.", 400);
  if (
    u.hostname === "graph.microsoft.com" &&
    !u.pathname.startsWith("/v1.0/me/") &&
    !/^\/v1\.0\/subscriptions(?:\/[a-zA-Z0-9-]+)?$/.test(u.pathname)
  )
    throw new CalendarError("Unsupported calendar resource.", 400);
  const response = await fetch(u, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer:
        'outlook.timezone="UTC", IdType="ImmutableId", odata.maxpagesize=100',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const seconds = retry
      ? Number.isFinite(Number(retry))
        ? Number(retry)
        : (Date.parse(retry) - Date.now()) / 1000
      : 60;
    let status = response.status;
    if (status === 403 && u.hostname === "www.googleapis.com")
      try {
        const error = await limitedJSON(response, 100000);
        if (
          JSON.stringify(error).match(
            /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/
          )
        )
          status = 429;
      } catch {
        /* Denied permissions remain terminal for writes. */
      }
    throw new ProviderError(
      status,
      Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, seconds) : 60
    );
  }
  return response.status === 204 ? {} : limitedJSON(response);
}
