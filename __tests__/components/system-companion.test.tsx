import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemAIProvider } from "@/app/components/system/SystemAIProvider";
import Sidebar from "@/app/components/Sidebar";
import type { UserStats } from "@/app/components/AuthProvider";

const state = vi.hoisted(() => ({
  user: { id: 1, username: "scholar", name: "Scholar", level: 1, hunterRank: "E" } as UserStats | null,
  pathname: "/goals",
  searchParams: new URLSearchParams(),
  reducedMotion: false,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => state.searchParams,
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: state.user, logout: vi.fn(), refreshStats: vi.fn() }),
}));
vi.mock("@/app/components/SettingsContext", () => ({
  useSettings: () => ({ openSettings: vi.fn() }),
}));
vi.mock("@/app/components/ProfileModalContext", () => ({
  useProfileModal: () => ({ openProfile: vi.fn() }),
}));
vi.mock("@/lib/client-data-cache", () => ({
  fetchCachedJSON: vi.fn(async () => ({})),
  invalidateClientCache: vi.fn(),
}));
vi.mock("@/app/components/AiPlannerModal", () => ({ AiPlannerModal: () => null }));
vi.mock("@/app/components/system/SystemOverlay", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) => open ? (
    <div role="dialog" aria-label="Sylvie"><button onClick={onClose}>Close conversation</button></div>
  ) : null,
}));
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = Object.fromEntries(["button", "span", "div"].map(tag => [tag,
    React.forwardRef<HTMLElement, Record<string, unknown>>(function MotionElement(props, ref) {
      const domProps = { ...props };
      for (const key of ["initial", "animate", "exit", "transition", "whileHover", "whileTap", "layout"]) delete domProps[key];
      domProps.onMouseEnter = domProps.onHoverStart;
      domProps.onMouseLeave = domProps.onHoverEnd;
      delete domProps.onHoverStart;
      delete domProps.onHoverEnd;
      return React.createElement(tag, { ...domProps, ref });
    }),
  ]));
  return { motion, AnimatePresence: ({ children }: { children: React.ReactNode }) => children, useReducedMotion: () => state.reducedMotion };
});

function App({ mobile = false, collapsed = false, onClose = vi.fn() } = {}) {
  return <SystemAIProvider><Sidebar isCollapsed={collapsed} setIsCollapsed={vi.fn()} mobile={mobile} onCloseMobile={onClose} /></SystemAIProvider>;
}
const companion = () => document.querySelector("[data-sylf-companion]");
const launcher = () => screen.getByRole("button", { name: /Ask Sylvie/ });

beforeEach(() => {
  localStorage.clear();
  state.user = { id: 1, username: "scholar", name: "Scholar", level: 1, hunterRank: "E" } as UserStats;
  state.pathname = "/goals";
  state.searchParams = new URLSearchParams();
  state.reducedMotion = false;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Floating System companion", () => {
  it("reuses the canonical companion and opens/closes the existing conversation", () => {
    render(<App />);
    expect(companion()).toHaveAttribute("data-expression", "NEUTRAL");
    expect(screen.getByRole("button", { name: "Hide companion" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(launcher());
    expect(screen.getByRole("dialog", { name: "Sylvie" })).toBeInTheDocument();
    expect(companion()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
    expect(launcher()).toBeInTheDocument();
  });

  it("smiles and waves on hover/focus and returns to idle without replacing the art", () => {
    render(<App />);
    const svg = companion()?.querySelector("svg");
    fireEvent.mouseEnter(launcher());
    expect(launcher()).toHaveAttribute("data-attentive", "true");
    expect(companion()).toHaveAttribute("data-expression", "HAPPY");
    expect(companion()).toHaveAttribute("data-action", "HELLO");
    fireEvent.focus(launcher());
    fireEvent.mouseLeave(launcher());
    expect(companion()).toHaveAttribute("data-expression", "HAPPY");
    fireEvent.blur(launcher());
    expect(companion()).toHaveAttribute("data-expression", "NEUTRAL");
    expect(companion()?.querySelector("svg")).toBe(svg);
  });

  it("remembers visibility across visits and keeps different accounts isolated", () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Hide companion" }));
    expect(localStorage.getItem("sylf:companion-visible:1")).toBe("false");
    expect(companion()).not.toBeInTheDocument();
    view.unmount();
    const nextVisit = render(<App collapsed />);
    expect(companion()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show companion" })).toHaveAttribute("aria-pressed", "false");
    state.user = { ...state.user!, id: 2 };
    nextVisit.rerender(<App collapsed />);
    expect(companion()).toBeInTheDocument();
    state.user = { ...state.user!, id: 1 };
    nextVisit.rerender(<App collapsed />);
    expect(companion()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show companion" }));
    expect(companion()).toBeInTheDocument();
  });

  it("syncs changes from another tab and hides on logout or unsupported routes", () => {
    const view = render(<App />);
    act(() => {
      localStorage.setItem("sylf:companion-visible:1", "false");
      window.dispatchEvent(new StorageEvent("storage", { key: "sylf:companion-visible:1" }));
    });
    expect(companion()).not.toBeInTheDocument();
    act(() => {
      localStorage.removeItem("sylf:companion-visible:1");
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(companion()).toBeInTheDocument();
    state.pathname = "/system";
    view.rerender(<App />);
    expect(companion()).not.toBeInTheDocument();
    state.pathname = "/goals";
    state.user = null;
    view.rerender(<App />);
    expect(companion()).not.toBeInTheDocument();
  });

  it("keeps the toggle usable without storage and closes the mobile drawer", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    const onClose = vi.fn();
    render(<App mobile onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide companion" }));
    expect(companion()).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Show companion" }));
    expect(companion()).toBeInTheDocument();
  });

  it("respects reduced motion while retaining the expression change", () => {
    state.reducedMotion = true;
    render(<App />);
    expect(companion()).toHaveAttribute("data-motion", "none");
    fireEvent.focus(launcher());
    expect(companion()).toHaveAttribute("data-expression", "HAPPY");
  });
});
