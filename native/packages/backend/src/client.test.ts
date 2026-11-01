import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BackendError, describeFailure } from "./errors";
import { createBackendClient, type Transport } from "./client";
import { createConnectivity } from "./connectivity";

const schema = z.object({ ok: z.boolean() });
const good = () => Response.json({ ok: true });
const client = (transport: Transport | null, extra = {}) => createBackendClient({ transport, sleep: async () => undefined, random: () => 0.5, ...extra });
const failureOf = async (work: Promise<unknown>) => { try { await work; } catch (error) { return error as BackendError; } throw new Error("expected a failure"); };

describe("errors", () => {
  it.each([[400, "invalid"], [401, "signed-out"], [403, "forbidden"], [404, "not-found"], [409, "conflict"], [422, "invalid"], [429, "rate-limited"], [500, "server"], [503, "server"]])("classifies %i as %s", async (status, kind) => {
    const failure = await failureOf(client(async () => Response.json({ error: status === 401 ? "Unauthorized" : "Nope" }, { status })).send("POST", "/api/x"));
    expect(failure.kind).toBe(kind);
    expect(failure.detail.status).toBe(status);
  });

  it("never shows a 5xx's text, because it can hold internals", async () => {
    const failure = await failureOf(client(async () => Response.json({ error: "connect ECONNREFUSED 10.0.0.1" }, { status: 500 })).send("POST", "/api/x"));
    expect(failure.message).not.toContain("ECONN");
    expect(describeFailure(failure)).toBe("Sylf had a problem. Try again shortly.");
  });

  it("reads the server's own refusal, including the timer's detail shape", async () => {
    const failure = await failureOf(client(async () => Response.json({ error: "CODE", detail: { message: "This plan changed.", code: "STALE" } }, { status: 409 })).send("POST", "/api/x"));
    expect(failure.message).toBe("This plan changed.");
    expect(failure.detail.code).toBe("STALE");
    expect(describeFailure(failure)).toBe("This plan changed.");
  });

  it("reports a network failure as offline", async () => {
    const connectivity = createConnectivity(async () => false);
    const failure = await failureOf(client(async () => { throw new TypeError("Network request failed"); }, { connectivity }).send("POST", "/api/x"));
    expect(failure.kind).toBe("offline");
    expect(connectivity.state()).toBe("offline");
  });

  it("reads Electron's host answering for an unreachable server as offline", async () => {
    const failure = await failureOf(client(async () => Response.json({ code: "backend_unreachable" }, { status: 503 }), {}).get("/api/x", schema, { retries: 0 }));
    expect(failure.kind).toBe("offline");
  });

  it("calls a mismatched answer a contract failure, and not a success with holes in it", async () => {
    const failure = await failureOf(client(async () => Response.json({ other: 1 })).get("/api/x", schema));
    expect(failure.kind).toBe("contract");
  });

  it("copes with a body that is not JSON", async () => {
    expect((await failureOf(client(async () => new Response("<html>", { status: 502 })).send("POST", "/api/x"))).kind).toBe("server");
  });

  it("reports the end of a session, and only that", async () => {
    const onSignedOut = vi.fn();
    expect((await failureOf(client(async () => Response.json({ error: "Sign in to continue.", code: "session_ended" }, { status: 401 }), { onSignedOut }).get("/api/x", schema))).kind).toBe("signed-out");
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("does not sign anyone out for a wrong password on a route that answers 401", async () => {
    const onSignedOut = vi.fn();
    const failure = await failureOf(client(async () => Response.json({ error: "Incorrect current password." }, { status: 401 }), { onSignedOut }).send("PATCH", "/api/user/security", { body: {} }));
    expect(failure.kind).toBe("invalid");
    expect(describeFailure(failure)).toBe("Incorrect current password.");
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("calls a plain 401 signed out, without ending anything by itself", async () => {
    const onSignedOut = vi.fn();
    expect((await failureOf(client(async () => Response.json({ error: "Unauthorized" }, { status: 401 }), { onSignedOut }).get("/api/x", schema))).kind).toBe("signed-out");
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("sends nothing when the build has no backend", async () => {
    const empty = client(null);
    expect(empty.configured).toBe(false);
    expect((await failureOf(empty.get("/api/x", schema))).kind).toBe("not-configured");
    expect((await failureOf(empty.send("POST", "/api/x"))).kind).toBe("not-configured");
    expect((await failureOf(empty.fetch("/api/x"))).kind).toBe("not-configured");
  });
});

describe("retries", () => {
  it("retries a read through a momentary failure", async () => {
    const transport = vi.fn<Transport>().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(good());
    expect(await client(transport).get("/api/x", schema)).toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("gives up after its retries", async () => {
    const transport = vi.fn<Transport>(async () => new Response("{}", { status: 503 }));
    expect((await failureOf(client(transport).get("/api/x", schema))).kind).toBe("server");
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("does not retry a refusal", async () => {
    const transport = vi.fn<Transport>(async () => Response.json({}, { status: 403 }));
    await failureOf(client(transport).get("/api/x", schema));
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After, and leaves a long wait to the caller", async () => {
    const sleep = vi.fn(async () => undefined);
    const transport = vi.fn<Transport>().mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } })).mockResolvedValueOnce(good());
    await client(transport, { sleep }).get("/api/x", schema);
    expect(sleep).toHaveBeenCalledWith(2000);
    const slow = vi.fn<Transport>(async () => new Response("{}", { status: 429, headers: { "Retry-After": "60" } }));
    const failure = await failureOf(client(slow).get("/api/y", schema));
    expect(slow).toHaveBeenCalledTimes(1);
    expect(failure.detail.retryAfterMs).toBe(60_000);
  });

  it("never retries a mutation: a timed-out write has an unknown outcome", async () => {
    const transport = vi.fn<Transport>(async () => new Response("{}", { status: 503 }));
    await failureOf(client(transport).send("POST", "/api/x", { body: {} }));
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not keep hammering when it already knows it is offline", async () => {
    const connectivity = createConnectivity(async () => false);
    connectivity.report(false);
    const transport = vi.fn<Transport>(async () => { throw new TypeError("offline"); });
    await failureOf(client(transport, { connectivity }).get("/api/x", schema));
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("timeouts and cancellation", () => {
  const hang: Transport = (_path, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); });

  it("times out a read", async () => {
    expect((await failureOf(client(hang).get("/api/x", schema, { timeoutMs: 5, retries: 0 }))).kind).toBe("timeout");
  });

  it("times out a slow body, not only a slow connection", async () => {
    const stalled: Transport = async () => new Response(new ReadableStream({ start() { /* Never sends a byte. */ } }));
    expect((await failureOf(client(stalled).send("POST", "/api/x", { timeoutMs: 5 }))).kind).toBe("timeout");
  });

  it("reports cancellation as cancellation, and not as a failure", async () => {
    const controller = new AbortController();
    const work = client(hang).get("/api/x", schema, { signal: controller.signal });
    controller.abort();
    expect((await failureOf(work)).kind).toBe("cancelled");
  });

  it("refuses at once when already cancelled", async () => {
    const transport = vi.fn(hang);
    const controller = new AbortController(); controller.abort();
    expect((await failureOf(client(transport).get("/api/x", schema, { signal: controller.signal }))).kind).toBe("cancelled");
    expect(transport).not.toHaveBeenCalled();
  });

  it("cancels a mutation", async () => {
    const controller = new AbortController();
    const work = client(hang).send("POST", "/api/x", { signal: controller.signal });
    controller.abort();
    expect((await failureOf(work)).kind).toBe("cancelled");
  });
});

describe("deduplication", () => {
  it("shares one request between concurrent reads of one path", async () => {
    const transport = vi.fn<Transport>(async () => { await new Promise((done) => setTimeout(done, 5)); return good(); });
    const api = client(transport);
    const results = await Promise.all([api.get("/api/x", schema), api.get("/api/x", schema), api.get("/api/x", schema)]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("asks again once the first has finished", async () => {
    const transport = vi.fn<Transport>(async () => good());
    const api = client(transport);
    await api.get("/api/x", schema); await api.get("/api/x", schema);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("does not share across different paths", async () => {
    const transport = vi.fn<Transport>(async () => good());
    const api = client(transport);
    await Promise.all([api.get("/api/x", schema), api.get("/api/y", schema)]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("keeps the request alive while anyone still wants it, and cancels it when the last one leaves", async () => {
    let aborted = false;
    const transport: Transport = (_path, init) => new Promise((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); });
      setTimeout(() => resolve(good()), 30);
    });
    const api = client(transport);
    const first = new AbortController(); const second = new AbortController();
    const leaving = api.get("/api/x", schema, { signal: first.signal });
    const staying = api.get("/api/x", schema, { signal: second.signal });
    first.abort();
    expect((await failureOf(leaving)).kind).toBe("cancelled");
    expect(aborted).toBe(false);
    second.abort();
    expect((await failureOf(staying)).kind).toBe("cancelled");
    expect(aborted).toBe(true);
  });
});

describe("changing accounts", () => {
  it("cannot hand the next person a read that was in flight for the last", async () => {
    const answers: ((response: Response) => void)[] = [];
    const transport: Transport = (_path, init) => new Promise((resolve, reject) => { answers.push(resolve); init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))); });
    const api = client(transport);
    const first = api.get("/api/user/stats", schema, { retries: 0 });
    api.reset();
    expect((await failureOf(first)).kind).not.toBe("contract");
    const second = api.get("/api/user/stats", schema, { retries: 0 });
    await new Promise((done) => setTimeout(done, 0));
    expect(answers).toHaveLength(2);
    answers[1](good());
    expect(await second).toEqual({ ok: true });
  });
});

describe("assets and streams", () => {
  it("resolves relative catalog URLs, and leaves absolute ones alone", () => {
    const api = createBackendClient({ transport: null, assetUrl: (path) => `https://sylf.example${path}` });
    expect(api.assetUrl("/audio/rain.mp3")).toBe("https://sylf.example/audio/rain.mp3");
    expect(api.assetUrl("uploads/a.png")).toBe("https://sylf.example/uploads/a.png");
    expect(api.assetUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(api.assetUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("delivers a stream as it arrives", async () => {
    const encoder = new TextEncoder();
    const transport: Transport = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode("data: one\n\n")); controller.enqueue(encoder.encode("data: two\n\n")); controller.close(); } }));
    const chunks: string[] = [];
    await client(transport).stream("/api/x", {}, (chunk) => chunks.push(chunk));
    expect(chunks.join("")).toBe("data: one\n\ndata: two\n\n");
  });

  it("reports a refused stream like any other refusal", async () => {
    const failure = await failureOf(client(async () => Response.json({}, { status: 401 })).stream("/api/x", {}, () => undefined));
    expect(failure.kind).toBe("signed-out");
  });

  it("learns from the journal's raw requests when the server is gone, or the session is over", async () => {
    const reports: boolean[] = [];
    const connectivity = { state: () => "online" as const, subscribe: () => () => undefined, report: (reached: boolean) => { reports.push(reached); }, wait: () => () => undefined, wake: () => undefined };
    let ended = 0;
    const answers = [new Response("{}", { status: 200 }), new Response(JSON.stringify({ code: "backend_unreachable" }), { status: 503 }), new Response(JSON.stringify({ code: "session_ended" }), { status: 401 })];
    const client = createBackendClient({ transport: async () => answers.shift()!, connectivity, onSignedOut: () => { ended++; } });
    await client.fetch("/api/sessions");
    await client.fetch("/api/sessions");
    await client.fetch("/api/sessions");
    await new Promise((done) => setTimeout(done, 0));
    expect(reports).toEqual([true, false]);
    expect(ended).toBe(1);
  });
});
