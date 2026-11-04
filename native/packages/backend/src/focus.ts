// Focus's reads: the background catalog, which is public, and the person's own background preference, which lives on the account so every client
// shows the same one. Uploading a background of one's own stays on the web for now.
import { z } from "zod";
import type { BackendClient } from "./client";

const backgroundSchema = z.object({ id: z.number().int(), name: z.string(), publicUrl: z.string(), focalX: z.number().nullable().optional(), focalY: z.number().nullable().optional(), timerPosition: z.string().optional(), width: z.number().optional(), height: z.number().optional() }).loose();
export const backgroundCatalogSchema = z.object({ categories: z.array(z.object({ id: z.number().int(), slug: z.string(), name: z.string(), backgrounds: z.array(backgroundSchema) }).loose()) });
export type FocusBackground = z.infer<typeof backgroundSchema>;
export type BackgroundCatalog = z.infer<typeof backgroundCatalogSchema>;
export const backgroundPreferenceSchema = z.object({ source: z.string().optional(), backgroundId: z.number().int().nullable().optional(), version: z.number().optional() }).loose();
export type BackgroundPreference = z.infer<typeof backgroundPreferenceSchema>;

export function createFocusReads(client: BackendClient) {
  return {
    backgrounds: (signal: AbortSignal) => client.get("/api/focus-backgrounds", backgroundCatalogSchema, { signal }),
    backgroundPreference: (signal: AbortSignal) => client.get("/api/focus-backgrounds/preference", backgroundPreferenceSchema, { signal }),
    /** Null is Sylf's own plain ground. */
    chooseBackground: (backgroundId: number | null) => client.send("PATCH", "/api/focus-backgrounds/preference", { body: { source: backgroundId === null ? "classic" : "official", backgroundId } }),
  };
}
