import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemOverlay from "@/app/components/system/SystemOverlay";
import { resolvePresence } from "@/app/components/system/page-presence";
import type { QuotaInfo } from "@/app/components/AiPlannerModal";
import { clearClientCache } from "@/lib/client-data-cache";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  return {
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: Object.fromEntries(["section", "div"].map(tag => [tag,
      React.forwardRef<HTMLElement, Record<string, unknown>>(function MotionElement(props, ref) {
        const domProps = { ...props };
        for (const key of ["initial", "animate", "exit", "transition"]) delete domProps[key];
        return React.createElement(tag, { ...domProps, ref });
      }),
    ])),
  };
});

const goals = resolvePresence("/goals", "")!;
const calendar = resolvePresence("/calendar", "")!;
function props() {
  return {
    open: true, presence: goals, chatQuota: null, sessionId: null,
    onSessionChange: vi.fn(), onQuotaRefresh: vi.fn(), onOpenWorkspace: vi.fn(),
    onOpenPlanner: vi.fn(), onClose: vi.fn(),
  };
}
const input = () => screen.getByRole("textbox", { name: "Message Sylvie" });
const successfulReply = () => vi.fn(async () => ({
  ok: true, status: 200, json: async () => ({ sessionId: 42, reply: "A useful answer." }),
}));
beforeEach(() => vi.stubGlobal("fetch", successfulReply()));
afterEach(() => { cleanup(); clearClientCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Minimal floating conversation", () => {
  it("sends through the existing API, continues the session and refreshes quota", async () => {
    const callbacks = props();
    render(<SystemOverlay {...callbacks} />);
    fireEvent.change(input(), { target: { value: "Help with my goal" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(fetch).toHaveBeenCalledWith("/api/system-messages/chat", expect.objectContaining({
      method: "POST", body: JSON.stringify({ message: "Help with my goal", pageContext: { path: "/goals" } }),
    }));
    expect(screen.getByText("Help with my goal")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("A useful answer.")).toBeInTheDocument());
    expect(callbacks.onSessionChange).toHaveBeenCalledWith(42, null);
    expect(callbacks.onQuotaRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(callbacks.onSessionChange).toHaveBeenLastCalledWith(null, null);
    expect(screen.queryByText("Help with my goal")).not.toBeInTheDocument();
    expect(screen.getByText(goals.greeting)).toBeInTheDocument();
  });

  it("preserves Shift+Enter and composition input; suggestions still send", async () => {
    render(<SystemOverlay {...props()} />);
    fireEvent.change(input(), { target: { value: "Draft" } });
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Goal progress" }));
    await waitFor(() => expect(screen.getByText("A useful answer.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ message: "Goal progress", pageContext: { path: "/goals" } }) }));
  });

  it("uses the current greeting before chatting and preserves a thread after a context change", async () => {
    const callbacks = props();
    const view = render(<SystemOverlay {...callbacks} />);
    view.rerender(<SystemOverlay {...callbacks} presence={calendar} />);
    expect(screen.queryByText(goals.greeting)).not.toBeInTheDocument();
    expect(screen.getByText(calendar.greeting)).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "My schedule" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("A useful answer.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ message: "My schedule", pageContext: { path: "/calendar" } }),
    }));
    view.rerender(<SystemOverlay {...callbacks} presence={goals} />);
    expect(screen.getByText("My schedule")).toBeInTheDocument();
    expect(screen.getByText(/Now viewing/)).toBeInTheDocument();
  });

  it("preserves the selected quests tab as minimal page context", async () => {
    const quests = resolvePresence("/goals", "tab=quests")!;
    render(<SystemOverlay {...props()} presence={quests} sessionId={42} />);
    await waitFor(() => expect(input()).toBeEnabled());
    fireEvent.change(input(), { target: { value: "Help with this task" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ message: "Help with this task", sessionId: 42, pageContext: { path: "/goals?tab=quests" } }),
    }));
    await waitFor(() => expect(screen.getByText("A useful answer.")).toBeInTheDocument());
  });

  it("keeps planner/workspace actions accessible through minimal controls", () => {
    const callbacks = props();
    render(<SystemOverlay {...callbacks} sessionId={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("button", { name: "Create a study plan" }));
    expect(callbacks.onOpenPlanner).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Create a study plan" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open in Sylvie workspace" }));
    expect(callbacks.onOpenWorkspace).toHaveBeenCalledWith(42);
  });

  it("traps keyboard focus, closes options first on Escape, and unlocks scrolling", async () => {
    const callbacks = props();
    const view = render(<SystemOverlay {...callbacks} />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog).toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Attach file" }));
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "New conversation" })).not.toBeInTheDocument();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.documentElement.style.overflow).not.toBe("hidden");
  });

  it("keeps the composer usable at exhausted model quota and leaves enforcement to the server", async () => {
    render(<SystemOverlay {...props()} chatQuota={{ remaining: 0, unlimited: false } as QuotaInfo} />);
    expect(input()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Planner requests and confirmations are still available");
    expect(screen.getByRole("button", { name: "Goal progress" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "Help me plan my study week" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("A useful answer.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ message: "Help me plan my study week", pageContext: { path: "/goals" } }),
    }));

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 429, json: async () => ({ message: "Daily AI message limit reached." }),
    })));
    fireEvent.change(input(), { target: { value: "Explain quantum mechanics in detail" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Daily AI message limit reached"));
    expect(input()).toBeEnabled();
    fireEvent.change(input(), { target: { value: "Introduce Sylf briefly" } });
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("previews a mutation and confirms it after ordinary chat quota is exhausted", async () => {
    const callbacks = props();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({
        sessionId: 42, reply: "Please review this change.",
        pendingAction: { token: "signed-action", summary: "Move Biology review to Friday." },
      }),
    })));
    const view = render(<SystemOverlay {...callbacks} sessionId={42} />);
    await waitFor(() => expect(input()).toBeEnabled());
    fireEvent.change(input(), { target: { value: "Move my review" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm change" })).toBeEnabled());
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    view.rerender(<SystemOverlay {...callbacks} sessionId={42} chatQuota={{ remaining: 0, unlimited: false } as QuotaInfo} />);
    expect(input()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ message: "Confirm change", sessionId: 42, pageContext: { path: "/goals" }, confirmationToken: "signed-action" }),
    }));
  });

  it("allows stopping an in-flight reply and keeps error feedback visible", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
    })));
    render(<SystemOverlay {...props()} />);
    fireEvent.change(input(), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    expect(screen.getByRole("button", { name: "New conversation" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
    await waitFor(() => expect(screen.getByText(/Stopped\. An incomplete reply/)).toBeInTheDocument());
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    fireEvent.change(input(), { target: { value: "Retry" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument());
  });
});
