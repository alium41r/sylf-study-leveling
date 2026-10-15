import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConversationPanel from "@/app/system/components/ConversationPanel";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import type { QuotaInfo } from "@/app/components/AiPlannerModal";

vi.mock("@/lib/client-data-cache", () => ({ fetchCachedJSON: vi.fn() }));
const props = () => ({
  sessionId: null, sessionTitle: "New chat", chatQuota: null,
  modelPref: "gemini" as const, isDevMode: false,
  onSessionCreated: vi.fn(), onQuotaRefresh: vi.fn(), onOpenPlanner: vi.fn(),
});
const response = () => ({
  ok: true, status: 200, json: async () => ({
    sessionId: 9,
    userMessage: { id: 1, type: "USER", content: "A short introduction to Sylf", createdAt: new Date().toISOString() },
    aiMessage: { id: 2, type: "INFO", content: "Sylf helps you plan your studies and stay focused.", createdAt: new Date().toISOString() },
  }),
});
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  vi.mocked(fetchCachedJSON).mockResolvedValue({ messages: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Sylvie workspace conversation", () => {
  it("welcomes simply and sends minimal context while preserving model selection", async () => {
    render(<ConversationPanel {...props()} />);
    expect(screen.getByText("What can I help you with?")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "A short introduction to Sylf" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("Sylf helps you plan your studies and stay focused.")).toBeInTheDocument());
    const request = vi.mocked(fetch).mock.calls[0][1];
    const body = request?.body as FormData;
    expect(body.get("message")).toBe("A short introduction to Sylf");
    expect(body.get("modelPreference")).toBe("gemini");
    expect(JSON.parse(String(body.get("pageContext")))).toEqual({ path: "/system" });
    expect(body.has("contextOverride")).toBe(false);
  });

  it("can confirm a pending change after the normal chat quota is exhausted", async () => {
    vi.mocked(fetchCachedJSON).mockResolvedValue({ messages: [{
      id: 2, type: "INFO", content: "An earlier request.", createdAt: new Date(Date.now() - 1000).toISOString(),
      pendingAction: { token: "superseded-action", summary: "An outdated change." },
    }, {
      id: 3, type: "INFO", content: "Please review this change.", createdAt: new Date().toISOString(),
      pendingAction: { token: "signed-action", summary: "Move Biology review to Friday." },
    }] });
    render(<ConversationPanel {...props()} sessionId={9} chatQuota={{ remaining: 0, unlimited: false } as QuotaInfo} />);
    const confirm = await screen.findByRole("button", { name: "Confirm change" });
    expect(screen.queryByText("An outdated change.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(body.get("message")).toBe("Confirm change");
    expect(body.get("sessionId")).toBe("9");
    expect(body.get("confirmationToken")).toBe("signed-action");
  });

  it("accepts a Planner request after a quota refusal without hiding the quota notice", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 429, json: async () => ({ message: "Model quota used up." }),
    } as Response);
    render(<ConversationPanel {...props()} chatQuota={{ remaining: 0, unlimited: false } as QuotaInfo} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Explain a difficult concept" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Daily AI message limit reached");
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "Help me plan my study week" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = vi.mocked(fetch).mock.calls[1][1]?.body as FormData;
    expect(body.get("message")).toBe("Help me plan my study week");
    expect(screen.getAllByText(/Planner requests and confirmations are still available/).length).toBeGreaterThan(0);
  });
});
