// Everything joined, once, outside React. With no gateway this is a client that sends nothing: an app built without a backend makes no
// request, starts nothing and stays exactly what it was. With one, nothing happens until `start`, which only reads the device.
import { createAuthModel, type AuthModel } from "./auth-model";
import { createBackendClient, type BackendClient } from "./client";
import { createConnectivity, type Connectivity } from "./connectivity";
import type { AuthGateway } from "./gateway";
import { createJournalStorage, type PreferenceStore } from "./journal-storage";
import { createPresence } from "./presence";
import { createResourceStore, type ResourceStore } from "./resources";
import { createReads, type Reads } from "./reads";
import { createTimerDelivery, type TimerDelivery } from "./timer-delivery";

export interface Backend {
  client: BackendClient;
  connectivity: Connectivity;
  resources: ResourceStore;
  auth: AuthModel;
  timer: TimerDelivery;
  /** Every typed read and write a screen uses, so screens never touch a path or a schema. */
  reads: Reads;
  /** Reads the device for a session. Safe to call once after the first frame. */
  start(): Promise<void>;
  /** The app came back to the front. */
  wake(): void;
  /** The app went behind something. Nothing runs from here until `wake`. */
  sleep(): void;
  /** A deep link arrived. True when it belonged to a sign-in. */
  receiveLink(url: string): boolean;
}

export function createBackend({ gateway, preferences, assetUrl }: { gateway: AuthGateway | null; preferences: PreferenceStore; assetUrl?: (path: string) => string }): Backend {
  const connectivity = createConnectivity(() => gateway?.ping() ?? Promise.resolve(false));
  const resources = createResourceStore({ connectivity });
  const auth = createAuthModel(gateway, resources);
  const client = createBackendClient({ transport: gateway?.transport ?? null, connectivity, assetUrl, onSignedOut: () => auth.sessionEnded() });
  const timer = createTimerDelivery({ auth, client, storage: createJournalStorage(preferences), connectivity });
  const reads = createReads(client);
  const presence = createPresence(() => reads.heartbeat());
  let owner = auth.getSnapshot().userId;
  auth.subscribe(() => {
    const snapshot = auth.getSnapshot();
    if (snapshot.userId !== owner) { client.reset(); owner = snapshot.userId; }
    presence.update(snapshot.status === "signed-in");
  });
  return {
    client, connectivity, resources, auth, timer, reads,
    start: () => auth.restore(),
    wake() { resources.wake(); timer.wake(); presence.setForeground(true); },
    sleep() { presence.setForeground(false); },
    receiveLink: (url) => gateway?.receiveLink?.(url) ?? false,
  };
}
