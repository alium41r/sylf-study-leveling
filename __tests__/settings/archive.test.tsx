import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ArchiveSettingsScreen } from "@/app/settings/archive/components/ArchiveSettingsScreen";
import { ARCHIVE_ENTRIES, type ArchiveEntry } from "@/lib/archive-catalog";
import {
  getAccentTokens,
  getBackgroundTokens,
  getContrastRatio,
} from "@/lib/color-utils";

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, name: "Test Scholar" } }),
}));

vi.mock("@/app/components/BackToSettings", () => ({
  default: () => <button type="button">Back to System Hub</button>,
}));

function entry(id: string): ArchiveEntry {
  return ARCHIVE_ENTRIES.find((item) => item.id === id)!;
}

function expectCompleteEntry(id: string) {
  const expected = entry(id);
  const article = screen.getByRole("article", { name: expected.title });
  expect(
    within(article).getByRole("heading", { name: expected.title, level: 2 })
  ).toBeVisible();
  for (const block of expected.content) {
    if (block.type === "list") {
      for (const item of block.items) expect(article).toHaveTextContent(item);
    } else {
      expect(article).toHaveTextContent(block.text);
    }
  }
  return article;
}

function savedView() {
  fireEvent.click(
    within(screen.getByRole("group", { name: "Index view" })).getByRole(
      "button",
      { name: /Saved/ }
    )
  );
}

describe("Archive library", () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  it("keeps every chapter reference valid and removes abandoned systems", () => {
    const ids = new Set(ARCHIVE_ENTRIES.map((item) => item.id));
    expect(ids.size).toBe(ARCHIVE_ENTRIES.length);
    expect(ids.has("sys_classes")).toBe(false);
    expect(ids.has("sys_skilltree")).toBe(false);
    for (const item of ARCHIVE_ENTRIES) {
      for (const related of item.related) expect(ids.has(related)).toBe(true);
      expect(item.requirement.type).toBe("NONE");
    }
  });

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalScrollIntoView)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it.each([
    ["crystallized effort", "eco_sylph"],
    ["coverage and preparedness", "qst_quick_plan"],
    ["Rarity Tiers", "ach_system"],
  ])("finds entries by their content when searching for %s", (query, id) => {
    render(<ArchiveSettingsScreen />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search the codex" }),
      { target: { value: `  ${query.toUpperCase()}  ` } }
    );

    const index = screen.getByRole("navigation", { name: "Archive entries" });
    const matchingEntry = within(index).getByRole("button", {
      name: new RegExp(entry(id).title),
    });
    expect(within(index).getByRole("status")).toHaveTextContent(
      "1 matching entry"
    );
    fireEvent.click(matchingEntry);
    expectCompleteEntry(id);
    expect(
      screen.getByRole("heading", { name: entry(id).title, level: 2 })
    ).toHaveFocus();
  });

  it("clears an unsuccessful search and restores the chapter contents", () => {
    render(<ArchiveSettingsScreen />);
    const search = screen.getByRole("searchbox", { name: "Search the codex" });
    fireEvent.change(search, {
      target: { value: "an entry that does not exist" },
    });
    expect(screen.getByText("No entries found.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("0 matching entries");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    const index = screen.getByRole("navigation", { name: "Archive entries" });
    expect(
      within(index).getByRole("button", { name: /Levels & Experience/ })
    ).toBeVisible();
    expect(
      within(index).getByRole("button", { name: /Achievements & Milestones/ })
    ).toBeVisible();
  });

  it("focuses the contents search and returns focus when the contents are closed", () => {
    render(<ArchiveSettingsScreen />);
    const contents = within(
      screen.getByRole("region", { name: "Codex reader" })
    ).getByRole("button", { name: "Contents" });
    fireEvent.click(contents);
    const search = screen.getByRole("searchbox", { name: "Search the codex" });
    expect(contents).toHaveAttribute("aria-expanded", "true");
    expect(search).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Close contents" }));
    expect(contents).toHaveAttribute("aria-expanded", "false");
    expect(contents).toHaveFocus();

    fireEvent.click(contents);
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(contents).toHaveAttribute("aria-expanded", "false");
    expect(contents).toHaveFocus();
  });

  it("keeps library chrome readable as custom appearance colors change", async () => {
    const root = document.documentElement;
    const originalStyle = root.getAttribute("style");
    const originalMode = root.getAttribute("data-mode");
    const library = render(<ArchiveSettingsScreen />);
    const archive = library.container.firstElementChild as HTMLElement;
    const scopedTokens = ["--chrome-accent", "--index-ink", "--index-muted"];
    let previousAccent = getComputedStyle(archive)
      .getPropertyValue("--chrome-accent")
      .trim();

    try {
      for (const appearance of [
        { canvas: "#888888", accent: "#7c3aed", mode: "dark" as const },
        { canvas: "#1a7775", accent: "#06b6d4", mode: "light" as const },
      ]) {
        const background = getBackgroundTokens(
          appearance.canvas,
          appearance.mode
        );
        const accent = getAccentTokens(
          appearance.accent,
          background["--surface-1"]
        );
        await act(async () => {
          root.setAttribute("data-mode", appearance.mode);
          for (const [token, value] of Object.entries({
            ...background,
            ...accent,
          }))
            root.style.setProperty(token, value);
        });

        await waitFor(() => {
          const computed = getComputedStyle(archive);
          expect(computed.getPropertyValue("--chrome-accent").trim()).not.toBe(
            previousAccent
          );
          for (const token of scopedTokens) {
            const color = computed.getPropertyValue(token).trim();
            expect(color).toMatch(/^#[\da-f]{6}$/i);
            expect(
              getContrastRatio(color, appearance.canvas)
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
        expect(root.style.getPropertyValue("--app-canvas")).toBe(
          appearance.canvas
        );
        previousAccent = getComputedStyle(archive)
          .getPropertyValue("--chrome-accent")
          .trim();
      }
    } finally {
      library.unmount();
      if (originalStyle === null) root.removeAttribute("style");
      else root.setAttribute("style", originalStyle);
      if (originalMode === null) root.removeAttribute("data-mode");
      else root.setAttribute("data-mode", originalMode);
    }
  });

  it("saves a bookmark across visits and removes it from the saved index", () => {
    const firstVisit = render(<ArchiveSettingsScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "Bookmark this entry" })
    );
    expect(
      screen.getByRole("button", { name: "Remove bookmark" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem("archive_favorites")!)).toEqual([
      "sys_leveling",
    ]);
    savedView();
    expect(screen.getByRole("status")).toHaveTextContent("1 saved entry");
    expect(
      within(
        screen.getByRole("navigation", { name: "Archive entries" })
      ).getByRole("button", { name: /Levels & Experience/ })
    ).toBeVisible();

    firstVisit.unmount();
    render(<ArchiveSettingsScreen />);
    expect(
      screen.getByRole("button", { name: "Remove bookmark" })
    ).toHaveAttribute("aria-pressed", "true");
    savedView();
    expect(screen.getByRole("status")).toHaveTextContent("1 saved entry");
    fireEvent.click(screen.getByRole("button", { name: "Remove bookmark" }));

    expect(
      screen.getByRole("button", { name: "Bookmark this entry" })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("0 saved entries");
    expect(screen.getByText("Keep a page for later.")).toBeVisible();
    expect(JSON.parse(localStorage.getItem("archive_favorites")!)).toEqual([]);
  });

  it.each(["{broken JSON", '{"unexpected":"object"}', "null"])(
    "opens the library when persisted data is malformed: %s",
    (storedValue) => {
      localStorage.setItem("archive_favorites", storedValue);
      localStorage.setItem("archive_recents", storedValue);
      render(<ArchiveSettingsScreen />);

      expectCompleteEntry("sys_leveling");
      savedView();
      expect(screen.getByRole("status")).toHaveTextContent("0 saved entries");
      fireEvent.click(
        screen.getByRole("button", { name: "Bookmark this entry" })
      );
      expect(screen.getByRole("status")).toHaveTextContent("1 saved entry");
      expect(JSON.parse(localStorage.getItem("archive_favorites")!)).toEqual([
        "sys_leveling",
      ]);
    }
  );

  it("keeps valid saved entries while removing duplicate and unknown stored IDs", () => {
    localStorage.setItem(
      "archive_favorites",
      JSON.stringify(["sys_ranks", "sys_ranks", "unknown-entry", 123, null])
    );
    localStorage.setItem(
      "archive_recents",
      JSON.stringify(["unknown-entry", "focus_timer", null])
    );
    render(<ArchiveSettingsScreen />);
    savedView();

    expect(screen.getByRole("status")).toHaveTextContent("1 saved entry");
    const index = screen.getByRole("navigation", { name: "Archive entries" });
    expect(within(index).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(
      within(index).getByRole("button", { name: /Hunter Ranks & Progression/ })
    );
    expectCompleteEntry("sys_ranks");
    expect(
      screen.getByRole("button", { name: "Remove bookmark" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem("archive_favorites")!)).toEqual([
      "sys_ranks",
    ]);
  });

  it("still permits reading and bookmarking when browser storage is unavailable", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<ArchiveSettingsScreen />);

    expectCompleteEntry("sys_leveling");
    fireEvent.click(
      screen.getByRole("button", { name: "Bookmark this entry" })
    );
    savedView();
    expect(screen.getByRole("status")).toHaveTextContent("1 saved entry");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next entry: Hunter Ranks & Progression",
      })
    );
    expectCompleteEntry("sys_ranks");
  });

  it("opens related reading and turns backward and forward without losing article content", () => {
    render(<ArchiveSettingsScreen />);
    const firstArticle = expectCompleteEntry("sys_leveling");
    fireEvent.click(
      within(firstArticle).getByRole("button", {
        name: /Sylph Currency & Your Ledger/,
      })
    );
    expectCompleteEntry("eco_sylph");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Previous entry: Quick Plan, Scope & Copilot",
      })
    );
    expectCompleteEntry("qst_quick_plan");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next entry: Sylph Currency & Your Ledger",
      })
    );
    expectCompleteEntry("eco_sylph");
    expect(
      within(
        screen.getByRole("navigation", { name: "Archive entries" })
      ).getByRole("button", { name: /Sylph Currency & Your Ledger/ })
    ).toHaveAttribute("aria-current", "page");
  });

  it("jumps to chapters, reopens their collapsed contents, and respects the beginning and end", () => {
    render(<ArchiveSettingsScreen />);
    expect(
      screen.getByRole("button", { name: "Previous entry" })
    ).toBeDisabled();

    const index = screen.getByRole("navigation", { name: "Archive entries" });
    const focusChapter = within(index).getByRole("button", {
      name: /Focus & Study/,
    });
    fireEvent.click(focusChapter);
    expect(focusChapter).toHaveAttribute("aria-expanded", "false");
    expect(
      within(index).queryByRole("button", {
        name: /Study Timer & Focus Engine/,
      })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Chapter II: Focus & Study" })
    );
    expectCompleteEntry("focus_timer");
    expect(focusChapter).toHaveAttribute("aria-expanded", "true");
    expect(
      within(index).getByRole("button", { name: /Study Timer & Focus Engine/ })
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(
      screen.getByRole("button", { name: "Chapter V: Customization" })
    );
    expectCompleteEntry("inv_cosmetics");
    fireEvent.click(
      screen.getByRole("button", { name: "Chapter VII: Achievements" })
    );
    expectCompleteEntry("ach_system");
    expect(screen.getByRole("button", { name: "Next entry" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Previous entry: Privacy & Visibility",
      })
    );
    expectCompleteEntry("soc_privacy");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Next entry: Achievements & Milestones",
      })
    );
    expectCompleteEntry("ach_system");
    expect(screen.getByRole("button", { name: "Next entry" })).toBeDisabled();
  });
});
