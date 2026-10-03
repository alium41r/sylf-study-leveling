"use client";
import { plannerFetch, postJson } from "./transport";
import type { ReofferOffer } from "./reoffer";

/**
 * The released-work re-offer client.
 *
 * Two calls, and they are deliberately asymmetric: reading the offers is a plain GET that
 * changes nothing, and answering one is the only thing that writes. A surface can therefore
 * call `fetchReoffers` on every mount without side effects — which is what makes "Sylf
 * mentions it when you come back" honest rather than a silent mutation.
 */

export const fetchReoffers = async (planId: string): Promise<ReofferOffer[]> => {
  const payload = await plannerFetch<{ offers: ReofferOffer[] }>(
    `/${encodeURIComponent(planId)}/reoffer`
  );
  return payload.offers ?? [];
};

export const acceptReoffer = async (
  planId: string,
  input: { expectedVersion: number; releasedItemKey: string }
): Promise<{ replacementItemKey: string; questId: number; created: boolean }> =>
  plannerFetch<{ accepted: { replacementItemKey: string; questId: number; created: boolean } }>(
    `/${encodeURIComponent(planId)}/reoffer`,
    {
      ...postJson({
        action: "accept",
        schemaVersion: 1,
        expectedVersion: input.expectedVersion,
        releasedItemKey: input.releasedItemKey,
        requestKey: `${input.releasedItemKey.replace(/-/g, "")}${Date.now().toString(36)}`.slice(0, 90),
      }),
    }
  ).then((payload: { accepted: { replacementItemKey: string; questId: number; created: boolean } }) => payload.accepted);

export const declineReoffer = async (
  planId: string,
  input: { expectedVersion: number; releasedItemKey: string }
): Promise<void> => {
  await plannerFetch<{ declined: unknown }>(`/${encodeURIComponent(planId)}/reoffer`, {
    ...postJson({
      action: "decline",
      schemaVersion: 1,
      expectedVersion: input.expectedVersion,
      releasedItemKey: input.releasedItemKey,
    }),
  });
};
