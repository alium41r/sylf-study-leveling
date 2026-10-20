import React, { useLayoutEffect } from "react";
import { act, cleanup, render, waitFor, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  useAuth,
  type UserStats,
} from "@/app/components/AuthProvider";
import {
  NotesSession,
  createBrowserNotesSession,
  invalidateNotesAccess,
  registerNotesFlush,
} from "@/lib/notes/session";
import { NotesError } from "@/lib/notes/errors";

vi.mock("@/lib/pixel-creations-client", () => ({
  clearPixelCreations: vi.fn(),
}));
let auth: ReturnType<typeof useAuth>;
function Probe() {
  const current = useAuth();
  useLayoutEffect(() => {
    auth = current;
  }, [current]);
  return <span>{current.user?.id ?? "none"}</span>;
}
const user = (id: number) =>
  ({
    id,
    email: `synthetic-${id}@example.invalid`,
    username: "synthetic",
  }) as UserStats;
const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(user(1)))
  );
});
afterEach(() => {
  cleanup();
  disposers.splice(0).forEach((fn) => fn());
  invalidateNotesAccess();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production AuthProvider Notes boundary", () => {
  it("fails closed when the initial cross-tab storage barrier cannot be reserved", () => {
    localStorage.removeItem("sylf_notes_session_barrier_v1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => createBrowserNotesSession("1", () => true)).toThrowError(
      "Cross-tab session fencing is unavailable."
    );
  });
  it("a login in an anonymous tab invalidates the previous cookie owner's Notes access", async () => {
    const session = new NotesSession("old-owner", () => "old-owner");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(user(2)))
    );
    render(
      <AuthProvider initialUser={null}>
        <Probe />
      </AuthProvider>
    );
    await act(async () => auth.login(user(2)));
    expect(session.signal.aborted).toBe(true);
    expect(auth.user?.id).toBe(2);
  });
  it("storage failure blocks explicit logout before any logout request or invalidation", async () => {
    render(
      <AuthProvider initialUser={user(1)}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(auth.user?.id).toBe(1));
    const session = new NotesSession("1", () => "1");
    disposers.push(
      registerNotesFlush("1", async () => {
        throw new NotesError("QUOTA", "synthetic unsaved work");
      })
    );
    await expect(auth.logout()).rejects.toMatchObject({ code: "QUOTA" });
    expect(session.signal.aborted).toBe(false);
    expect(auth.user?.id).toBe(1);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/api/auth/logout"))
    ).toBe(false);
  });
  it.each(["network", "http"])(
    "does not claim successful sign-out on a %s failure and locks Notes",
    async (mode) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: RequestInfo | URL) => {
          if (String(url).includes("/api/auth/logout")) {
            if (mode === "network") throw new TypeError("offline");
            return new Response(null, { status: 503 });
          }
          return Response.json(user(1));
        })
      );
      render(
        <AuthProvider initialUser={user(1)}>
          <Probe />
        </AuthProvider>
      );
      await waitFor(() => expect(auth.user?.id).toBe(1));
      const session = new NotesSession("1", () => "1");
      await act(async () => {
        await expect(auth.logout()).rejects.toThrow(
          "Sign out could not be confirmed"
        );
      });
      expect(session.signal.aborted).toBe(true);
      expect(auth.user?.id).toBe(1);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Sign out could not be confirmed"
      );
    }
  );
  it("drains buffered Notes before invalidating access and contacting logout", async () => {
    let finishFlush!: () => void;
    const flush = new Promise<void>((resolve) => {
      finishFlush = resolve;
    });
    disposers.push(registerNotesFlush("1", () => flush));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url).includes("/api/auth/logout")
          ? new Promise<Response>(() => {})
          : Promise.resolve(Response.json(user(1)))
      )
    );
    render(
      <AuthProvider initialUser={user(1)}>
        <Probe />
      </AuthProvider>
    );
    const session = new NotesSession("1", () => "1");
    void auth.logout();
    expect(session.signal.aborted).toBe(false);
    finishFlush();
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("/api/auth/logout"))
      ).toBe(true)
    );
    expect(session.signal.aborted).toBe(true);
  });
  it("a revoked session closes Notes access through existing cache cleanup", async () => {
    const session = new NotesSession("1", () => "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 }))
    );
    render(
      <AuthProvider initialUser={user(1)}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(auth.user).toBeNull());
    expect(session.signal.aborted).toBe(true);
  });
});
