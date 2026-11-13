import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine, type Playback, type Player } from "./engine";

const rain = { id: "rain", title: "Rain", url: "/audio/rain.wav" };
const wind = { id: "wind", title: "Wind", url: "/audio/wind.ogg" };
const player = () => ({ play: vi.fn(), pause: vi.fn(), setVolume: vi.fn(), dispose: vi.fn() });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

afterEach(() => vi.useRealTimers());

describe("the shared audio player", () => {
  it("waits for confirmation, reflects a decode error, and retries with a fresh player", () => {
    const ready = player();
    const retry = player();
    const updates: ((status: Playback) => void)[] = [];
    const factory = vi.fn((_url: string, report: (status: Playback) => void) => { updates.push(report); return updates.length === 1 ? ready : retry; });
    const engine = createAudioEngine(factory);
    engine.play(rain);
    expect(engine.state().status).toBe("loading");
    expect(ready.play).toHaveBeenCalledOnce();
    updates[0]("failed");
    expect(engine.state()).toMatchObject({ track: rain, status: "failed" });
    expect(ready.dispose).toHaveBeenCalledOnce();
    engine.toggle();
    updates[1]("playing");
    expect(engine.state().status).toBe("playing");
    engine.setVolume(0.3);
    expect(retry.setVolume).toHaveBeenLastCalledWith(0.3);
    engine.toggle();
    expect(engine.state().status).toBe("paused");
    engine.toggle();
    expect(retry.play).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  it("disposes a late native player after another sound is chosen", async () => {
    const stale = deferred<Player>();
    const ready = player();
    const engine = createAudioEngine((url, report) => url === rain.url ? stale.promise : { ...ready, play: () => report("playing") });
    engine.play(rain);
    engine.play(wind);
    const late = player();
    stale.resolve(late);
    await stale.promise;
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(late.play).not.toHaveBeenCalled();
    expect(engine.state()).toMatchObject({ track: wind, status: "playing" });
    engine.stop();
  });

  it("times out stalled playback and releases a picked file once when the account leaves", () => {
    vi.useFakeTimers();
    const media = player();
    const release = vi.fn();
    const engine = createAudioEngine(() => media);
    engine.play({ ...rain, url: "blob:file", release });
    vi.advanceTimersByTime(15_000);
    expect(engine.state().status).toBe("failed");
    expect(media.dispose).toHaveBeenCalledOnce();
    engine.stop();
    engine.stop();
    expect(engine.state()).toMatchObject({ status: "idle", track: null });
    expect(release).toHaveBeenCalledOnce();
  });
});
