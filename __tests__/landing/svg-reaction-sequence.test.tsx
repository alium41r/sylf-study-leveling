import { StrictMode, createRef, Profiler, type ComponentProps } from "react";
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
import JourneyCompanion, {
  type JourneyCompanionHandle,
} from "@/app/components/landing/companion/JourneyCompanion";
import { setPixelCompanionVariant } from "./fixtures/retired-pixel-preview";

// Router prefetch timers are independent of the companion timeline under test.
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/companion-prototype");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});
const actor = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-sylf-companion]")!;
const play = () =>
  fireEvent.click(screen.getByText("Play SVG reaction sequence"));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

it("cues the existing lid/expressions, keeps the rig, and releases every override after repeated plays", () => {
  const { container } = render(
    <StrictMode>
      <CompanionReview />
    </StrictMode>
  );
  const host = actor(container);
  const svg = host.querySelector("svg");
  const hood = host.querySelector('[data-part="hood"]');
  for (let run = 0; run < 4; run++) {
    play();
    expect(host).toHaveAttribute("data-svg-sequence", "idle");
    advance(1000);
    expect(host.querySelector('[data-part="eyes"]')).toHaveAttribute(
      "data-blink",
      "closed"
    );
    expect(host.querySelector('[data-eye-layer="blink-lid"]')).not.toBeNull();
    advance(150);
    expect(host.querySelector('[data-part="eyes"]')).toHaveAttribute(
      "data-blink",
      "open"
    );
    advance(250);
    expect(host).toHaveAttribute("data-state", "DISCOVERING");
    expect(host).toHaveAttribute("data-expression", "CURIOUS");
    advance(800);
    expect(host).toHaveAttribute("data-state", "QUEST_COMPLETE");
    expect(host).toHaveAttribute("data-expression", "HAPPY");
    expect(host).toHaveAttribute("data-action", "FLOATING");
    advance(1100);
    expect(host).toHaveAttribute("data-state", "IDLE");
    expect(host).toHaveAttribute("data-svg-sequence", "return");
    advance(750);
    expect(host).not.toHaveAttribute("data-svg-sequence");
    expect(host.querySelector('[data-part="eyes"]')).not.toHaveAttribute(
      "data-blink"
    );
    expect(host).toHaveAttribute("data-expression", "NEUTRAL");
    expect(host.querySelector("svg")).toBe(svg);
    expect(host.querySelector('[data-part="hood"]')).toBe(hood);
    expect(host.style.transform).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  }
});

it("replay replaces pending beats even during an active happy reaction", () => {
  const { container } = render(<CompanionReview />);
  play();
  advance(1400);
  advance(800);
  expect(actor(container)).toHaveAttribute("data-state", "QUEST_COMPLETE");
  play();
  expect(actor(container)).toHaveAttribute("data-state", "IDLE");
  expect(vi.getTimerCount()).toBe(6);
  advance(1100);
  expect(actor(container)).toHaveAttribute("data-svg-sequence", "blink");
  fireEvent.click(screen.getByText("Stop sequence"));
  advance(10000);
  expect(actor(container)).toHaveAttribute("data-state", "IDLE");
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["base", "eye", "reaction", "pause"])(
  "manual %s control cancels the one-shot timeline",
  (control) => {
    const { container } = render(<CompanionReview />);
    play();
    advance(1500);
    if (control === "base")
      fireEvent.change(screen.getByLabelText("Base state"), {
        target: { value: "READING" },
      });
    if (control === "eye")
      fireEvent.change(screen.getByLabelText("Magical eye study"), {
        target: { value: "SLEEPY" },
      });
    if (control === "reaction") fireEvent.click(screen.getByText("Celebrate"));
    if (control === "pause") fireEvent.click(screen.getByText("Pause motion"));
    expect(actor(container)).not.toHaveAttribute("data-svg-sequence");
    advance(10000);
    expect(vi.getTimerCount()).toBe(0);
    if (control === "base")
      expect(actor(container)).toHaveAttribute("data-state", "READING");
    if (control === "eye")
      expect(
        actor(container).querySelector('[data-part="eyes"]')
      ).toHaveAttribute("data-eye-expression", "SLEEPY");
    if (control === "pause")
      expect(screen.getByText("Play SVG reaction sequence")).toBeDisabled();
  }
);

it.each(["pixel", "pixel-layered"] as const)(
  "the retired %s flag never reinstates character pixels in the study",
  (variant) => {
    const { container } = render(<CompanionReview />);
    play();
    advance(1400);
    act(() => setPixelCompanionVariant(variant));
    act(() => vi.runAllTicks());
    expect(actor(container)).toHaveAttribute("data-sylf-companion", "original");
    expect(actor(container).querySelector('[data-pixel-layer]')).toBeNull();
    expect(screen.queryByText('Layered pixel companion')).toBeNull();
  }
);

it("clears sequence and reaction timers when hidden or unmounted", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = render(<CompanionReview />);
  play();
  advance(1400);
  advance(800);
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(actor(view.container)).not.toHaveAttribute("data-svg-sequence");
  expect(vi.getTimerCount()).toBe(0);
  hidden.mockReturnValue(false);
  play();
  advance(1400);
  advance(800);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("has no sequence controls or forced blink presentation in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  const { container } = render(
    <>
      <CompanionReview />
      <Companion svgSequenceBeat="blink" />
    </>
  );
  expect(screen.queryByText("Play SVG reaction sequence")).toBeNull();
  expect(container.querySelector("[data-svg-sequence]")).toBeNull();
  expect(container.querySelector("[data-blink]")).toBeNull();
  act(() => vi.runAllTicks());
  expect(vi.getTimerCount()).toBe(0);
});

it("holds a section presentation beyond reaction expiry without per-frame React updates", () => {
  const ref = createRef<JourneyCompanionHandle>();
  const commits = vi.fn();
  const { container } = render(
    <Profiler id="held-section" onRender={commits}>
      <JourneyCompanion ref={ref} />
    </Profiler>
  );
  act(() =>
    ref.current!.present(
      "QUEST_COMPLETE",
      true,
      { x: 400, y: 600 },
      1 / 60,
      true
    )
  );
  advance(5000);
  expect(actor(container)).toHaveAttribute("data-expression", "HAPPY");
  const count = commits.mock.calls.length;
  act(() => {
    for (let n = 0; n < 60; n++)
      ref.current!.present(
        "QUEST_COMPLETE",
        true,
        { x: 400, y: 600 },
        1 / 60,
        true
      );
  });
  expect(commits).toHaveBeenCalledTimes(count);
  act(() =>
    ref.current!.present("FOCUSING", true, { x: 400, y: 600 }, 1 / 60, true)
  );
  expect(actor(container)).toHaveAttribute("data-action", "TIMER_MODE");
  act(() => ref.current!.present("IDLE", false));
  expect(actor(container)).toHaveAttribute("data-expression", "NEUTRAL");
  expect(vi.getTimerCount()).toBe(0);
});
