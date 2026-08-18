/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/acoustics/route";

describe("Acoustics API Endpoint (GET /api/acoustics)", () => {
  it("returns pure nature and ambient noise soundscapes with full metadata", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("tracks");
    expect(Array.isArray(data.tracks)).toBe(true);
    expect(data.tracks.length).toBeGreaterThanOrEqual(10);

    const firstTrack = data.tracks[0];
    expect(firstTrack).toHaveProperty("id");
    expect(firstTrack).toHaveProperty("title");
    expect(firstTrack).toHaveProperty("category");
    expect(firstTrack).toHaveProperty("audioUrl");
    expect(firstTrack).toHaveProperty("defaultVolume");

    // Verify strictly nature, ambient, and noise categories
    const categories = Array.from(new Set(data.tracks.map((t: any) => t.category)));
    expect(categories).toContain("NATURE");
    expect(categories).toContain("AMBIENT");
    expect(categories).toContain("NOISE");

    // Ensure all musical genres are purged
    expect(categories).not.toContain("LOFI");
    expect(categories).not.toContain("PIANO");
    expect(categories).not.toContain("BINAURAL");
  });

  it("includes Wind, Waves, Stream, Rain, Campfire, and White/Pink Noise soundscapes", async () => {
    const res = await GET();
    const data = await res.json();

    const titles = data.tracks.map((t: any) => t.title);
    expect(titles.some((title: string) => title.includes("Wind"))).toBe(true);
    expect(titles.some((title: string) => title.includes("Waves"))).toBe(true);
    expect(titles.some((title: string) => title.includes("Stream"))).toBe(true);
    expect(titles.some((title: string) => title.includes("Rain"))).toBe(true);
    expect(titles.some((title: string) => title.includes("Campfire"))).toBe(true);
    expect(titles.some((title: string) => title.includes("White Noise"))).toBe(true);
    expect(titles.some((title: string) => title.includes("Pink Noise"))).toBe(true);
  });
});
