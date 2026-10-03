import { Profiler, StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import { CANONICAL_ART } from "@/app/components/landing/companion/artwork";
import { statSync } from "node:fs";
import {
  ACTIONS,
  EXPRESSIONS,
  ORIGINAL,
  PRESENTATIONS,
  presentationFor,
  type CompanionState,
} from "@/app/components/landing/companion/model";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const actor = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-sylf-companion]")!;

it("renders the original anatomy from one shared texture with self-contained layer references", () => {
  const { container } = render(
    <>
      <Companion />
      <Companion size="SMALL" />
    </>
  );
  const first = actor(container);
  expect(first).toHaveAttribute("aria-hidden", "true");
  for (const part of [
    "hood",
    "face",
    "eyes",
    "body",
    "lower-body",
    "cloak",
    "ribbons",
    "chest-clasp",
    "halo",
    "star",
  ])
    expect(first.querySelector(`[data-part="${part}"]`)).not.toBeNull();
  expect(first.innerHTML).toContain(ORIGINAL.ivory);
  expect(first.innerHTML).toContain(ORIGINAL.face);
  expect(first.querySelectorAll("image")).toHaveLength(1);
  expect(first.querySelector("image")).toHaveAttribute("href", CANONICAL_ART);
  expect(statSync(`public${CANONICAL_ART}`).size).toBeLessThan(300_000);
  expect(
    container.querySelectorAll("img,video,canvas,[aria-live]")
  ).toHaveLength(0);
  const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const e of container.querySelectorAll("[fill]")) {
    const id = e.getAttribute("fill")?.match(/^url\(#(.+)\)$/)?.[1];
    if (id) expect(ids).toContain(id);
  }
});

it.each(EXPRESSIONS)(
  "supports %s without replacing the canonical hood",
  (expression) => {
    const view = render(<Companion motion="none" />);
    const hood = view.container.querySelector('[data-part="hood"]');
    const texture = hood!.querySelector("use");
    const registration = texture!.getAttribute("clip-path");
    view.rerender(
      <Companion preview={{ expression, action: "FLOATING" }} motion="none" />
    );
    expect(actor(view.container)).toHaveAttribute(
      "data-expression",
      expression
    );
    expect(view.container.querySelector('[data-part="hood"]')).toBe(hood);
    expect(hood!.querySelector("use")).toBe(texture);
    expect(texture).toHaveAttribute("clip-path", registration);
    expect(view.container.querySelector("image")).toHaveAttribute(
      "href",
      CANONICAL_ART
    );
  }
);

it.each(ACTIONS)(
  "composes the %s action with only its relevant prop",
  (action) => {
    const { container } = render(
      <Companion preview={{ expression: "NEUTRAL", action }} motion="none" />
    );
    expect(actor(container)).toHaveAttribute("data-action", action);
    expect(container.querySelectorAll('[data-part="book"]')).toHaveLength(
      action === "READING" ? 1 : 0
    );
    expect(container.querySelectorAll('[data-part="tablet"]')).toHaveLength(
      action === "USING_TABLET" ? 1 : 0
    );
    expect(container.querySelectorAll('[data-part="timer"]')).toHaveLength(
      action === "TIMER_MODE" ? 1 : 0
    );
    expect(container.querySelectorAll('[data-part="sparkles"]')).toHaveLength(
      action === "CELEBRATING" ? 1 : 0
    );
  }
);

it.each(Object.keys(PRESENTATIONS) as CompanionState[])(
  "maps semantic state %s centrally",
  (state) => {
    const { container } = render(<Companion state={state} />);
    expect(actor(container)).toHaveAttribute(
      "data-expression",
      presentationFor(state).expression
    );
    expect(actor(container)).toHaveAttribute(
      "data-action",
      presentationFor(state).action
    );
  }
);

it("falls back to neutral for unknown input", () => {
  const { container } = render(
    <Companion state={"unknown" as CompanionState} />
  );
  expect(actor(container)).toHaveAttribute("data-state", "IDLE");
});

it("bounds rapid reactions and returns to the current base without queues or remounts", () => {
  const view = render(
    <Companion state="FOCUSING" reaction={{ id: 1, type: "QUEST_COMPLETE" }} />
  );
  const svg = view.container.querySelector("svg");
  expect(actor(view.container)).toHaveAttribute("data-expression", "HAPPY");
  act(() => vi.advanceTimersByTime(500));
  view.rerender(
    <Companion state="FOCUSING" reaction={{ id: 2, type: "LEVEL_UP" }} />
  );
  view.rerender(
    <Companion state="FOCUSING" reaction={{ id: 3, type: "GREETING" }} />
  );
  expect(actor(view.container)).toHaveAttribute("data-state", "LEVEL_UP");
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(3200));
  expect(actor(view.container)).toHaveAttribute("data-state", "FOCUSING");
  expect(view.container.querySelector("svg")).toBe(svg);
  expect(vi.getTimerCount()).toBe(0);
});

it("expires reactions under StrictMode and cancels on a new base state", () => {
  const view = render(
    <StrictMode>
      <Companion state="GREETING" />
    </StrictMode>
  );
  act(() => vi.advanceTimersByTime(2400));
  expect(actor(view.container)).toHaveAttribute("data-state", "IDLE");
  view.rerender(
    <StrictMode>
      <Companion
        state="FOCUSING"
        reaction={{ id: 1, type: "TIMER_COMPLETE" }}
      />
    </StrictMode>
  );
  expect(actor(view.container)).toHaveAttribute("data-state", "TIMER_COMPLETE");
  view.rerender(
    <StrictMode>
      <Companion state="READING" />
    </StrictMode>
  );
  expect(actor(view.container)).toHaveAttribute("data-state", "READING");
  expect(vi.getTimerCount()).toBe(0);
});

it("does not rerender for idle motion, mutate gameplay or write preferences", () => {
  const commits = vi.fn(),
    fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(
    <Profiler id="companion" onRender={commits}>
      <Companion />
    </Profiler>
  );
  const count = commits.mock.calls.length;
  act(() => vi.advanceTimersByTime(120_000));
  expect(commits).toHaveBeenCalledTimes(count);
  expect(fetch).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("pauses CSS motion while hidden or offscreen and disconnects observers", () => {
  let intersect: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(fn: IntersectionObserverCallback) {
        intersect = fn;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = render(<Companion />);
  const el = actor(view.container);
  act(() =>
    intersect(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );
  expect(el).toHaveAttribute("data-animation", "paused");
  act(() =>
    intersect(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );
  expect(el).toHaveAttribute("data-animation", "active");
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(el).toHaveAttribute("data-animation", "paused");
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
