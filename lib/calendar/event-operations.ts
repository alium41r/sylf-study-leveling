"use client";
import { apiFetch, fetchWithTimeout } from "@/lib/api-transport";
import {
  getClientSessionEpoch,
  invalidateClientCache,
} from "@/lib/client-data-cache";
import { calendarWriteSchema, calendarDeleteSchema } from "./contracts";
import type { z } from "zod";

type Write = Extract<z.infer<typeof calendarWriteSchema>, { kind: "event" }>;
export type EventOperation = {
  owner: number;
  key: string;
  method: "POST" | "PATCH" | "DELETE";
  body: Write | (z.infer<typeof calendarDeleteSchema> & { kind: "event" });
  title: string;
  updated: number;
};
export const EVENT_DRAFT_PREFIX = "sylf_calendar_event:";
const inMemory = new Map<string, EventOperation>();
let listening = false;
export function eventOperationDurable(operation: EventOperation) {
  try {
    return localStorage.getItem(operation.key) === JSON.stringify(operation);
  } catch {
    return false;
  }
}
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("calendar-session-ended", () => inMemory.clear());
  window.addEventListener("beforeunload", (event) => {
    if (
      [...inMemory.values()].some(
        (operation) => !eventOperationDurable(operation)
      )
    )
      event.preventDefault();
  });
}
export function pendingEventOperations(owner: number): EventOperation[] {
  if (typeof window === "undefined") return [];
  const results: EventOperation[] = [...inMemory.values()].filter(
    (operation) => operation.owner === owner
  );
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(`${EVENT_DRAFT_PREFIX}${owner}:`)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (
          value.owner !== owner ||
          value.key !== key ||
          !["POST", "PATCH", "DELETE"].includes(value.method) ||
          value.body?.kind !== "event"
        )
          continue;
        const parsed =
          value.method === "DELETE"
            ? calendarDeleteSchema.safeParse(value.body)
            : calendarWriteSchema.safeParse(value.body);
        if (
          parsed.success &&
          !results.some((operation) => operation.key === value.key)
        )
          results.push(value);
      } catch {
        /* An invalid local record is never sent to the server. */
      }
    }
  } catch {
    /* In-memory editor still retains its operation. */
  }
  return results.sort((a, b) => b.updated - a.updated);
}
export function newEventOperation(
  owner: number,
  method: EventOperation["method"],
  body: EventOperation["body"],
  title: string
): EventOperation {
  const mutationId = crypto.randomUUID();
  return {
    owner,
    key: `${EVENT_DRAFT_PREFIX}${owner}:${mutationId}`,
    method,
    body: { ...body, mutationId },
    title,
    updated: Date.now(),
  };
}
export function forgetEventOperation(operation: EventOperation) {
  inMemory.delete(operation.key);
  try {
    localStorage.removeItem(operation.key);
  } catch {
    /* Already absent. */
  }
  window.dispatchEvent(new Event("calendar-events-pending"));
}
export async function runEventOperation(operation: EventOperation) {
  listen();
  inMemory.set(operation.key, operation);
  const epoch = getClientSessionEpoch();
  // Persist before attempting the request, including its exact retry identity.
  try {
    localStorage.setItem(operation.key, JSON.stringify(operation));
  } catch {
    /* Error UI retains this in memory; never report it as durable. */
  }
  window.dispatchEvent(new Event("calendar-events-pending"));
  const response = await fetchWithTimeout(
    (path, init) => apiFetch(String(path), init),
    "/api/calendar/personal",
    {
      method: operation.method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation.body),
    }
  );
  if (epoch !== getClientSessionEpoch())
    throw new Error("Your session changed. Reopen the calendar.");
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Could not save. Retry when you are connected."
    );
  if (result.pending) throw new Error(result.message || "The provider has not confirmed this queued change. Retry the same operation or check Calendar settings.");
  forgetEventOperation(operation);
  invalidateClientCache("/api/calendar");
  window.dispatchEvent(new Event("calendar-content-updated"));
  return result;
}
