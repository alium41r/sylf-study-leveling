// Who is signed in. The one owner of identity on Sylf Native: a long-lived object outside React, like the study session, read through
// useSyncExternalStore. The server stays the authority, and this only remembers what it said.
//
// `userId` is known as soon as the device can read its vault, with no network, so a session started offline still has its owner. When the
// account changes or the session ends, every cached read goes at once. The timer journal does not: it is acknowledged work, namespaced by
// owner, and waits for that owner to come back (ADR 0010 decision 7).
import type { NativeUser } from "@sylf/shared/backend";
import { BackendError } from "./errors";
import type { AuthGateway, OAuthProvider, RegisterInput, SignInInput } from "./gateway";
import type { ResourceStore } from "./resources";

export type AuthStatus = "not-configured" | "restoring" | "signed-out" | "signed-in";

export interface AuthSnapshot {
  status: AuthStatus;
  userId: number | null;
  /** Filled by a sign-in in this run. After a restart, identity comes from the server's own `user/stats` read. */
  user: NativeUser | null;
  /** The server ended this session, so the app can say so instead of quietly showing a sign-in screen. */
  ended: boolean;
}

export interface AuthModel {
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  signIn(input: SignInInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  signInWithProvider(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;
  /** The server refused this session. */
  sessionEnded(): void;
}

export function createAuthModel(gateway: AuthGateway | null, resources: ResourceStore): AuthModel {
  let snapshot: AuthSnapshot = { status: gateway ? "restoring" : "not-configured", userId: null, user: null, ended: false };
  const listeners = new Set<() => void>();
  let restoring: Promise<void> | null = null;
  const set = (next: AuthSnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };
  const refused = () => new BackendError("not-configured", "This build is not connected to Sylf yet.");

  const open = (user: NativeUser) => {
    // Another person's cached reads must not outlive the change, even for a frame.
    if (snapshot.userId !== null && snapshot.userId !== user.id) resources.clear();
    set({ status: "signed-in", userId: user.id, user, ended: false });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore() {
      if (!gateway) return Promise.resolve();
      restoring ??= gateway.restore().then((identity) => {
        if (snapshot.status !== "restoring") return;
        set(identity ? { status: "signed-in", userId: identity.userId, user: null, ended: false } : { status: "signed-out", userId: null, user: null, ended: false });
      }, () => { if (snapshot.status === "restoring") set({ status: "signed-out", userId: null, user: null, ended: false }); });
      return restoring;
    },
    async signIn(input) { if (!gateway) throw refused(); open(await gateway.signIn(input)); },
    async register(input) { if (!gateway) throw refused(); open(await gateway.register(input)); },
    async signInWithProvider(provider) { if (!gateway) throw refused(); open(await gateway.signInWithProvider(provider)); },
    async signOut() {
      if (!gateway) return;
      resources.clear();
      set({ status: "signed-out", userId: null, user: null, ended: false });
      await gateway.signOut();
    },
    sessionEnded() {
      if (snapshot.status !== "signed-in") return;
      resources.clear();
      set({ status: "signed-out", userId: null, user: null, ended: true });
    },
  };
}
