// ADR 0010: time tracked with nobody signed in belongs to nobody, and only the person at the keys can say it is theirs. So signing in credits nothing
// by itself. This asks once, plainly, and either answer is final. It appears only when the account existed before the session did, because the server
// would credit nothing else, and offering it would promise something that does not happen.
import { useMemo, useSyncExternalStore } from "react";
import { Dialog, Text } from "@sylf/design-system";
import type { Backend } from "@sylf/backend";
import { ownerlessOffer, speakSessionClock } from "@sylf/spaces";
import { currentBridge } from "../backend";
import { useSessionState } from "../context";
import { useStats } from "../live";

export function ClaimSheet({ backend }: { backend: Backend }) {
  const auth = useSyncExternalStore(backend.auth.subscribe, backend.auth.getSnapshot);
  const state = useSessionState();
  const stats = useStats();
  const createdAt = stats?.createdAt ? Date.parse(stats.createdAt) : null;
  const offer = useMemo(() => (auth.status === "signed-in" && createdAt !== null && Number.isFinite(createdAt) ? ownerlessOffer(state, createdAt, Date.now()) : null), [auth.status, createdAt, state]);
  const bridge = currentBridge();
  if (!offer || !bridge) return null;
  return (
    <Dialog
      open
      onClose={() => bridge.decline(offer.clientKeys)}
      title="Add this to your study record?"
      actions={[{ label: "Keep on this device", onPress: () => bridge.decline(offer.clientKeys) }, { label: "Add to my record", onPress: () => bridge.claim(offer.clientKeys) }]}
    >
      <Text variant="small" tone="soft">{`${offer.count === 1 ? "One session" : `${offer.count} sessions`}, ${speakSessionClock(offer.focusSeconds)}, tracked here while nobody was signed in. If it's yours, add it. This can't be undone, and Sylf credits only the time it can verify.`}</Text>
    </Dialog>
  );
}
