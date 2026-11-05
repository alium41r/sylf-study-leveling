// Hermes has no crypto.subtle; expo-crypto hashes natively.
import * as Crypto from "expo-crypto";

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
