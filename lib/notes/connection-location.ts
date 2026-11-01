/** A library's origin is a storage boundary. Offer an explicit link rather than
 * navigating away from a tab that could hold unacknowledged local work. */
export function alternateNotesURL(
  value: unknown,
  currentLocation: string
): string | undefined {
  // Older brokers and isolated fixtures did not advertise the canonical URL.
  if (value === undefined || value === null) return undefined;
  let target: URL;
  const current = new URL(currentLocation);
  try {
    if (typeof value !== "string") throw new Error();
    target = new URL(value);
  } catch {
    throw new Error(
      "Notes could not verify its Sylf address. Please try again."
    );
  }
  const loopback = (url: URL) =>
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (target.protocol !== "https:" &&
      !(loopback(target) && loopback(current))) ||
    target.username ||
    target.password ||
    target.pathname !== "/notes" ||
    target.search ||
    target.hash
  )
    throw new Error(
      "Notes could not verify its Sylf address. Please try again."
    );
  if (target.origin === current.origin) return undefined;
  // Preserve stable resource references, never OAuth codes, state, or free text.
  for (const key of ["library", "document", "page"]) {
    const id = current.searchParams.get(key);
    if (id && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
      target.searchParams.set(key, id);
  }
  return target.href;
}

/** A fresh web deployment has a different IndexedDB origin. Native/hash shells
 * and origins holding local work must remain where they are. The caller proves
 * the device is empty and the broker has authorized this exact deployment. */
export function freshDeploymentNotesURL(
  value: unknown,
  currentLocation: string
): string | undefined {
  const current = new URL(currentLocation);
  if (
    current.protocol !== "https:" ||
    !current.hostname.endsWith(".vercel.app") ||
    current.hash.startsWith("#/")
  )
    return;
  return alternateNotesURL(value, currentLocation);
}
