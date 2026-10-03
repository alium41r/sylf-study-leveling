import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import { EYE_EXPRESSIONS } from "@/app/components/landing/companion/MagicalEyes";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offers all nine eye drawings without changing registered non-eye artwork or action props", () => {
  const view = render(
    <Companion
      preview={{ expression: "NEUTRAL", action: "READING" }}
      motion="none"
    />
  );
  const svg = view.container.querySelector("svg");
  const fixed = [
    "body",
    "ribbons",
    "halo",
    "star",
    "book",
    "hand-left",
    "hand-right",
    "cuff-left",
    "cuff-right",
  ];
  const before = fixed.map(
    (name) => view.container.querySelector(`[data-part="${name}"]`)!.outerHTML
  );
  const hood = view.container.querySelector('[data-part="hood"]');
  const texture = hood!.querySelector("use");
  for (const eyeExpression of EYE_EXPRESSIONS) {
    view.rerender(
      <Companion
        preview={{ expression: "NEUTRAL", action: "READING", eyeExpression }}
        motion="none"
      />
    );
    expect(view.container.querySelector("svg")).toBe(svg);
    expect(view.container.querySelector('[data-part="hood"]')).toBe(hood);
    expect(hood!.querySelector("use")).toBe(texture);
    expect(
      fixed.map(
        (name) =>
          view.container.querySelector(`[data-part="${name}"]`)!.outerHTML
      )
    ).toEqual(before);
    expect(view.container.querySelector('[data-part="eyes"]')).toHaveAttribute(
      "data-eye-expression",
      eyeExpression
    );
    expect(view.container.querySelectorAll("image")).toHaveLength(1);
    expect(
      view.container.querySelectorAll(
        '[data-part="eyes"] image,video,canvas,filter'
      )
    ).toHaveLength(0);
  }
});

it("uses the focused eye artwork for existing thinking states without adding semantic states", () => {
  for (const state of ["FOCUSING", "READING", "AI_THINKING"] as const) {
    const view = render(<Companion state={state} />);
    expect(
      view.container.querySelector("[data-sylf-companion]")
    ).toHaveAttribute("data-expression", "THINKING");
    expect(view.container.querySelector('[data-part="eyes"]')).toHaveAttribute(
      "data-eye-expression",
      "FOCUSED"
    );
    view.unmount();
  }
});

it("keeps open eye depth, embedded reflections and drawn blink lids as separate vector layers", () => {
  const { container } = render(<Companion />);
  const current = container.querySelector(
    '[data-eye-transition="current"] [data-eye-variant="NEUTRAL"]'
  )!;
  for (const name of [
    "silhouette",
    "depth",
    "inner-flow",
    "core",
    "star-reflection",
    "gloss",
    "bloom",
  ])
    expect(current.querySelectorAll(`[data-eye-layer="${name}"]`)).toHaveLength(
      2
    );
  expect(
    container.querySelector('[data-eye-layer="blink-lid"] path')
  ).not.toBeNull();
});

it("bounds interrupted eye dissolves without a JS timer", () => {
  vi.useFakeTimers();
  const view = render(<Companion />);
  for (const eyeExpression of EYE_EXPRESSIONS) {
    view.rerender(
      <Companion
        preview={{ expression: "NEUTRAL", action: "FLOATING", eyeExpression }}
      />
    );
    expect(
      view.container.querySelectorAll('[data-eye-transition="outgoing"]').length
    ).toBeLessThanOrEqual(1);
    expect(
      view.container.querySelectorAll('[data-eye-transition="current"]')
    ).toHaveLength(1);
  }
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps eye gradients, clips and shape references local to each instance", () => {
  const { container } = render(
    <>
      <Companion />
      <Companion
        preview={{
          expression: "NEUTRAL",
          action: "FLOATING",
          eyeExpression: "SAD",
        }}
      />
    </>
  );
  const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const svg of container.querySelectorAll("svg")) {
    const local = new Set([...svg.querySelectorAll("[id]")].map((e) => e.id));
    for (const element of svg.querySelectorAll("[fill],[clip-path],use")) {
      for (const attr of ["fill", "clip-path", "href"]) {
        const value = element.getAttribute(attr) ?? "";
        const id =
          value.match(/^url\(#(.+)\)$/)?.[1] ??
          (attr === "href" && value.startsWith("#") ? value.slice(1) : null);
        if (id) expect(local.has(id)).toBe(true);
      }
    }
  }
});
