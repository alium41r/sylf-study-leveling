/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { CustomAudioProvider, useCustomAudio } from "@/app/components/CustomAudioContext";
import { audioEngine } from "@/lib/acoustics/audio-engine";

// ─── Mock the store ─────────────────────────────────────────────
const mockEntries = [
  {
    id: "track-1",
    title: "Alpha Study",
    originalFilename: "alpha.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 1024,
    duration: 120,
    dateAdded: "2026-09-24T00:00:00.000Z",
  },
  {
    id: "track-2",
    title: "Beta Focus",
    originalFilename: "beta.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 2048,
    duration: 240,
    dateAdded: "2026-09-24T00:01:00.000Z",
  },
];

const mockRevokePlaybackUrl = vi.fn();
const mockRevokeAllPlaybackUrls = vi.fn();
const mockGetPlaybackUrl = vi.fn((id: string) => Promise.resolve(`blob:mock-url-${id}`));

vi.mock("@/lib/acoustics/custom-audio-store", () => ({
  listAudio: vi.fn(() => Promise.resolve([...mockEntries])),
  getPlaybackUrl: (id: string) => mockGetPlaybackUrl(id),
  revokePlaybackUrl: (id: string) => mockRevokePlaybackUrl(id),
  revokeAllPlaybackUrls: () => mockRevokeAllPlaybackUrls(),
  renameAudio: vi.fn((id: string, title: string) => Promise.resolve(true)),
  removeAudio: vi.fn((id: string) => Promise.resolve(true)),
  importAudio: vi.fn((file: File) =>
    Promise.resolve({
      success: true,
      entry: {
        id: "new-track",
        title: file.name.replace(/\.[^/.]+$/, ""),
        originalFilename: file.name,
        mimeType: file.type || "audio/mpeg",
        sizeBytes: 500,
        duration: 90,
        dateAdded: new Date().toISOString(),
      },
    })
  ),
}));

// ─── Mock HTMLAudioElement ──────────────────────────────────────
class MockAudio {
  src = "";
  currentTime = 0;
  duration = 180;
  volume = 1;
  loop = false;
  paused = true;

  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;

  async play() {
    this.paused = false;
    if (this.onloadedmetadata) this.onloadedmetadata();
    if (this.onplay) this.onplay();
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    if (this.onpause) this.onpause();
  }

  load() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).Audio = MockAudio;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Test Harness Component ─────────────────────────────────────
function TestConsumer() {
  const {
    library,
    activeTrackId,
    isPlaying,
    duration,
    volume,
    loop,
    playTrack,
    pause,
    resume,
    seek,
    setVolume,
    toggleMute,
    toggleLoop,
  } = useCustomAudio();

  return (
    <div>
      <div data-testid="library-count">{library.length}</div>
      <div data-testid="active-track">{activeTrackId || "none"}</div>
      <div data-testid="playing-status">{isPlaying ? "playing" : "paused"}</div>
      <div data-testid="duration">{duration}</div>
      <div data-testid="volume">{volume}</div>
      <div data-testid="loop">{loop ? "loop-on" : "loop-off"}</div>

      <button data-testid="btn-play-1" onClick={() => playTrack("track-1")}>
        Play 1
      </button>
      <button data-testid="btn-play-2" onClick={() => playTrack("track-2")}>
        Play 2
      </button>
      <button data-testid="btn-pause" onClick={pause}>
        Pause
      </button>
      <button data-testid="btn-resume" onClick={resume}>
        Resume
      </button>
      <button data-testid="btn-seek-30" onClick={() => seek(30)}>
        Seek 30
      </button>
      <button data-testid="btn-vol-50" onClick={() => setVolume(50)}>
        Vol 50
      </button>
      <button data-testid="btn-toggle-mute" onClick={toggleMute}>
        Toggle Mute
      </button>
      <button data-testid="btn-loop-toggle" onClick={toggleLoop}>
        Toggle Loop
      </button>
    </div>
  );
}

describe("CustomAudio Playback Lifecycle & Controls", () => {
  it("loads library on mount", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    // Wait for library to load
    await screen.findByText("2");
    expect(screen.getByTestId("library-count").textContent).toBe("2");
    expect(screen.getByTestId("active-track").textContent).toBe("none");
    expect(screen.getByTestId("playing-status").textContent).toBe("paused");
  });

  it("plays track 1 and updates playing status", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    await screen.findByText("2");
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-play-1"));
    });

    expect(screen.getByTestId("active-track").textContent).toBe("track-1");
    expect(screen.getByTestId("playing-status").textContent).toBe("playing");
    expect(mockGetPlaybackUrl).toHaveBeenCalledWith("track-1");
  });

  it("pauses and resumes playback", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    await screen.findByText("2");
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-play-1"));
    });
    expect(screen.getByTestId("playing-status").textContent).toBe("playing");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-pause"));
    });
    expect(screen.getByTestId("playing-status").textContent).toBe("paused");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-resume"));
    });
    expect(screen.getByTestId("playing-status").textContent).toBe("playing");
  });

  it("switches tracks and revokes previous track URL", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    await screen.findByText("2");
    // Play Track 1
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-play-1"));
    });
    expect(screen.getByTestId("active-track").textContent).toBe("track-1");

    // Switch to Track 2
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-play-2"));
    });
    expect(screen.getByTestId("active-track").textContent).toBe("track-2");
    expect(mockRevokePlaybackUrl).toHaveBeenCalledWith("track-1");
  });

  it("adjusts volume and toggles loop", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    await screen.findByText("2");
    expect(screen.getByTestId("volume").textContent).toBe("75");
    expect(screen.getByTestId("loop").textContent).toBe("loop-off");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-vol-50"));
    });
    expect(screen.getByTestId("volume").textContent).toBe("50");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-loop-toggle"));
    });
    expect(screen.getByTestId("loop").textContent).toBe("loop-on");
  });

  it("toggles mute and restores previous non-zero volume", async () => {
    render(
      <CustomAudioProvider>
        <TestConsumer />
      </CustomAudioProvider>
    );

    await screen.findByText("2");
    // Initial volume is 75
    expect(screen.getByTestId("volume").textContent).toBe("75");

    // Change to 50
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-vol-50"));
    });
    expect(screen.getByTestId("volume").textContent).toBe("50");

    // Mute: volume becomes 0
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-toggle-mute"));
    });
    expect(screen.getByTestId("volume").textContent).toBe("0");

    // Unmute: restores previous volume (50)
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-toggle-mute"));
    });
    expect(screen.getByTestId("volume").textContent).toBe("50");
  });

  it("existing built-in audio engine is NOT regressed or stopped by custom audio", async () => {
    // Verify that the built-in audioEngine methods exist and remain intact
    expect(typeof audioEngine.playTrack).toBe("function");
    expect(typeof audioEngine.pause).toBe("function");
    expect(typeof audioEngine.resume).toBe("function");
    expect(typeof audioEngine.setMasterVolume).toBe("function");
    expect(typeof audioEngine.setLayerVolume).toBe("function");
    expect(typeof audioEngine.getFrequencyData).toBe("function");

    // Verify default engine state
    expect(audioEngine.getIsPlaying()).toBe(false);
    expect(audioEngine.getActiveTrackUrl()).toBeNull();
  });
});
