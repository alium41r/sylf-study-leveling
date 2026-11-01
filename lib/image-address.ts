/**
 * Image addresses a person can store and other people will load. https, an image embedded by web's editor, or a path on Sylf itself. Anything
 * else is refused, so a stored value can never be a script, or an unencrypted request to a stranger's server. Clients still decide what they load:
 * Sylf Native loads only approved hosts (ADR 0016).
 */
const MAX_URL = 2048;
/** Web's editor stores uploads as data URLs. Its own limit is about 4 MB of file, so this allows a little over that once encoded. */
const MAX_DATA_URL = 6_000_000;
const EMBEDDED = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function isSafeImageAddress(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const address = value.trim();
  if (address.startsWith("data:")) return address.length <= MAX_DATA_URL && EMBEDDED.test(address);
  if (address.length > MAX_URL) return false;
  if (address.startsWith("/") && !address.startsWith("//")) return true;
  try { return new URL(address).protocol === "https:"; } catch { return false; }
}

/** Null and an empty string clear an image, so both pass. */
export const isClearOrSafeImageAddress = (value: unknown) => value === null || value === undefined || value === "" || isSafeImageAddress(value);
