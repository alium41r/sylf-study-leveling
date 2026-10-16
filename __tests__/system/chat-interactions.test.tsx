import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConversationPanel from "@/app/system/components/ConversationPanel";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import { OUTPUT_LIMIT_NOTICE } from "@/lib/ai/sylvie/completion";
vi.mock("@/lib/client-data-cache", () => ({ fetchCachedJSON: vi.fn(), invalidateClientCache: vi.fn() }));
const encoder = new TextEncoder();
const props = { sessionId: null, sessionTitle: "New chat", chatQuota: null, modelPref: "auto" as const, isDevMode: false, onSessionCreated: vi.fn(), onQuotaRefresh: vi.fn(), onOpenPlanner: vi.fn() };
let controller: ReadableStreamDefaultController<Uint8Array>;
const emit = (event: string, value: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
function begin() { fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain energy" } }); fireEvent.click(screen.getByRole("button", { name: "Send" })); }
beforeEach(() => {
  vi.mocked(fetchCachedJSON).mockReset().mockResolvedValue({ messages: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "Content-Type": "text/event-stream" } })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("shared conversation continuity", () => {
  it("labels a capped reply outside incomplete math markup and restores the notice from history", async () => {
    const view = render(<ConversationPanel {...props} />); begin();
    await act(async () => { emit("result", { sessionId: 9, aiMessage: { id: 7, content: "Hence $$ (u cos", truncated: true } }); controller.close(); });
    await screen.findByText(OUTPUT_LIMIT_NOTICE);
    expect(document.querySelector('[data-status="incomplete"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeEnabled();
    view.unmount();
    vi.mocked(fetchCachedJSON).mockResolvedValue({ messages: [{ id: 7, type: "INFO", content: "Hence $$ (u cos", truncated: true, createdAt: new Date().toISOString() }] });
    render(<ConversationPanel {...props} sessionId={9} />);
    await screen.findByText(OUTPUT_LIMIT_NOTICE);
    expect(document.querySelector('[data-status="incomplete"]')).not.toBeNull();
  });
  it("restores a failed prompt but preserves a newer draft", async () => {
    render(<ConversationPanel {...props} />); begin();
    expect(screen.getByRole("textbox")).toHaveValue("");
    await act(async () => { emit("error", { status: 503, error: "Fixture outage" }); controller.close(); });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Explain energy"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New draft" } });
    await act(async () => { emit("error", { status: 503, error: "Fixture outage" }); controller.close(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    expect(screen.getByRole("textbox")).toHaveValue("New draft");
  });
  it("clears a draft on conversation switch and never restores a stale failed send", async () => {
    const view = render(<ConversationPanel {...props} sessionId={1} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    begin();
    view.rerender(<ConversationPanel {...props} sessionId={2} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Thread two" } });
    await act(async () => {});
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(screen.getByRole("textbox")).toHaveValue("Thread two");
    expect(screen.queryByText("Late failure")).not.toBeInTheDocument();
  });
  it("keeps a shared history read alive through Strict Mode subscription cleanup", async () => {
    const cache = await vi.importActual<typeof import("@/lib/client-data-cache")>("@/lib/client-data-cache");
    cache.clearClientCache();
    vi.mocked(fetchCachedJSON).mockImplementation(cache.fetchCachedJSON);
    let complete!: () => void;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      complete = () => resolve(Response.json({ messages: [{ id: 31, content: "Shared history survives", type: "INFO", createdAt: new Date().toISOString() }] }));
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    render(<StrictMode><ConversationPanel {...props} sessionId={7} /></StrictMode>);
    await act(async () => complete());
    await screen.findByText("Shared history survives");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    cache.clearClientCache();
  });
  it("adopts the first session without history reload/blur and keeps message DOM stable", async () => {
    function Controlled() {
      const [sessionId, setSessionId] = useState<number | null>(null);
      return <ConversationPanel {...props} sessionId={sessionId} onSessionCreated={session => setSessionId(session.id)} />;
    }
    render(<Controlled />); begin();
    const user = screen.getByText("Explain energy").closest("article");
    await act(async () => { emit("session", { sessionId: 9, session: { id: 9, title: "Energy" } }); emit("delta", { text: "Energy moves" }); });
    await screen.findByText("Energy moves");
    const assistant = screen.getByText("Energy moves").closest("article");
    expect(fetchCachedJSON).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading conversation…")).not.toBeInTheDocument();
    await act(async () => { emit("result", { sessionId: 9, session: { id: 9, title: "Energy" }, userMessage: { id: 11, content: "Explain energy" }, aiMessage: { id: 12, content: "Energy moves between systems." } }); controller.close(); });
    await screen.findByText("Energy moves between systems.");
    expect(screen.getByText("Energy moves between systems.").closest("article")).toBe(assistant);
    expect(screen.getByText("Explain energy").closest("article")).toBe(user);
    expect(fetchCachedJSON).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading conversation…")).not.toBeInTheDocument();
  });
  it("does not submit duplicates and keeps a stopped reply while allowing a new draft", async () => {
    render(<ConversationPanel {...props} />); begin();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { emit("delta", { text: "Partial explanation" }); });
    await screen.findByText("Partial explanation");
    fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(screen.getByText("Partial explanation")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("incomplete reply may not be saved");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Another question" } });
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });
  it("rejects stale history and in-flight response updates after switching conversations", async () => {
    let oldHistory!: (value: { messages: { id: number; content: string; type: string; createdAt: string }[] }) => void;
    vi.mocked(fetchCachedJSON).mockImplementationOnce(() => new Promise(resolve => { oldHistory = resolve; }));
    vi.mocked(fetchCachedJSON).mockResolvedValueOnce({ messages: [{ id: 22, content: "Current thread", type: "INFO", createdAt: new Date().toISOString() }] });
    const view = render(<ConversationPanel {...props} sessionId={1} />);
    view.rerender(<ConversationPanel {...props} sessionId={2} />);
    await screen.findByText("Current thread");
    await act(async () => oldHistory({ messages: [{ id: 1, content: "Stale thread", type: "INFO", createdAt: new Date().toISOString() }] }));
    expect(screen.queryByText("Stale thread")).not.toBeInTheDocument();
    begin(); await act(async () => emit("delta", { text: "Old reply" })); await screen.findByText("Old reply");
    vi.mocked(fetchCachedJSON).mockResolvedValueOnce({ messages: [] });
    view.rerender(<ConversationPanel {...props} sessionId={3} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(screen.queryByText("Old reply")).not.toBeInTheDocument();
  });
  it("preserves the reading position during incoming chunks and offers a jump to latest", async () => {
    render(<ConversationPanel {...props} />); begin();
    await act(async () => emit("delta", { text: "First section" })); await screen.findByText("First section");
    const log = screen.getByRole("log");
    Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 300 } });
    log.scrollTop = 80; fireEvent.scroll(log);
    await act(async () => emit("delta", { text: ". A later section." })); await screen.findByText("First section. A later section.");
    expect(log.scrollTop).toBe(80);
    fireEvent.click(screen.getByRole("button", { name: "Latest reply" }));
    expect(log.scrollTop).toBe(1200);
  });
  it("preserves draft newlines/composition and clears interrupted output on fallback", async () => {
    render(<ConversationPanel {...props} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Draft" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true }); fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => emit("delta", { text: "Abandoned output" })); await screen.findByText("Abandoned output");
    await act(async () => { emit("reset", {}); emit("delta", { text: "Recovered answer" }); });
    await screen.findByText("Recovered answer"); expect(screen.queryByText("Abandoned output")).not.toBeInTheDocument();
  });
});
