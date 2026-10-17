import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SettingsProvider } from "@/app/components/SettingsContext";
import { FocusBackgroundsSettingsScreen } from "@/app/settings/focus-backgrounds/components/FocusBackgroundsSettingsScreen";
import { BackdropEditor } from "@/app/settings/focus-backgrounds/components/BackdropEditor";
import type { UseFocusBackgroundReturn } from "@/app/focus/hooks/useFocusBackground";
import type { UserFocusBackgroundClient } from "@/lib/focus-background-types";

const mocks = vi.hoisted(() => ({
  environment: {} as UseFocusBackgroundReturn,
}));
vi.mock("@/app/focus/hooks/useFocusBackground", () => ({
  useFocusBackground: () => mocks.environment,
}));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings/focus-backgrounds",
}));
vi.mock("@/app/focus/components/FocusTimerLayoutPreview", () => ({
  FocusTimerLayoutPreview: ({
    layoutKey,
    timerPosition,
  }: {
    layoutKey: string;
    timerPosition: string;
  }) => (
    <div
      data-testid="timer-preview"
      data-layout={layoutKey}
      data-position={timerPosition}
    />
  ),
}));
const personal: UserFocusBackgroundClient = {
  id: 7,
  userId: 1,
  name: "My coast",
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
  focalX: 0.5,
  focalY: 0.5,
  timerPosition: "auto",
  layoutKey: "landscape",
  fileSize: 2048,
  mimeType: "image/webp",
  createdAt: "2026-10-17T00:00:00Z",
  signedUrl: "/personal.webp",
};
const official = {
  id: 7,
  categoryId: 2,
  name: "Quiet forest",
  storagePath: "forest.webp",
  width: 1920,
  height: 1080,
  aspectRatio: 16 / 9,
  focalX: 0.7,
  focalY: 0.4,
  timerPosition: "left" as const,
  sortOrder: 0,
  isActive: true,
  publicUrl: "/forest.webp",
};
function page() {
  return render(
    <SettingsProvider>
      <FocusBackgroundsSettingsScreen />
    </SettingsProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
  mocks.environment = {
    catalog: {
      categories: [
        {
          id: 2,
          slug: "landscape",
          name: "Landscapes",
          layoutKey: "landscape",
          sortOrder: 0,
          isActive: true,
          backgrounds: [official],
        },
      ],
    },
    activeSource: "classic",
    activeBackground: null,
    activeCustomBackground: null,
    customBackgrounds: [personal],
    customBackgroundQuota: { used: 1, max: 5 },
    customBackgroundsError: null,
    isLoadingCatalog: false,
    isLoadingCustomBackgrounds: false,
    isPreloadingImage: false,
    loadError: null,
    syncError: null,
    selectBackground: vi.fn().mockResolvedValue(true),
    selectCustomBackground: vi.fn().mockResolvedValue(true),
    refreshCustomBackgrounds: vi.fn().mockResolvedValue(undefined),
    clearLoadError: vi.fn(),
  } as unknown as UseFocusBackgroundReturn;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, background: { id: 7 } }),
  });
});
describe("Backdrops discovery and library", () => {
  it("returns keyboard focus to the opener when an editor unmounts", () => {
    page();
    const opener = screen.getByRole("button", { name: "Add backdrop" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Add a backdrop" });
    within(dialog).getByRole("button", { name: "Cancel" }).focus();
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
  it("previews without persisting and applies through the canonical selector only on request", async () => {
    page();
    expect(
      screen.getByRole("heading", { name: "Backdrops", level: 1 })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Quiet forest" })
    );
    expect(mocks.environment.selectBackground).not.toHaveBeenCalled();
    expect(screen.getByTestId("timer-preview")).toHaveAttribute(
      "data-layout",
      "landscape"
    );
    expect(screen.getByTestId("timer-preview")).toHaveAttribute(
      "data-position",
      "left"
    );
    fireEvent.click(screen.getByRole("button", { name: "Use backdrop" }));
    await waitFor(() =>
      expect(mocks.environment.selectBackground).toHaveBeenCalledWith(
        "landscape",
        official
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Quiet forest is now your timer backdrop."
    );
  });
  it("keeps personal and official IDs distinct and filters the personal library", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: /Your library/ }));
    expect(
      screen.queryByRole("button", { name: "Preview Quiet forest" })
    ).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching backdrops")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview My coast" }));
    fireEvent.click(screen.getByRole("button", { name: "Use backdrop" }));
    await waitFor(() =>
      expect(mocks.environment.selectCustomBackground).toHaveBeenCalledWith(
        personal
      )
    );
  });
  it("blocks applying broken images and can hide the inert timer preview", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Hide timer" }));
    expect(screen.queryByTestId("timer-preview")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview Quiet forest" })
    );
    fireEvent.error(screen.getByRole("img", { name: "Quiet forest" }));
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use backdrop" })).toBeDisabled();
  });
  it("uses authoritative quota and supports library load retries", () => {
    mocks.environment.customBackgroundQuota = { used: 5, max: 5 };
    mocks.environment.customBackgroundsError = "Connection interrupted";
    page();
    expect(screen.getByRole("button", { name: "Add backdrop" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Your library/ }));
    expect(screen.getByText(/Library full/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.environment.refreshCustomBackgrounds).toHaveBeenCalled();
  });
  it("offers a refresh when a private preview expires", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: /Your library/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview My coast" }));
    fireEvent.error(screen.getByRole("img", { name: "My coast" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload library" }));
    expect(mocks.environment.refreshCustomBackgrounds).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use backdrop" })).toBeDisabled();
  });
  it("keeps a backdrop after deletion errors, then falls back to Classic when deleting the active image", async () => {
    mocks.environment.activeSource = "custom";
    mocks.environment.activeCustomBackground = personal;
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Delete failed" }),
    } as Response);
    page();
    fireEvent.click(screen.getByRole("button", { name: "Delete My coast" }));
    const dialog = screen.getByRole("dialog", { name: "Delete backdrop?" });
    expect(
      within(dialog).getByText("Your timer will return to Classic Sylf.")
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete backdrop",
      })
    );
    await within(dialog).findByText("Delete failed");
    expect(mocks.environment.selectBackground).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete backdrop",
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetch).toHaveBeenLastCalledWith("/api/user/focus-backgrounds/7", {
      method: "DELETE",
    });
    expect(mocks.environment.selectBackground).toHaveBeenCalledWith(
      "classic-sylf",
      null
    );
    expect(mocks.environment.refreshCustomBackgrounds).toHaveBeenCalled();
  });
});
describe("Backdrop editor", () => {
  it("preserves metadata, allows keyboard focal positioning, and saves through the existing PATCH", async () => {
    const saved = vi.fn().mockResolvedValue(undefined),
      close = vi.fn();
    render(
      <BackdropEditor background={personal} onSaved={saved} onClose={close} />
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: /Artwork focal point/ }),
      { key: "ArrowRight", shiftKey: true }
    );
    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    fireEvent.click(screen.getByRole("button", { name: "Fantasy" }));
    fireEvent.change(screen.getByLabelText("Backdrop name"), {
      target: { value: "  New coast  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(7));
    expect(fetch).toHaveBeenCalledWith(
      "/api/user/focus-backgrounds/7",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          name: "New coast",
          focalX: 0.6,
          focalY: 0.5,
          timerPosition: "right",
          layoutKey: "fantasy",
        }),
      })
    );
    expect(close).toHaveBeenCalled();
  });
  it("rejects invalid formats before upload and dismisses with Escape cancellation", () => {
    const close = vi.fn();
    render(<BackdropEditor onSaved={vi.fn()} onClose={close} />);
    fireEvent.change(screen.getByLabelText("Choose backdrop image"), {
      target: {
        files: [new File(["GIF"], "animated.gif", { type: "image/gif" })],
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "GIFs aren’t supported"
    );
    expect(
      screen.getByRole("button", { name: "Add to library" })
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true })
    );
    expect(close).toHaveBeenCalled();
  });
});
