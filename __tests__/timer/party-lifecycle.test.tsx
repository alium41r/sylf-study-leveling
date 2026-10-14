import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UseFocusPartyRealtimeReturn } from "@/app/hooks/useFocusPartyRealtime";
const mocks = vi.hoisted(() => ({ runtime: null as unknown as UseFocusPartyRealtimeReturn }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("@/app/hooks/useFocusPartyRealtime", async importOriginal => {
  const original = await importOriginal<typeof import("@/app/hooks/useFocusPartyRealtime")>();
  return { ...original, useFocusPartyRealtime: (...args: Parameters<typeof original.useFocusPartyRealtime>) =>
    mocks.runtime ?? original.useFocusPartyRealtime(...args) };
});
vi.mock("@/lib/supabase-browser", () => ({ isRealtimeConfigured: () => false, attachRealtimeAuth: vi.fn() }));
import { useFocusPartyRealtime } from "@/app/hooks/useFocusPartyRealtime";
import { FocusPartyProvider, useFocusParty } from "@/app/social/components/focus-party/FocusPartyContext";
import { getTimerSync } from "@/lib/timer-sync";
const t0 = "2026-10-14T09:00:00.000Z";
const member = { userId: 7, timerState: "FOCUSING" as const, accumulatedSeconds: 30, liveSeconds: 50,
  isFocusing: true, currentStartedAt: t0, joinedAt: t0, leftAt: null };
const summary = { id: 4, name: "Study", leaderId: 7, createdAt: t0, updatedAt: t0,
  disbandedAt: null, isCurrentUserLeader: true, memberCount: 1 };
const session = { id: 8, startedAt: t0, collectiveSeconds: 50, members: [member] };
const party = { party: summary, members: [{ userId: 7, username: "timer", name: null, hunterRank: "E",
  avatarUrl: null, characterConfig: null, joinedAt: t0, isLeader: true }], activeSession: session };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T09:00:20.000Z")); localStorage.clear(); mocks.runtime = null as unknown as UseFocusPartyRealtimeReturn; });
afterEach(() => { cleanup(); getTimerSync(7).stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("persists an immediate party exit even while an acknowledged pause is hung, and restores it on remount", async () => {
  mocks.runtime = { party, session, timerViews: { 7: member }, collectiveSeconds: 50, connectionState: "disconnected", isLoading: false,
    error: null, lastSyncedAt: null, refresh: vi.fn(async () => {}), pauseTimer: vi.fn(() => new Promise<{ success: boolean; error?: string }>(() => {})),
    startTimer: vi.fn(), resumeTimer: vi.fn(), leaveFocus: vi.fn(), enterFocus: vi.fn(), leaveParty: vi.fn(), kickMember: vi.fn(), inviteFriend: vi.fn() };
  vi.stubGlobal("fetch", vi.fn(async () => json({ activeParty: summary, pendingInvites: [] })));
  const wrapper = ({ children }: { children: React.ReactNode }) => <FocusPartyProvider partyIdOverride={4}>{children}</FocusPartyProvider>;
  const { result, unmount } = renderHook(() => useFocusParty(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => { void result.current.pauseTimer(); });
  expect(result.current.isActionLoading).toBe(true);
  await act(async () => { expect(await result.current.leaveFocus()).toEqual({ success: true }); expect(await result.current.leaveFocus()).toEqual({ success: true }); });
  expect(result.current).toMatchObject({ myTimerState: "LEFT", myLiveSeconds: 50, isInFocus: false });
  expect(result.current.viewMode).toBe("lobby"); expect(getTimerSync(7).status().pending).toBe(1);
  expect(mocks.runtime.leaveFocus).not.toHaveBeenCalled();
  unmount(); const restored = renderHook(() => useFocusParty(), { wrapper });
  expect(restored.result.current).toMatchObject({ myTimerState: "LEFT", myLiveSeconds: 50, isInFocus: false });
  await act(async () => { expect((await restored.result.current.enterFocus()).success).toBe(false); });
  expect(mocks.runtime.enterFocus).not.toHaveBeenCalled();
});
it("keeps the accepted room and automatically polls after transient failure without Realtime", async () => {
  let fail = false;
  const request = vi.fn(async (input: RequestInfo | URL) => fail ? json({}, 503) : json(String(input).endsWith("/session") ? { session } : party));
  vi.stubGlobal("fetch", request);
  const { result } = renderHook(() => useFocusPartyRealtime(4, 7));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(result.current.session?.id).toBe(8);
  fail = true; await act(async () => { await result.current.refresh(); });
  expect(result.current.session?.id).toBe(8); expect(result.current.error).toBeTruthy();
  fail = false; await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(result.current.error).toBeNull(); expect(request).toHaveBeenCalledTimes(6);
});
it("does not allow an old room's delayed read to overwrite a newly selected room", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("/4") ? new Promise<Response>(r => { if (!String(input).endsWith("/session")) resolve = r; else r(json({ session })); }) : Promise.resolve(json(String(input).endsWith("/session") ? { session: { ...session, id: 9 } } : { ...party, party: { ...summary, id: 5 } }))));
  const { result, rerender } = renderHook(({ id }) => useFocusPartyRealtime(id, 7), { initialProps: { id: 4 } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  rerender({ id: 5 }); await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.session?.id).toBe(9);
  await act(async () => { resolve(json(party)); await vi.advanceTimersByTimeAsync(1); });
  expect(result.current.session?.id).toBe(9); expect(result.current.party?.party.id).toBe(5);
});
it("bounds a hung party timer action so controls can recover", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? new Promise<Response>(() => {}) : Promise.resolve(json(String(input).endsWith("/session") ? { session } : party))));
  const { result } = renderHook(() => useFocusPartyRealtime(4, 7));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  let action!: Awaited<ReturnType<typeof result.current.pauseTimer>>;
  act(() => { void result.current.pauseTimer().then(value => { action = value; }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
  expect(action.success).toBe(false); expect(action.error).toBe("Request timed out");
});
