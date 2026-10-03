import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import CompanionReview from "@/app/components/landing/companion/CompanionReview";
import {
  PIXEL_EYE_STATES,
  setPixelCompanionVariant,
  setPixelEyePreview,
} from "@/app/components/landing/companion/pixel-preview";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  window.history.replaceState(
    null,
    "",
    "/companion-prototype?companion=pixel-layered"
  );
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("swaps six full-canvas eye images while preserving the same body and layer origins", () => {
  const view = render(<Companion size={56} />);
  const body = view.container.querySelector('[data-pixel-layer="body"]');
  const eyes = view.container.querySelector('[data-pixel-layer="eyes"]');
  const canvas = view.container.querySelector("[data-pixel-canvas]");
  expect(body).toHaveAttribute("src", "/companions/pixel/sylf/base/body.png");
  expect(body).toHaveAttribute("width", "1254");
  expect(body).toHaveAttribute("height", "1254");
  for (const expression of PIXEL_EYE_STATES) {
    act(() => setPixelEyePreview(expression));
    expect(canvas).toHaveAttribute("data-pixel-expression", expression);
    expect(view.container.querySelector('[data-pixel-layer="body"]')).toBe(
      body
    );
    expect(view.container.querySelector('[data-pixel-layer="eyes"]')).toBe(
      eyes
    );
    expect(eyes).toHaveAttribute(
      "src",
      `/companions/pixel/sylf/eyes/${expression}.png`
    );
    expect(eyes).toHaveAttribute("width", "1254");
    expect(eyes).toHaveAttribute("height", "1254");
    expect(eyes).toHaveAttribute("class", body?.getAttribute("class"));
    for (const property of ["left", "top", "width", "height", "transform"])
      expect((eyes as HTMLImageElement).style.getPropertyValue(property)).toBe(
        ""
      );
    expect(eyes).not.toHaveAttribute("srcset");
  }
});

it("keeps the complete Phase 1 artwork and SVG fallback available", () => {
  const view = render(<Companion state="READING" />);
  act(() => setPixelCompanionVariant("pixel"));
  expect(
    view.container.querySelector('[data-pixel-variant="full"]')
  ).toHaveAttribute("src", "/companions/sylf-pixel-companion.png");
  expect(view.container.querySelector('[data-pixel-layer="eyes"]')).toBeNull();
  act(() => setPixelCompanionVariant("svg"));
  expect(view.container.querySelector('[data-part="book"]')).not.toBeNull();
  expect(view.container.querySelector("[data-sylf-companion]")).toHaveAttribute(
    "data-sylf-companion",
    "original"
  );
});

it("does not enable layered controls or URL mutation in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  const view = render(<CompanionReview />);
  act(() => {
    setPixelEyePreview("happy");
    setPixelCompanionVariant("pixel");
  });
  expect(view.container.querySelector("[data-pixel-canvas]")).toBeNull();
  expect(screen.queryByLabelText("Pixel eye expression")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Layered pixel companion" })
  ).toBeNull();
  expect(window.location.search).toBe("?companion=pixel-layered");
});

it("blinks through discrete frames and cancels pending reset when a new expression is selected", () => {
  vi.useFakeTimers();
  const view = render(<CompanionReview />);
  const canvas = view.container.querySelector("[data-pixel-canvas]");
  const body = view.container.querySelector('[data-pixel-layer="body"]');
  fireEvent.click(screen.getByRole("button", { name: "Test blink" }));
  expect(canvas).toHaveAttribute("data-pixel-expression", "neutral");
  act(() => vi.advanceTimersByTime(100));
  expect(canvas).toHaveAttribute("data-pixel-expression", "blink");
  act(() => vi.advanceTimersByTime(140));
  expect(canvas).toHaveAttribute("data-pixel-expression", "neutral");
  expect(view.container.querySelector('[data-pixel-layer="body"]')).toBe(body);

  fireEvent.click(screen.getByRole("button", { name: "Test blink" }));
  fireEvent.change(screen.getByLabelText("Pixel eye expression"), {
    target: { value: "happy" },
  });
  act(() => vi.advanceTimersByTime(500));
  expect(canvas).toHaveAttribute("data-pixel-expression", "happy");
  expect(vi.getTimerCount()).toBe(0);
});
