import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteAutosave, recoveries } from "@/lib/calendar/note-autosave";
import { apiFetch } from "@/lib/api-transport";
import { clearClientCache } from "@/lib/client-data-cache";
import type { CalendarNote, NoteInput } from "@/lib/calendar/contracts";
vi.mock("@/lib/api-transport", async () => ({
  ...(await vi.importActual("@/lib/api-transport")),
  apiFetch: vi.fn(),
}));
const initial: NoteInput = {
  dateKey: "2026-10-18",
  title: "Journal",
  document: { version: 1, text: "First" },
};
const stored = (
  data: NoteInput = initial,
  revision = 1,
  id = "548335cf-214b-41d5-a234-58b629929423"
): CalendarNote => ({ ...data, id, revision, createdAt: "", updatedAt: "" });
const response = (note: CalendarNote) =>
  new Response(JSON.stringify({ note }), { status: 200 });
let jobs: NoteAutosave[] = [];
const job = (note?: CalendarNote) => {
  const value = new NoteAutosave(7, initial, note);
  jobs.push(value);
  return value;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage,
  });
  localStorage.clear();
});
afterEach(() => {
  jobs.forEach((j) => j.discard());
  jobs = [];
  vi.useRealTimers();
});
describe("durable note autosave", () => {
  it("batches edits and advances revisions while preserving edits made during a save", async () => {
    const value = job();
    let finish!: (r: Response) => void;
    vi.mocked(apiFetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = { ...initial, title: " First title " };
    value.change(first);
    const saving = value.flush();
    await Promise.resolve();
    value.change({ ...first, title: "Second title" });
    vi.mocked(apiFetch).mockResolvedValueOnce(
      response(
        stored({ ...initial, title: "Second title" }, 2, value.record.id)
      )
    );
    finish(
      response(stored({ ...initial, title: "First title" }, 1, value.record.id))
    );
    await saving;
    expect(value.status).toBe("saved");
    expect(value.record.data.title).toBe("Second title");
    expect(value.record.revision).toBe(2);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(vi.mocked(apiFetch).mock.calls[1][1]!.body as string).revision
    ).toBe(1);
    expect(recoveries(7)).toHaveLength(0);
  });
  it("normalizes titles without entering an endless autosave loop", async () => {
    const value = job();
    value.change({ ...initial, title: " Journal " });
    vi.mocked(apiFetch).mockResolvedValueOnce(
      response(stored(initial, 1, value.record.id))
    );
    await value.flush();
    expect(value.record.data.title).toBe("Journal");
    expect(apiFetch).toHaveBeenCalledOnce();
  });
  it("keeps offline drafts owner-scoped and restores them after navigation", async () => {
    const value = job();
    value.change({ ...initial, title: "Offline thought" });
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
    await value.flush();
    expect(value.status).toBe("offline");
    expect(recoveries(7)).toHaveLength(1);
    expect(recoveries(8)).toHaveLength(0);
    const restored = new NoteAutosave(7, initial, undefined, recoveries(7)[0]);
    jobs.push(restored);
    expect(restored.record.data.title).toBe("Offline thought");
    expect(restored.record.id).toBe(value.record.id);
  });
  it("reconciles an acknowledged-late create before saving newer edits", async () => {
    const value = job();
    const first = { ...initial, title: "One" };
    value.change(first);
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("lost response"));
    await value.flush();
    value.change({ ...initial, title: "Two" });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(response(stored(first, 1, value.record.id)))
      .mockResolvedValueOnce(
        response(stored({ ...initial, title: "Two" }, 2, value.record.id))
      );
    await value.flush();
    expect(value.status).toBe("saved");
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain("?id=");
    expect(vi.mocked(apiFetch).mock.calls[2][1]?.method).toBe("PATCH");
  });
  it("preserves conflicts and saves a separate copy without overwriting remote ink", async () => {
    const value = job(stored());
    value.change({ ...initial, title: "Local" });
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(
        response(stored({ ...initial, title: "Remote" }, 2))
      );
    await value.flush();
    expect(value.status).toBe("conflict");
    expect(value.record.data.title).toBe("Local");
    const id = value.record.id;
    vi.mocked(apiFetch).mockImplementationOnce(async (_, init) => {
      const input = JSON.parse(init!.body as string);
      return response(stored(input.data, 1, input.id));
    });
    await value.saveCopy();
    expect(value.record.id).not.toBe(id);
    expect(value.status).toBe("saved");
    expect(value.record.data.title).toBe("Local (copy)");
  });
  it("stops stale account writes and clears recoveries on logout", async () => {
    const value = job();
    value.change({ ...initial, title: "Pending" });
    value.persist();
    clearClientCache();
    await value.flush();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(recoveries(7)).toHaveLength(0);
  });
});
