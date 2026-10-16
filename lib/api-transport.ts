/**
 * ============================================================================
 * ApiTransport — Platform-neutral API URL resolution & request transport
 * ============================================================================
 * Default behavior (Web): Same-origin relative URLs (/api/...)
 * Mobile behavior: Configurable absolute URL (e.g. https://sylf.app/api/...)
 *
 * NOTE FOR PHASE 1A:
 * - No auth credentials / Bearer tokens are attached yet (Phase 1A rule).
 * - Web behavior remains 100% unchanged (relative paths by default).
 * ============================================================================
 */

export interface ApiTransportConfig {
  baseUrl: string;
  getAuthHeader?: () => Promise<string | null> | string | null;
}

let currentConfig: ApiTransportConfig = {
  baseUrl: "", // Web: relative same-origin by default
};

/** Configure the API transport (called during mobile app bootstrap). */
export function configureApiTransport(config: Partial<ApiTransportConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/** Retrieve the active API transport configuration. */
export function getApiTransportConfig(): ApiTransportConfig {
  return currentConfig;
}

/** Reset configuration to web default (useful for unit tests). */
export function resetApiTransport(): void {
  currentConfig = { baseUrl: "" };
}

/**
 * Resolves an API endpoint path into an absolute or relative URL
 * based on the active platform transport configuration.
 *
 * Examples:
 *   Web:    resolveApiUrl("/api/user/stats") -> "/api/user/stats"
 *   Mobile: resolveApiUrl("/api/user/stats") -> "https://sylf.app/api/user/stats"
 *   Direct: resolveApiUrl("https://foo.com/bar") -> "https://foo.com/bar"
 */
export function resolveApiUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const base = currentConfig.baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Standard fetch wrapper that resolves the URL through ApiTransport
 * and injects headers when configured.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(input);
  const headers = new Headers(init?.headers);
  if (currentConfig.getAuthHeader) {
    const auth = await currentConfig.getAuthHeader();
    if (auth && !headers.has("Authorization")) {
      headers.set("Authorization", auth);
    }
  }
  return fetch(url, { ...init, headers });
}

/** Bound connection AND body reads. A timeout is an uncertain acknowledgment;
 * callers with durable mutations must retry their original request identity. */
export async function fetchWithTimeout(request: typeof fetch, input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  return consumeResponseWithTimeout(request, input, init, timeoutMs, async response => {
    const body = await response.text();
    return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers });
  });
}

/** Keep cancellation/deadline active for the entire body, including streaming consumers. */
export async function consumeResponseWithTimeout<T>(request: typeof fetch, input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number, consume: (response: Response, signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init?.signal?.aborted) cancel();
  init?.signal?.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => { cancel(); reject(new Error("Request timed out")); }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await request(input, { ...init, signal: controller.signal });
      const result = await consume(response, controller.signal);
      controller.signal.throwIfAborted();
      return result;
    })()]);
  } finally {
    clearTimeout(timer!); init?.signal?.removeEventListener("abort", cancel);
  }
}
