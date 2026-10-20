import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppearanceSettingsScreen } from "@/app/settings/appearance/components/AppearanceSettingsScreen";
import { SettingsProvider } from "@/app/components/SettingsContext";
import { DEFAULT_ACCENT_HEX, DEFAULT_DARK_BG_HEX } from "@/lib/color-utils";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/settings/appearance",
}));

// Mock AuthProvider
const mockMutateUser = vi.fn();
let mockUser: {
  id: number;
  username: string;
  activeTheme?: string;
  activeBackground?: string;
} | null = {
  id: 1,
  username: "SungJinwoo",
  activeTheme: "cyberpunk", // Legacy ID
  activeBackground: "void", // Legacy ID
};
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: mockUser,
    mutateUser: mockMutateUser,
  }),
}));

describe("Appearance Settings Screen", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUser = {
      id: 1,
      username: "SungJinwoo",
      activeTheme: "cyberpunk",
      activeBackground: "void",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, user: {} }),
    } as unknown as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with App Mode, Live preview, Accent Color, and Background Color sections", async () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    expect(
      screen.getByRole("heading", { name: "Appearance", level: 1 })
    ).toBeDefined();
    expect(
      screen.getByRole("region", { name: "Appearance preview" })
    ).toBeDefined();
    expect(screen.getByText("App mode")).toBeDefined();
    expect(screen.getByText("Accent Color")).toBeDefined();
    expect(screen.getByText("Background Color")).toBeDefined();
    expect(screen.getByText(/Back to System Hub/i)).toBeDefined();
  });

  it("migrates legacy theme 'cyberpunk' to #7c3aed and legacy background 'void' to dark void default", async () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    // Accent Hex input should display #7C3AED (canonical resolved hex for cyberpunk)
    const accentInput = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    expect(accentInput.value.toLowerCase()).toBe("#7c3aed");

    // Background Hex input should display #090D16 (canonical dark void)
    const bgInput = screen.getByLabelText(
      "Background Color hex code"
    ) as HTMLInputElement;
    expect(bgInput.value.toLowerCase()).toBe(DEFAULT_DARK_BG_HEX.toLowerCase());
  });

  it("allows tweaking draft mode and applies upon clicking Apply changes", async () => {
    const modeListener = vi.fn();
    window.addEventListener("mode-updated", modeListener);

    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const lightBtn = screen.getByRole("button", { name: /light/i });
    fireEvent.click(lightBtn);

    // Unsaved changes banner appears
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    // Has not committed to storage before clicking Save
    expect(localStorage.getItem("app_mode")).toBeNull();

    // Click Apply changes
    const saveBtn = screen.getByRole("button", { name: /apply changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(localStorage.getItem("app_mode")).toBe("light");
      expect(document.documentElement.getAttribute("data-mode")).toBe("light");
      expect(modeListener).toHaveBeenCalled();
    });

    window.removeEventListener("mode-updated", modeListener);
  });

  it("updates draft accent and background and applies both on Save", async () => {
    const themeListener = vi.fn();
    const bgListener = vi.fn();
    window.addEventListener("theme-updated", themeListener);
    window.addEventListener("background-updated", bgListener);

    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const accentInput = screen.getByLabelText("Accent Color hex code");
    fireEvent.change(accentInput, { target: { value: "#10b981" } });

    const bgInput = screen.getByLabelText("Background Color hex code");
    fireEvent.change(bgInput, { target: { value: "#000000" } });

    expect(screen.getByText("Unsaved changes")).toBeDefined();
    // Not committed yet
    expect(localStorage.getItem("app_theme")).toBeNull();
    expect(localStorage.getItem("app_background")).toBeNull();

    // Click Apply changes
    const saveBtn = screen.getByRole("button", { name: /apply changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(localStorage.getItem("app_theme")).toBe("#10b981");
      expect(localStorage.getItem("app_background")).toBe("#000000");
      expect(themeListener).toHaveBeenCalled();
      expect(bgListener).toHaveBeenCalled();
    });

    // Check API calls
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/cosmetics",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ category: "THEME", itemKey: "#10b981" }),
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/cosmetics",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ category: "BACKGROUND", itemKey: "#000000" }),
      })
    );

    window.removeEventListener("theme-updated", themeListener);
    window.removeEventListener("background-updated", bgListener);
  });

  it("discards unsaved drafts when Discard button is clicked", async () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const accentInput = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(accentInput, { target: { value: "#ef4444" } });
    expect(accentInput.value).toBe("#EF4444");

    const discardBtn = screen.getByRole("button", { name: /discard/i });
    fireEvent.click(discardBtn);

    // Reverts to original #7c3aed
    expect(accentInput.value.toLowerCase()).toBe("#7c3aed");
  });

  it("resets colors back to defaults when reset button is clicked", async () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const accentInput = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(accentInput, { target: { value: "#ef4444" } });

    // Click Reset for Accent
    const resetButtons = screen.getAllByRole("button", { name: /reset/i });
    fireEvent.click(resetButtons[0]);

    expect(accentInput.value.toLowerCase()).toBe(DEFAULT_ACCENT_HEX);
  });

  it("keeps custom canvas colors when changing mode and supports keyboard color editing", () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );
    const background = screen.getByLabelText(
      "Background Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(background, { target: { value: "#123d3c" } });
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(background.value.toLowerCase()).toBe("#123d3c");
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Custom Accent Color" })
    );
    const hue = screen.getByRole("slider", { name: "Accent Color hue slider" });
    const before = hue.getAttribute("aria-valuenow");
    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    expect(hue.getAttribute("aria-valuenow")).not.toBe(before);
    expect(localStorage.getItem("app_theme")).toBeNull();
  });

  it("reverts invalid hex input on blur and receives preference changes from other tabs", () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );
    const accent = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(accent, { target: { value: "#12" } });
    fireEvent.blur(accent);
    expect(accent.value.toLowerCase()).toBe("#7c3aed");
    fireEvent(
      window,
      new StorageEvent("storage", { key: "app_theme", newValue: "#345678" })
    );
    expect(accent.value.toLowerCase()).toBe("#345678");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("reports failed account sync honestly and retries while retaining the local preference", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );
    fireEvent.change(screen.getByLabelText("Accent Color hex code"), {
      target: { value: "#123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));
    await screen.findByText(/Applied on this device. Account sync failed/);
    expect(localStorage.getItem("app_theme")).toBe("#123456");
    expect(mockMutateUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /retry sync/i }));
    await screen.findByText("Appearance saved");
    expect(mockMutateUser).toHaveBeenCalledWith({
      activeTheme: "#123456",
      activeBackground: DEFAULT_DARK_BG_HEX,
    });
    expect(JSON.parse(localStorage.getItem("sylf_recent_accents")!)[0]).toBe(
      "#123456"
    );
  });

  it("preserves unsaved user drafts and saved preferences when AuthProvider re-renders with stale user state", async () => {
    // Start before user profile finishes loading
    mockUser = null;
    const { rerender } = render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const accentInput = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(accentInput, { target: { value: "#e11d48" } });
    expect(accentInput.value.toLowerCase()).toBe("#e11d48");

    // Simulate delayed AuthProvider profile resolution with older server values
    mockUser = {
      id: 1,
      username: "SungJinwoo",
      activeTheme: "#2563eb",
      activeBackground: "#090d16",
    };
    rerender(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    // User's active draft must NOT be clobbered by delayed user load
    expect(accentInput.value.toLowerCase()).toBe("#e11d48");

    // Apply with a single click
    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));
    await screen.findByText("Appearance saved");
    expect(localStorage.getItem("app_theme")).toBe("#e11d48");
    expect(
      document.documentElement.style.getPropertyValue("--accent-primary")
    ).toBe("#e11d48");

    // Simulate another background refresh returning stale user state
    mockUser = {
      id: 1,
      username: "SungJinwoo",
      activeTheme: "#2563eb",
      activeBackground: "#090d16",
    };
    rerender(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    // Saved preference must remain intact without requiring a second click
    expect(accentInput.value.toLowerCase()).toBe("#e11d48");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("produces a chromatic color on the first hue slider interaction even when starting from pure black (#000000)", () => {
    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const bgInput = screen.getByLabelText(
      "Background Color hex code"
    ) as HTMLInputElement;
    fireEvent.change(bgInput, { target: { value: "#000000" } });
    expect(bgInput.value.toLowerCase()).toBe("#000000");

    fireEvent.click(
      screen.getByRole("button", { name: "Custom Background Color" })
    );
    const bgHue = screen.getByRole("slider", {
      name: "Background Color hue slider",
    });
    fireEvent.keyDown(bgHue, { key: "ArrowRight", shiftKey: true });

    // Adjusting hue from pure black lifts saturation/brightness so the first interaction visibly changes the color
    expect(bgInput.value.toLowerCase()).not.toBe("#000000");
  });

  it("infers light mode automatically when app_mode is unset and server activeBackground is light", () => {
    localStorage.removeItem("app_mode");
    mockUser = {
      id: 1,
      username: "SungJinwoo",
      activeTheme: "#06b6d4",
      activeBackground: "#f8fafc",
    };

    render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const lightModeBtn = screen.getByRole("button", { name: /^Light$/i });
    expect(lightModeBtn).toHaveAttribute("aria-pressed", "true");
    const preview = screen.getByLabelText("Preview of your Sylf workspace");
    expect(preview).toHaveAttribute("data-surface-polarity", "light");
  });

  it("resets locallySaved state and loads new preferences when user account switches", async () => {
    const { rerender } = render(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const emeraldSwatch = screen.getByRole("button", { name: "Emerald" });
    fireEvent.click(emeraldSwatch);
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/i }));

    await waitFor(() => {
      expect(localStorage.getItem("app_theme")).toBe("#10b981");
    });

    // Switch to another user account with a different server theme/background
    localStorage.clear();
    mockUser = {
      id: 2,
      username: "ChaHaeIn",
      activeTheme: "#ec4899",
      activeBackground: "#f8fafc",
    };

    rerender(
      <SettingsProvider>
        <AppearanceSettingsScreen />
      </SettingsProvider>
    );

    const accentInput = screen.getByLabelText(
      "Accent Color hex code"
    ) as HTMLInputElement;
    expect(accentInput.value.toLowerCase()).toBe("#ec4899");
    const lightModeBtn = screen.getByRole("button", { name: /^Light$/i });
    expect(lightModeBtn).toHaveAttribute("aria-pressed", "true");
  });
});
