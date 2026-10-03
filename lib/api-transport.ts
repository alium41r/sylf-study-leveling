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
