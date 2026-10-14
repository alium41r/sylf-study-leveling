import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), acquire: vi.fn(), primary: { current: true } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: 7 }, refreshStats: vi.fn() }) }));
vi.mock("@/app/components/AcousticsContext", () => ({ AcousticsProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/app/focus/hooks/useFocusBackground", () => ({ useFocusBackground: () => ({ isClassic: true }) }));
vi.mock("@/app/focus/hooks/useFocusEyeComfort", () => ({ useFocusEyeComfort: () => ({}) }));
vi.mock("@/app/focus/hooks/useScreenWakeLock", () => ({ useScreenWakeLock: () => ({}) }));
vi.mock("@/app/focus/hooks/useTimerLeadership", () => ({ useTimerLeadership: () => ({ isPrimary: mocks.primary.current,
  isPrimaryRef: mocks.primary, acquireLeadership: mocks.acquire, releaseLeadership: vi.fn() }) }));
vi.mock("@/app/focus/components/FocusToolsContext", () => ({ FocusToolsProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/app/focus/components/FocusToolsDock", () => ({ default: () => null }));
vi.mock("@/app/focus/components/FocusToolWindow", () => ({ default: () => null }));
vi.mock("@/app/focus/components/FocusBackgroundRenderer", () => ({ FocusBackgroundRenderer: () => null }));
vi.mock("@/app/focus/components/FocusBackgroundPicker", () => ({ default: () => null }));
vi.mock("@/app/focus/components/FocusTimerLayoutRouter", () => ({ FocusTimerLayoutRouter: (props: {
  elapsedSeconds: number; todayElapsedSeconds: number; initialTotalSeconds: number; isPaused: boolean; onEndSession: () => void; onTogglePause: () => void; endError: string | null;
}) => <><span data-testid="elapsed">{props.elapsedSeconds}</span><span data-testid="today">{props.todayElapsedSeconds + props.initialTotalSeconds}</span><span>{props.isPaused ? "paused" : "running"}</span>
  <button onClick={props.onEndSession}>End</button><button onClick={props.onTogglePause}>Pause</button><span>{props.endError}</span></> }));
import { FocusScreen } from "@/app/focus/components/FocusScreen";
import { getTimerSync } from "@/lib/timer-sync";

const cacheKey = "runningTimerState_general_none_7";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T09:00:00.000Z")); localStorage.clear(); sessionStorage.clear();
  mocks.replace.mockReset(); mocks.acquire.mockReset().mockResolvedValue(true); mocks.primary.current = true;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
});
afterEach(() => { cleanup(); getTimerSync(7).stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mode() { localStorage.setItem("study_mode_config", JSON.stringify({ modes: [{ id: "freeflow", name: "Free Flow", isActive: true, settings: [] }] })); }
describe("focus lifecycle durability", () => {
  it("ends immediately with exact click-time duration while every network request hangs", async () => {
    mode(); render(<FocusScreen />); await act(async () => { vi.advanceTimersByTime(15_750); });
    const end = screen.getByText("End"); fireEvent.click(end); fireEvent.click(end);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/timer");
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(getTimerSync(7).status().pending).toBe(1);
    const opKey = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).find(key => key.endsWith("op:END"))!;
    expect(JSON.parse(localStorage.getItem(opKey)!)).toMatchObject({ focus: 15, breaks: 0 });
    expect(localStorage.getItem(cacheKey)).toBeNull();
    await act(async () => { window.dispatchEvent(new Event("pagehide")); vi.advanceTimersByTime(2000); });
    expect(localStorage.getItem(cacheKey)).toBeNull();
  });
  it("restores an existing snapshot even with a saved study mode, without doubling elapsed time", async () => {
    mode(); localStorage.setItem(cacheKey, JSON.stringify({ v: 2, cacheVersion: 3, ownerId: 7,
      focusMs: 20_000, breakMs: 0, runningSinceMs: Date.now() - 10_000, isPaused: false, phase: "focus", remainingMs: null, timestamp: Date.now() }));
    render(<FocusScreen />); expect(screen.getByTestId("elapsed")).toHaveTextContent("30");
    await act(async () => { vi.advanceTimersByTime(1000); });
    const persisted = JSON.parse(localStorage.getItem(cacheKey)!);
    expect(persisted.focusMs).toBe(20_000);
    cleanup(); render(<FocusScreen />); expect(screen.getByTestId("elapsed")).toHaveTextContent("31");
  });
  it("a mirror can end without waiting for the primary tab's Web Lock", () => {
    mode(); mocks.primary.current = false; mocks.acquire.mockImplementation(() => new Promise<boolean>(() => {}));
    render(<FocusScreen />); fireEvent.click(screen.getByText("End"));
    expect(mocks.replace).toHaveBeenCalledWith("/timer"); expect(mocks.acquire).not.toHaveBeenCalled();
  });
  it("accounts for several countdown phases crossed during suspension before ending", async () => {
    localStorage.setItem("study_mode_config", JSON.stringify({ modes: [{ id: "pomodoro", name: "Pomodoro", isActive: true,
      settings: [{ key: "focusDuration", value: 1 }, { key: "shortBreak", value: 1 }, { key: "longBreak", value: 1 },
        { key: "autoStartFocus", value: true }, { key: "autoStartBreaks", value: true }, { key: "endChime", value: false }] }] }));
    render(<FocusScreen />);
    vi.setSystemTime(new Date("2026-10-14T09:16:40.000Z"));
    fireEvent.click(screen.getByText("End"));
    const opKey = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).find(key => key.endsWith("op:END"))!;
    expect(JSON.parse(localStorage.getItem(opKey)!)).toMatchObject({ focus: 520, breaks: 480 });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/timer");
  });
  it("keeps the original paused cache while migrating an older timer identity", () => {
    mode(); localStorage.setItem("runningTimerState_general_none", JSON.stringify({ v: 2, ownerId: 7, sessionId: 42,
      focusMs: 30_000, breakMs: 0, runningSinceMs: null, isPaused: true, phase: "focus", remainingMs: null, timestamp: Date.now() }));
    render(<FocusScreen />); expect(screen.getByTestId("elapsed")).toHaveTextContent("30");
    fireEvent.click(screen.getByText("End"));
    const opKey = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).find(key => key.endsWith("op:END"))!;
    expect(JSON.parse(localStorage.getItem(opKey)!)).toMatchObject({ focus: 30 });
  });
  it("pauses and retains the cache when the durable END write fails", () => {
    mode(); render(<FocusScreen />);
    const original = localStorage.setItem.bind(localStorage);
    const failure = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => { if (key.endsWith("op:END")) throw new Error("full"); original(key, value); });
    fireEvent.click(screen.getByText("End")); expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText("paused")).toBeInTheDocument(); expect(localStorage.getItem(cacheKey)).not.toBeNull();
    failure.mockRestore(); fireEvent.click(screen.getByText("End")); expect(mocks.replace).toHaveBeenCalledWith("/timer");
  });
});

it("keeps an overnight timer in its accepted day and refreshes daily baselines on reconnect", async () => {
  mode(); localStorage.setItem(cacheKey, JSON.stringify({ v: 2, cacheVersion: 3, ownerId: 7,
    startedAt: "2026-10-13T23:00:00.000Z", attributedDay: "2026-10-13", focusMs: 60_000, breakMs: 0,
    runningSinceMs: null, isPaused: true, phase: "focus", remainingMs: null, timestamp: Date.now() }));
  let today = 100;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("/stats")
    ? { id: 7, todayStudySeconds: today, activeSessionId: null, activeSessionStudySeconds: 0 } : []))));
  render(<FocusScreen />); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByTestId("elapsed")).toHaveTextContent("60"); expect(screen.getByTestId("today")).toHaveTextContent("100");
  today = 150; await act(async () => { window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByTestId("today")).toHaveTextContent("150");
});

it("accepts another device's resumed state and greater accepted totals when no local boundary is pending", async () => {
  mode(); const sync = getTimerSync(7); const key = "resume-on-other-device";
  sync.create({ ownerId: 7, clientKey: key, startedAt: "2026-10-14T08:59:00.000Z", sessionId: 12 });
  localStorage.setItem(cacheKey, JSON.stringify({ v: 2, cacheVersion: 3, ownerId: 7, sessionId: 12, journalKey: key,
    startedAt: "2026-10-14T08:59:00.000Z", focusMs: 30_000, breakMs: 0, runningSinceMs: null, isPaused: true,
    phase: "focus", remainingMs: null, timestamp: Date.now() }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("/api/sessions")
    ? { id: 12, execution: { schemaVersion: 2, sessionId: 12, ownerId: 7, questId: null, state: "RUNNING", executionVersion: 7,
      acceptedFocusSeconds: 40, acceptedBreakSeconds: 0, startedAt: "2026-10-14T08:59:00.000Z", endedAt: null,
      actualCivilDate: "2026-10-14", timezone: "UTC" } } : String(input).includes("/stats") ? { id: 7 } : []))));
  render(<FocusScreen />); expect(screen.getByText("paused")).toBeInTheDocument();
  await act(async () => { sync.start(); await sync.drain(); });
  expect(screen.getByText("running")).toBeInTheDocument(); expect(screen.getByTestId("elapsed")).toHaveTextContent("40");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByTestId("elapsed")).toHaveTextContent("41");
});
