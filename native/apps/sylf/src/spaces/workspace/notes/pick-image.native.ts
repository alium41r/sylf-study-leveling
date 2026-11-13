// Choosing a picture on Android and iOS: the system photo picker (no storage permission on Android 13 and later), compressed on
// the way in. Pictures over 3 MB after compression are refused, so one photo cannot make a note slow to open.
import * as ImagePicker from "expo-image-picker";

export interface PickedImage { url: string; name: string; width: number; height: number; bytes: Uint8Array; mediaType: string }

export async function pickImage(maxSide = 1600): Promise<PickedImage | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: maxSide <= 512 ? 0.5 : 0.7, base64: true, allowsMultipleSelection: false });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset?.base64) return null;
  if (asset.base64.length > 4_000_000) throw new Error("That picture is too large. Choose a smaller one.");
  const mediaType = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
  const bytes = Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0));
  return { url: `data:${mediaType};base64,${asset.base64}`, name: asset.fileName || "Picture", width: asset.width, height: asset.height, bytes, mediaType };
}
