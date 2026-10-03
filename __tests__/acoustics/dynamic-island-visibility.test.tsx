/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AcousticsDynamicIsland } from "@/app/components/AcousticsDynamicIsland";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/locker",
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock SettingsContext
vi.mock("@/app/components/SettingsContext", () => ({
  useSettings: () => ({ isOpen: false }),
}));

// Mutable mock state for contexts
let mockAcousticsState = {
  activeTrack: {
    id: "nature-1",
    title: "Forest Wind & Leaves",
    category: "NATURE",
    frequency: "Organic Wind",
  } as any,
  isPlaying: false,
  masterVolume: 75,
  layerVolumes: { rain: 0, cafe: 0, keyboard: 0, whitenoise: 0 },
  frequencyData: new Array(15).fill(25),
  togglePlay: vi.fn(),
  playNextTrack: vi.fn(),
  playPreviousTrack: vi.fn(),
  setMasterVolume: vi.fn(),
  setLayerVolume: vi.fn(),
};

let mockCustomAudioState = {
  activeTrackId: null as string | null,
  activeEntry: null as any,
  isPlaying: false,
  volume: 80,
  loop: false,
  duration: 180,
  togglePlay: vi.fn(),
  playNextTrack: vi.fn(),
  playPreviousTrack: vi.fn(),
  setVolume: vi.fn(),
  subscribeToTime: vi.fn(() => () => {}),
  seek: vi.fn(),
};

vi.mock("@/app/components/AcousticsContext", () => ({
  useAcoustics: () => mockAcousticsState,
}));

vi.mock("@/app/components/CustomAudioContext", () => ({
  useCustomAudio: () => mockCustomAudioState,
}));

describe("AcousticsDynamicIsland Visibility and Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcousticsState.isPlaying = false;
    mockAcousticsState.activeTrack = {
      id: "nature-1",
      title: "Forest Wind & Leaves",
      category: "NATURE",
      frequency: "Organic Wind",
    };
    mockCustomAudioState.activeTrackId = null;
    mockCustomAudioState.activeEntry = null;
    mockCustomAudioState.isPlaying = false;
  });

  it("is hidden when audio is not playing and no grace period is active", () => {
    mockAcousticsState.isPlaying = false;
    mockCustomAudioState.isPlaying = false;
    render(<AcousticsDynamicIsland />);
    expect(screen.queryByText("Forest Wind & Leaves")).toBeNull();
  });

  it("appears immediately when built-in nature soundscape starts playing", () => {
    mockAcousticsState.isPlaying = true;
    render(<AcousticsDynamicIsland />);
    expect(screen.getByText("Forest Wind & Leaves")).toBeDefined();
    expect(screen.getByText("NATURE")).toBeDefined();
  });

  it("appears immediately when custom imported audio starts playing", () => {
    mockAcousticsState.isPlaying = false;
    mockCustomAudioState.isPlaying = true;
    mockCustomAudioState.activeTrackId = "custom-1";
    mockCustomAudioState.activeEntry = {
      id: "custom-1",
      title: "My Custom Study Track",
      originalFilename: "study.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 5000000,
      duration: 200,
    };

    render(<AcousticsDynamicIsland />);
    expect(screen.getByText("My Custom Study Track")).toBeDefined();
    expect(screen.getByText("MPEG")).toBeDefined();
  });

  it("retains visibility gracefully when transitioned from playing to paused", () => {
    mockAcousticsState.isPlaying = true;
    const { rerender } = render(<AcousticsDynamicIsland />);
    expect(screen.getByText("Forest Wind & Leaves")).toBeDefined();

    // Now user pauses
    mockAcousticsState.isPlaying = false;
    rerender(<AcousticsDynamicIsland />);

    // Must still be visible during the 5s grace period!
    expect(screen.getByText("Forest Wind & Leaves")).toBeDefined();
  });
});
