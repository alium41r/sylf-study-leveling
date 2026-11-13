// Choosing files. This is the only place that names the pickers, so the rest of the app deals in `PickedFile` and nothing else. The system picker is the
// permission: it shows only what the person chooses, so no library or storage access is asked for. A cancelled pick is nothing, not an error.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { PickedFile } from "@sylf/backend";

const MIME_BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const mimeFor = (name: string, given?: string | null) => (given && given !== "application/octet-stream" ? given : MIME_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? given ?? "application/octet-stream");

/** One PDF or plain text file, or null if the person backed out. */
export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "text/plain"], copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, mimeType: mimeFor(asset.name, asset.mimeType), ...(asset.size !== undefined ? { size: asset.size } : {}), ...(asset.file ? { blob: asset.file } : {}) };
}

/** Up to `limit` images from the library, or an empty list if the person backed out. */
export async function pickImages(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: limit > 1, selectionLimit: limit, quality: 1, exif: false });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset, index) => {
    const name = asset.fileName ?? `image-${index + 1}.${(asset.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`;
    return { uri: asset.uri, name, mimeType: mimeFor(name, asset.mimeType), ...(asset.fileSize !== undefined ? { size: asset.fileSize } : {}), ...(asset.file ? { blob: asset.file } : {}) };
  });
}

/** Plays only the file the person chooses. Web returns a Blob URL, native copies it into the app cache. */
export async function pickAudioFile(): Promise<{ uri: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false, base64: false });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, name: asset.name } : null;
}
