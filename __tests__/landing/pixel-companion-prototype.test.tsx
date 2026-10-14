import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import { setPixelCompanionPreview } from "./fixtures/retired-pixel-preview";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllEnvs();
});

it("ignores retired comparison URLs in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  window.history.replaceState(null, "", "/?companion=pixel");
  const view = render(<Companion state="READING" size={110} />);
  act(() => setPixelCompanionPreview(true));
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector('[data-sylf-companion]')).toHaveAttribute('data-sylf-companion', 'original');
});

it("ignores the comparison URL and switch in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  window.history.replaceState(null, "", "/?companion=pixel");
  const { container } = render(<Companion />);
  act(() => setPixelCompanionPreview(false));
  expect(container.querySelector("[data-sylf-companion]")).toHaveAttribute(
    "data-sylf-companion",
    "original"
  );
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(window.location.search).toBe("?companion=pixel");
});
