import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-transport";
import { clearClientCache } from "@/lib/client-data-cache";
import {
  newEventOperation,
  pendingEventOperations,
  runEventOperation,
} from "@/lib/calendar/event-operations";
vi.mock("@/lib/api-transport", () => ({
  apiFetch: vi.fn(),
  fetchWithTimeout: (
    fetcher: typeof fetch,
    path: string,
    options: RequestInit
  ) => fetcher(path, options),
}));
const input = {
  kind: "event" as const,
  id: "548335cf-214b-41d5-a234-58b629929423",
  revision: 1,
  data: {
    title: "Class",
    description: "",
    color: "BLUE" as const,
    allDay: true,
    startDate: "2026-10-19",
    endDate: "2026-10-20",
    startsAt: null,
    endsAt: null,
    timezone: "UTC",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
describe("recoverable personal event operations", () => {
  it("stores a failed operation by owner and reuses its exact mutation identity", async () => {
    const operation = newEventOperation(1, "POST", input, "Class");
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
    await expect(runEventOperation(operation)).rejects.toThrow("Offline");
    expect(pendingEventOperations(1)).toEqual([operation]);
    expect(pendingEventOperations(2)).toEqual([]);
    vi.mocked(apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ event: input.data }))
    );
    await runEventOperation(pendingEventOperations(1)[0]);
    expect(
      JSON.parse(vi.mocked(apiFetch).mock.calls[1][1]!.body as string)
        .mutationId
    ).toBe(operation.body.mutationId);
    expect(pendingEventOperations(1)).toEqual([]);
  });
  it("clears private retries and ignores acknowledgements from an ended session", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      })
    );
    const operation = newEventOperation(1, "PATCH", input, "Class");
    const saving = runEventOperation(operation);
    clearClientCache();
    resolve(new Response(JSON.stringify({ event: input.data })));
    await expect(saving).rejects.toThrow("session changed");
    expect(pendingEventOperations(1)).toEqual([]);
  });
});
