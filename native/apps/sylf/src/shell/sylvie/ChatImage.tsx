// A picture kept with a chat message. Its URL needs the signed-in session and the app never holds the token, so it is fetched through the backend client,
// which signs the request (and on Electron goes through the host's proxy), and drawn from the bytes. Kept small and in memory only: nothing is written
// to disk, and the cache is dropped with the account.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Text, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../backend";

const CACHE = new Map<string, string>();
const CACHE_LIMIT = 24;

const toDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export function ChatImage({ path, name, size = 120 }: { path: string; name?: string; size?: number }) {
  const { color, shape } = useTheme();
  const backend = useLiveBackend();
  const [uri, setUri] = useState<string | null>(CACHE.get(path) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!backend || uri) return;
    let alive = true;
    backend.client.fetch(path).then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      const next = await toDataUri(await response.blob());
      if (CACHE.size >= CACHE_LIMIT) CACHE.delete(CACHE.keys().next().value as string);
      CACHE.set(path, next);
      if (alive) setUri(next);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [backend, path, uri]);
  const box = { width: size, height: size, borderRadius: shape.radius.sm, overflow: "hidden" as const, backgroundColor: color.selected, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={box} accessible accessibilityRole="image" accessibilityLabel={name ? `Image: ${name}` : "Attached image"}>
      {uri ? <Image source={{ uri }} contentFit="cover" style={{ width: size, height: size }} accessible={false} /> : <Text variant="caption" tone="soft" align="center">{failed ? "Couldn't load" : ""}</Text>}
    </View>
  );
}
