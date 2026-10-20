"use client";
import { apiFetch, fetchWithTimeout } from "@/lib/api-transport";
import {
  getClientSessionEpoch,
  invalidateClientCache,
} from "@/lib/client-data-cache";
import {
  noteInputSchema,
  type CalendarNote,
  type NoteInput,
} from "./contracts";

export const DRAFT_PREFIX = "sylf_calendar_draft:";
export type SaveStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "offline"
  | "conflict"
  | "error";
export interface NoteRecovery {
  owner: number;
  id: string;
  revision: number;
  exists: boolean;
  data: NoteInput;
  base: NoteInput;
  attempt?: NoteInput;
  key: string;
  updated: number;
}
export function recoveries(owner: number): NoteRecovery[] {
  if (typeof window === "undefined") return [];
  const results: NoteRecovery[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(`${DRAFT_PREFIX}${owner}:`)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key)!);
        if (
          value.owner === owner &&
          value.key === key &&
          noteInputSchema.safeParse(value.data).success &&
          noteInputSchema.safeParse(value.base).success &&
          Number.isInteger(value.revision) &&
          value.revision > 0 &&
          typeof value.id === "string" &&
          /^[0-9a-f-]{36}$/i.test(value.id) &&
          typeof value.exists === "boolean" &&
          (!value.attempt || noteInputSchema.safeParse(value.attempt).success)
        )
          results.push(value);
      } catch {
        /* Ignore corrupt records without deleting potentially recoverable content. */
      }
    }
  } catch {
    /* Recovery storage unavailable; the editor reports this explicitly. */
  }
  for (const job of new Set(jobs.values()))
    if (
      job.record.owner === owner &&
      job.pending &&
      !results.some((record) => record.key === job.record.key)
    )
      results.push({ ...job.record });
  return results.sort((a, b) => b.updated - a.updated);
}
const jobs = new Map<string, NoteAutosave>();
if (typeof window !== "undefined")
  window.addEventListener("calendar-session-ended", () => {
    for (const job of new Set(jobs.values())) job.discard();
    jobs.clear();
  });
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    for (const job of new Set(jobs.values()))
      if (job.pending && !job.persist()) event.preventDefault();
  });
  window.addEventListener("pagehide", () => {
    for (const job of new Set(jobs.values()))
      if (job.pending) {
        job.persist();
        void job.flush();
      }
  });
}
const same = (a: unknown, b: unknown): boolean => {
  const stable = (v: unknown): string =>
    Array.isArray(v)
      ? "[" + v.map(stable).join(",") + "]"
      : v && typeof v === "object"
        ? "{" +
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
            .join(",") +
          "}"
        : JSON.stringify(v);
  return stable(a) === stable(b);
};
const inputOf = (note: CalendarNote): NoteInput => ({
  title: note.title,
  dateKey: note.dateKey,
  document: note.document,
});
export class NoteAutosave {
  private epoch = getClientSessionEpoch();
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private saving: Promise<void> | null = null;
  private generation = 0;
  private dirty = false;
  private retries = 0;
  private disposed = false;
  private storageTimer?: ReturnType<typeof setTimeout>;
  private view = 0;
  status: SaveStatus = "saved";
  error = "";
  durable = true;
  record: NoteRecovery;
  constructor(
    owner: number,
    initial: NoteInput,
    note?: CalendarNote,
    recovery?: NoteRecovery
  ) {
    this.record = recovery
      ? { ...recovery }
      : {
          owner,
          id: note?.id || crypto.randomUUID(),
          revision: note?.revision || 1,
          exists: !!note,
          data: initial,
          base: initial,
          key: `${DRAFT_PREFIX}${owner}:${note?.id || "new"}:${crypto.randomUUID()}`,
          updated: Date.now(),
        };
    if (recovery) {
      this.status = "unsaved";
      this.generation = 1;
      this.dirty = true;
    }
  }
  connect() {
    jobs.set(this.record.key, this);
    window.addEventListener("online", this.online);
  }
  private online = () => {
    if (this.status !== "conflict") void this.flush();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.view;
  private emit() {
    this.view++;
    for (const listener of this.listeners) listener();
  }
  private valid() {
    return !this.disposed && this.epoch === getClientSessionEpoch();
  }
  get pending() {
    return this.dirty || (!this.record.exists && this.generation > 0);
  }
  change(data: NoteInput) {
    if (!this.valid()) return;
    this.record.data = data;
    this.record.updated = Date.now();
    this.generation++;
    this.dirty = true;
    if (this.status !== "conflict") this.status = "unsaved";
    this.error = "";
    this.emit();
    clearTimeout(this.storageTimer);
    this.storageTimer = setTimeout(() => this.persist(), 200);
    clearTimeout(this.timer);
    if (this.status !== "conflict")
      this.timer = setTimeout(() => void this.flush(), 1100);
  }
  persist() {
    clearTimeout(this.storageTimer);
    if (!this.valid()) return false;
    if (!this.pending) return true;
    try {
      localStorage.setItem(this.record.key, JSON.stringify(this.record));
      this.durable = true;
      window.dispatchEvent(new Event("calendar-drafts-updated"));
      return true;
    } catch {
      this.durable = false;
      this.error =
        "Device recovery is unavailable. Keep this page open until your note is saved.";
      this.emit();
      return false;
    }
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.valid() || !this.pending || this.status === "conflict") return;
    if (this.saving) return this.saving;
    this.persist();
    this.saving = this.saveLoop().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }
  private async request(path: string, init?: RequestInit) {
    return fetchWithTimeout(
      (url, options) => apiFetch(String(url), options),
      path,
      { credentials: "include", ...init }
    );
  }
  private async reconcile() {
    if (!this.record.attempt) return;
    const res = await this.request(
      `/api/calendar/personal?id=${this.record.id}`
    );
    if (res.status === 404) {
      if (this.record.exists) {
        this.status = "conflict";
        throw new Error(
          "This note was deleted elsewhere. Your draft is kept. Save a copy."
        );
      }
      this.record.attempt = undefined;
      return;
    }
    if (!res.ok)
      throw new Error("Could not check the saved version. Your draft is kept.");
    const { note } = (await res.json()) as { note: CalendarNote };
    const remote = inputOf(note);
    if (same(remote, this.record.attempt)) {
      this.record.exists = true;
      this.record.revision = note.revision;
      this.record.base = remote;
      if (same(this.record.data, this.record.attempt)) this.dirty = false;
      this.record.attempt = undefined;
      return;
    }
    if (
      note.revision === this.record.revision &&
      same(remote, this.record.base)
    ) {
      this.record.attempt = undefined;
      return;
    }
    this.status = "conflict";
    throw new Error(
      "This note changed in another tab or device. Your writing is safe here. Save a copy to keep both versions."
    );
  }
  private async saveLoop() {
    if (this.record.attempt) {
      try {
        await this.reconcile();
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    while (this.valid() && this.pending) {
      const parsed = noteInputSchema.safeParse(this.record.data);
      if (!parsed.success) {
        this.status = "error";
        this.error = parsed.error.issues[0].message;
        this.emit();
        return;
      }
      const sent = parsed.data;
      const sentGeneration = this.generation;
      this.record.attempt = sent;
      this.persist();
      this.status = "saving";
      this.emit();
      try {
        const res = await this.request("/api/calendar/personal", {
          method: this.record.exists ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "note",
            id: this.record.id,
            revision: this.record.revision,
            data: sent,
          }),
        });
        if (!this.valid()) return;
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          if (res.status === 409 || res.status === 404) {
            await this.reconcile();
            continue;
          }
          if (res.status === 401) {
            this.status = "error";
            throw new Error(
              "Sign in again to save. Your writing is kept on this device."
            );
          }
          if (res.status === 400 || res.status === 413) {
            this.record.attempt = undefined;
            this.status = "error";
            throw new Error(error.error || "This page is too large to save.");
          }
          throw new Error(
            error.error ||
              "Saving is unavailable. Your draft is kept on this device."
          );
        }
        const { note } = (await res.json()) as { note: CalendarNote };
        this.record.revision = note.revision;
        this.record.exists = true;
        this.record.base = sent;
        if (this.generation === sentGeneration) {
          this.record.data = sent;
          this.dirty = false;
        }
        this.record.attempt = undefined;
        this.retries = 0;
        invalidateClientCache("/api/calendar");
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    if (!this.valid()) return;
    this.status = "saved";
    this.error = "";
    this.durable = true;
    window.dispatchEvent(new Event("calendar-content-updated"));
    try {
      localStorage.removeItem(this.record.key);
      window.dispatchEvent(new Event("calendar-drafts-updated"));
    } catch {}
    this.emit();
    if (!this.listeners.size) this.release();
  }
  private fail(error: unknown) {
    if (!this.valid()) return;
    this.error =
      error instanceof Error
        ? error.message
        : "Your draft is kept on this device.";
    if (this.status !== "conflict" && this.status !== "error")
      this.status = "offline";
    this.persist();
    this.emit();
    if (this.status === "offline")
      this.timer = setTimeout(
        () => void this.flush(),
        Math.min(60000, 3000 * 2 ** this.retries++)
      );
  }
  async saveCopy() {
    if (this.saving) await this.saving;
    if (!this.valid()) return;
    const old = this.record.key;
    this.dirty = true;
    this.record = {
      ...this.record,
      id: crypto.randomUUID(),
      revision: 1,
      exists: false,
      attempt: undefined,
      data: {
        ...this.record.data,
        title: this.record.data.title
          ? `${this.record.data.title.slice(0, 165)} (copy)`
          : "Recovered note",
      },
      base: { ...this.record.base, title: "__unsaved_copy__" },
      key: `${DRAFT_PREFIX}${this.record.owner}:copy:${crypto.randomUUID()}`,
    };
    this.status = "unsaved";
    if (this.persist()) {
      localStorage.removeItem(old);
      await this.flush();
    }
  }
  discard() {
    clearTimeout(this.timer);
    clearTimeout(this.storageTimer);
    try {
      localStorage.removeItem(this.record.key);
    } catch {}
    this.disposed = true;
    window.removeEventListener("online", this.online);
    for (const [key, job] of jobs) if (job === this) jobs.delete(key);
    window.dispatchEvent(new Event("calendar-drafts-updated"));
  }
  release() {
    if (this.pending) {
      this.persist();
      void this.flush();
    } else {
      window.removeEventListener("online", this.online);
      for (const [key, job] of jobs) if (job === this) jobs.delete(key);
    }
  }
}
export function noteAutosave(
  owner: number,
  initial: NoteInput,
  note?: CalendarNote,
  recovery?: NoteRecovery,
  instanceKey?: string
): NoteAutosave {
  const key =
    recovery?.key ||
    `${owner}:${note?.id || instanceKey || crypto.randomUUID()}`;
  const existing =
    jobs.get(key) ||
    (note
      ? [...jobs.values()].find(
          (job) => job.record.owner === owner && job.record.id === note.id
        )
      : undefined);
  if (existing && (!note || existing.record.id === note.id)) return existing;
  const job = new NoteAutosave(owner, initial, note, recovery);
  jobs.set(key, job);
  return job;
}
