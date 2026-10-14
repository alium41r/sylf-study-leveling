import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ ownerId: 7 as number | undefined, refreshStats: vi.fn(), start: vi.fn(), stop: vi.fn(), wake: vi.fn(), drain: vi.fn(),
  status: { pending: 1, error: "Your session is saved on this device. Sync will retry automatically." as string | null }, changed: (() => {}) as () => void }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user: mock.ownerId ? { id: mock.ownerId } : null, refreshStats: mock.refreshStats }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/timer" }));
vi.mock("@/lib/timer-sync", () => ({ getTimerSync: () => ({ ...mock, status: () => mock.status, subscribe: (callback: () => void) => { mock.changed = callback; return vi.fn(); }, onAccepted: () => vi.fn() }) }));
import TimerSyncWorker from "@/app/components/TimerSyncWorker";
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mock.ownerId = 7; mock.status = { pending: 1, error: "Your session is saved on this device. Sync will retry automatically." }; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function failure() { act(() => mock.changed()); }
it("automatically dismisses one error episode without stopping background retries or resetting its timeout", async () => {
  render(<TimerSyncWorker />); failure(); expect(screen.getByRole("status")).toHaveTextContent("update your account automatically");
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); failure();
  await act(async () => { await vi.advanceTimersByTimeAsync(2001); }); expect(screen.queryByRole("status")).toBeNull();
  failure(); expect(screen.queryByRole("status")).toBeNull(); expect(mock.drain).toHaveBeenCalledTimes(3); expect(mock.stop).not.toHaveBeenCalled();
});
it("supports dismissal and retry without deleting the saved update", () => {
  render(<TimerSyncWorker />); failure(); fireEvent.click(screen.getByText("Try again")); expect(mock.wake).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByLabelText("Dismiss session notification")); failure(); expect(screen.queryByRole("status")).toBeNull(); expect(mock.status.pending).toBe(1); expect(mock.stop).not.toHaveBeenCalled();
});
it("clears immediately when accepted and shows a later distinct failure episode", () => {
  render(<TimerSyncWorker />); failure(); mock.status = { pending: 0, error: mock.status.error }; failure(); expect(screen.queryByRole("status")).toBeNull();
  mock.status = { pending: 1, error: null }; failure(); mock.status.error = "Sign in to sync your saved timer sessions."; failure();
  expect(screen.getByRole("status")).toHaveTextContent("Sign in"); expect(mock.refreshStats).toHaveBeenCalledOnce();
});
it("does not show a stale previous account's notice", () => {
  const { rerender } = render(<TimerSyncWorker />); failure(); mock.ownerId = 8; rerender(<TimerSyncWorker />); expect(screen.queryByRole("status")).toBeNull();
});
