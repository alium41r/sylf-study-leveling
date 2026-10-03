import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import { setPixelCompanionPreview } from "@/app/components/landing/companion/pixel-preview";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllEnvs();
});

it("switches a development placement back to the functional SVG without saving preferences", () => {
  vi.stubEnv("NODE_ENV", "development");
  const view = render(<Companion state="READING" size={110} />);
  const host = view.container.querySelector("[data-sylf-companion]")!;
  expect(host).toHaveAttribute("data-sylf-companion", "original");
  expect(view.container.querySelector('[data-part="book"]')).not.toBeNull();

  act(() => setPixelCompanionPreview(true));
  expect(host).toHaveAttribute("data-sylf-companion", "pixel");
  expect(view.container.querySelector("svg")).toBeNull();
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    "/companions/sylf-pixel-companion.png"
  );
  expect(view.container.querySelector("img")).not.toHaveAttribute("srcset");

  act(() => setPixelCompanionPreview(false));
  expect(view.container.querySelector("[data-sylf-companion]")).toBe(host);
  expect(host).toHaveAttribute("data-sylf-companion", "original");
  expect(view.container.querySelector('[data-part="book"]')).not.toBeNull();
  expect(window.location.search).toBe("");
});

it("loads a development comparison URL while keeping SVG reference studies available", () => {
  vi.stubEnv("NODE_ENV", "development");
  window.history.replaceState(null, "", "/?companion=pixel");
  const { container } = render(
    <>
      <Companion />
      <Companion allowPixelPreview={false} />
    </>
  );
  expect(
    container.querySelectorAll('[data-sylf-companion="pixel"]')
  ).toHaveLength(1);
  expect(
    container.querySelectorAll('[data-sylf-companion="original"] svg')
  ).toHaveLength(1);
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
