// Choosing a picture on the web and desktop. It is scaled to at most 1,600 points on its long side and stored as JPEG (PNG when
// it has transparency), so a page full of photos stays light. Returns the picture's bytes too, for a page background.
import * as DocumentPicker from "expo-document-picker";

export interface PickedImage { url: string; name: string; width: number; height: number; bytes: Uint8Array; mediaType: string }

export async function pickImage(maxSide = 1600): Promise<PickedImage | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: false, copyToCacheDirectory: true });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const blob = (asset as { file?: Blob }).file ?? (await (await fetch(asset.uri)).blob());
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const mediaType = blob.type === "image/png" ? "image/png" : "image/jpeg";
  const url = canvas.toDataURL(mediaType, 0.86);
  const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
  return { url, name: asset.name || "Picture", width: canvas.width, height: canvas.height, bytes, mediaType };
}
