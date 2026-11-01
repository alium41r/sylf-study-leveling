import { describe, expect, it, vi } from "vitest";
import type { NativeUser } from "@sylf/shared/backend";
import { createAuthModel } from "./auth-model";
import { BackendError } from "./errors";
import type { AuthGateway } from "./gateway";
import { createResourceStore } from "./resources";

const user = (id: number): NativeUser => ({ id, email: `${id}@local.test`, username: `u${id}`, name: null, scholarId: null, verificationStatus: "VERIFIED", hunterRank: "E", level: 1, hasCompletedOnboarding: true, avatarUrl: null });
const gateway = (overrides: Partial<AuthGateway> = {}): AuthGateway => ({ transport: async () => new Response("{}"), restore: async () => null, signIn: async () => user(1), register: async () => user(1), signInWithProvider: async () => user(1), signOut: async () => undefined, ping: async () => true, ...overrides });
const settled = () => new Promise((done) => setTimeout(done, 0));

describe("the auth model", () => {
  it("has nothing to do in a build with no backend", async () => {
    const auth = createAuthModel(null, createResourceStore());
    await auth.restore();
    expect(auth.getSnapshot().status).toBe("not-configured");
    await expect(auth.signIn({ identifier: "a", password: "b" })).rejects.toMatchObject({ kind: "not-configured" });
  });

  it("restores an owner from the device, with no profile yet", async () => {
    const auth = createAuthModel(gateway({ restore: async () => ({ userId: 7 }) }), createResourceStore());
    expect(auth.getSnapshot().status).toBe("restoring");
    await auth.restore();
    expect(auth.getSnapshot()).toEqual({ status: "signed-in", userId: 7, user: null, ended: false });
  });

  it("restores once", async () => {
    const restore = vi.fn(async () => null);
    const auth = createAuthModel(gateway({ restore }), createResourceStore());
    await Promise.all([auth.restore(), auth.restore()]);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(auth.getSnapshot().status).toBe("signed-out");
  });

  it("reads a failed restore as signed out, and does not crash", async () => {
    const auth = createAuthModel(gateway({ restore: async () => { throw new Error("vault"); } }), createResourceStore());
    await auth.restore();
    expect(auth.getSnapshot().status).toBe("signed-out");
  });

  it("does not let a slow restore overwrite a sign-in that finished first", async () => {
    let finish: (value: { userId: number } | null) => void = () => undefined;
    const auth = createAuthModel(gateway({ restore: () => new Promise((resolve) => { finish = resolve; }), signIn: async () => user(2) }), createResourceStore());
    const restoring = auth.restore();
    await auth.signIn({ identifier: "a", password: "b" });
    finish(null);
    await restoring;
    expect(auth.getSnapshot().userId).toBe(2);
  });

  it("signs in, and a refusal leaves everything as it was", async () => {
    const signIn = vi.fn<AuthGateway["signIn"]>().mockRejectedValueOnce(new BackendError("invalid", "Invalid credentials")).mockResolvedValueOnce(user(3));
    const auth = createAuthModel(gateway({ signIn }), createResourceStore());
    await auth.restore();
    await expect(auth.signIn({ identifier: "a", password: "b" })).rejects.toMatchObject({ kind: "invalid" });
    expect(auth.getSnapshot().status).toBe("signed-out");
    await auth.signIn({ identifier: "a", password: "b" });
    expect(auth.getSnapshot()).toMatchObject({ status: "signed-in", userId: 3 });
  });

  it("drops cached reads the moment the account changes", async () => {
    const resources = createResourceStore();
    const signIn = vi.fn<AuthGateway["signIn"]>().mockResolvedValueOnce(user(1)).mockResolvedValueOnce(user(2));
    const auth = createAuthModel(gateway({ signIn }), resources);
    await auth.signIn({ identifier: "a", password: "b" });
    resources.resource({ key: "private", load: async () => 1 }).subscribe(() => undefined);
    await settled();
    await auth.signIn({ identifier: "c", password: "d" });
    expect(resources.size()).toBe(0);
  });

  it("clears local state before the server hears, so sign-out cannot be held up by a network", async () => {
    const order: string[] = [];
    const resources = createResourceStore();
    const auth = createAuthModel(gateway({ signOut: async () => { order.push(`server:${resources.size()}`); } }), resources);
    await auth.signIn({ identifier: "a", password: "b" });
    resources.resource({ key: "private", load: async () => 1 });
    auth.subscribe(() => order.push(`status:${auth.getSnapshot().status}`));
    await auth.signOut();
    expect(order).toEqual(["status:signed-out", "server:0"]);
  });

  it("says when the server ended the session, and clears the cache", async () => {
    const resources = createResourceStore();
    const auth = createAuthModel(gateway(), resources);
    await auth.signIn({ identifier: "a", password: "b" });
    resources.resource({ key: "private", load: async () => 1 });
    auth.sessionEnded();
    expect(auth.getSnapshot()).toEqual({ status: "signed-out", userId: null, user: null, ended: true });
    expect(resources.size()).toBe(0);
  });

  it("ignores a late refusal once nobody is signed in", async () => {
    const auth = createAuthModel(gateway(), createResourceStore());
    await auth.restore();
    const listener = vi.fn();
    auth.subscribe(listener);
    auth.sessionEnded();
    expect(listener).not.toHaveBeenCalled();
  });
});
