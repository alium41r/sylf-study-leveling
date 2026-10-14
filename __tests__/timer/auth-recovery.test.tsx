import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/app/components/AuthProvider";

function Status() { const { user, isLoading } = useAuth(); return <span>{isLoading ? "loading" : user?.id ?? "guest"}</span>; }
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("recovers authentication on reconnect after a failed restart read", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValue(new Response(JSON.stringify({ id: 7 })));
  vi.stubGlobal("fetch", request);
  render(<AuthProvider><Status /></AuthProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText("guest")).toBeInTheDocument();
  await act(async () => { window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText("7")).toBeInTheDocument(); expect(request).toHaveBeenCalledTimes(2);
});
it("bounds a hung authentication read and retries automatically", async () => {
  const request = vi.fn().mockImplementationOnce(() => new Promise<Response>(() => {})).mockResolvedValue(new Response(JSON.stringify({ id: 7 })));
  vi.stubGlobal("fetch", request); vi.spyOn(console, "error").mockImplementation(() => {});
  render(<AuthProvider><Status /></AuthProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
  expect(screen.getByText("guest")).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByText("7")).toBeInTheDocument(); expect(request).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});
it("does not poll a confirmed guest repeatedly", async () => {
  const request = vi.fn().mockResolvedValue(new Response("{}", { status: 401 })); vi.stubGlobal("fetch", request);
  render(<AuthProvider><Status /></AuthProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(request).toHaveBeenCalledTimes(1);
});
