// The Account page's reads. One resource each, so every section says loading, offline and failed once. A write invalidates by tag, so the page, Home and
// the profile others see never disagree. All of it is memory only and goes at sign-out with the rest of the cache (ADR 0011).
import { useMemo } from "react";
import type { Backend, Connection, Cosmetics, DeviceSession, NotificationPreferences, Privacy, ResourceDefinition } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../backend";
import { toLiveResult } from "../live-result";

const privacyResource = (backend: Backend): ResourceDefinition<Privacy> => ({ key: "account-privacy", tags: ["account-privacy"], ttlMs: 5 * 60_000, load: (signal) => backend.reads.account.privacy(signal) });
const notificationsResource = (backend: Backend): ResourceDefinition<NotificationPreferences> => ({ key: "account-notifications", tags: ["account-notifications"], ttlMs: 5 * 60_000, load: async (signal) => (await backend.reads.account.notificationPreferences(signal)).preferences });
const devicesResource = (backend: Backend): ResourceDefinition<DeviceSession[]> => ({ key: "account-devices", tags: ["account-devices"], ttlMs: 30_000, load: async (signal) => (await backend.reads.account.devices(signal)).sessions });
const connectionsResource = (backend: Backend): ResourceDefinition<Connection[]> => ({ key: "account-connections", tags: ["account-connections"], ttlMs: 5 * 60_000, load: async (signal) => (await backend.reads.account.connections(signal)).connections });
const cosmeticsResource = (backend: Backend): ResourceDefinition<Cosmetics> => ({ key: "account-cosmetics", tags: ["account-profile"], ttlMs: 5 * 60_000, load: (signal) => backend.reads.cosmetics(signal) });

function useLive<T>(backend: Backend | null, definition: (backend: Backend) => ResourceDefinition<T>, key: string) {
  // `key` says when the definition changed.
  const resource = useMemo(() => (backend ? backend.resources.resource(definition(backend)) : null), [backend, key]);
  return toLiveResult(useOptionalResource(resource), resource);
}

export const usePrivacy = () => useLive(useLiveBackend(), privacyResource, "privacy");
export const useNotificationPreferences = () => useLive(useLiveBackend(), notificationsResource, "notifications");
export const useDevices = () => useLive(useLiveBackend(), devicesResource, "devices");
export const useConnections = () => useLive(useLiveBackend(), connectionsResource, "connections");
export const useOwnedCosmetics = () => useLive(useLiveBackend(), cosmeticsResource, "cosmetics");

/** Everything that shows who this person is reads again after a change to it. */
export function refreshIdentity(backend: Backend) {
  for (const tag of ["traveller", "progress", "account-profile"]) backend.resources.invalidate(tag);
}
