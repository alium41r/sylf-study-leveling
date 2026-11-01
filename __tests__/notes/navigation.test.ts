import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateNotes } from "@/lib/notes/navigation";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("local Notes navigation", () => {
  it("switches notes and returns to the library without a server/router round trip", () => {
    window.history.replaceState(null, "", "/notes");
    const router = { replace: vi.fn() };
    navigateNotes("/notes?document=synthetic&dev=true", router);
    expect(window.location.search).toBe("?document=synthetic&dev=true");
    navigateNotes("/notes", router);
    expect(window.location.search).toBe("");
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("preserves the mobile/fixture navigation adapter", () => {
    const router = { replace: vi.fn() };
    navigateNotes("/notes?document=synthetic", router);
    expect(router.replace).toHaveBeenCalledWith("/notes?document=synthetic", {
      scroll: false,
    });
  });
  it("refuses external destinations", () => {
    expect(() =>
      navigateNotes("https://untrusted.invalid/notes", { replace: vi.fn() })
    ).toThrow();
  });
  it("uses the native adapter for a Capacitor custom-scheme origin", () => {
    vi.stubGlobal("window", {
      location: {
        href: "capacitor://localhost/",
        origin: "null",
        pathname: "/",
        protocol: "capacitor:",
        hash: "#/notes",
      },
    });
    const router = { replace: vi.fn() };
    navigateNotes("/notes?document=synthetic", router);
    expect(router.replace).toHaveBeenCalledWith("/notes?document=synthetic", {
      scroll: false,
    });
  });
});
