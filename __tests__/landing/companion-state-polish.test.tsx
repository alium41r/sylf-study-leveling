import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import Companion from "@/app/components/landing/companion/Companion";
import { CANONICAL_ART } from "@/app/components/landing/companion/artwork";
import {
  ACTIONS,
  EXPRESSIONS,
  type Action,
} from "@/app/components/landing/companion/model";

afterEach(cleanup);

const part = (container: ParentNode, name: string) => {
  const element = container.querySelector(`[data-part="${name}"]`);
  expect(element, `${name} should exist`).not.toBeNull();
  return element!;
};
const precedes = (before: Element, after: Element) =>
  !!(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING);

it("keeps the painted master and registered hood through every polished expression and action", () => {
  const view = render(<Companion motion="none" />);
  const image = view.container.querySelector("image");
  const svg = view.container.querySelector("svg");
  const hood = part(view.container, "hood");
  const hoodTexture = hood.querySelector("use");
  const hoodRegistration = hoodTexture!.getAttribute("clip-path");
  for (const expression of EXPRESSIONS) {
    for (const action of ACTIONS) {
      view.rerender(
        <Companion motion="none" preview={{ expression, action }} />
      );
      expect(view.container.querySelector("svg")).toBe(svg);
      expect(view.container.querySelectorAll("image")).toHaveLength(1);
      expect(view.container.querySelector("image")).toBe(image);
      expect(image).toHaveAttribute("href", CANONICAL_ART);
      expect(part(view.container, "hood")).toBe(hood);
      expect(hood.querySelector("use")).toBe(hoodTexture);
      expect(hoodTexture).toHaveAttribute("clip-path", hoodRegistration);
    }
  }
});

it.each([
  ["HELLO", ["right"]],
  ["READING", ["left", "right"]],
  ["USING_TABLET", ["left", "right"]],
  ["TIMER_MODE", ["right"]],
  ["CELEBRATING", ["right"]],
] as const)(
  "gives %s the intended vector limbs with sleeve, cuff and mitten occlusion",
  (action, sides) => {
    const { container } = render(
      <Companion motion="none" preview={{ expression: "NEUTRAL", action }} />
    );
    const body = part(container, "body");
    const hood = part(container, "hood");
    const propName =
      action === "READING"
        ? "book"
        : action === "USING_TABLET"
          ? "tablet"
          : null;
    const prop = propName ? part(container, propName) : null;
    for (const layer of ["sleeve", "cuff", "hand"]) {
      expect(
        container.querySelectorAll(
          `[data-part="${layer}-left"], [data-part="${layer}-right"]`
        )
      ).toHaveLength(sides.length);
    }
    for (const side of sides) {
      const sleeve = part(container, `sleeve-${side}`);
      const cuff = part(container, `cuff-${side}`);
      const hand = part(container, `hand-${side}`);
      expect(
        container.querySelectorAll(`[data-part="sleeve-${side}"]`)
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(`[data-part="cuff-${side}"]`)
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(`[data-part="hand-${side}"]`)
      ).toHaveLength(1);
      expect(sleeve.querySelector("path,ellipse")).not.toBeNull();
      expect(cuff.querySelector("path,ellipse")).not.toBeNull();
      expect(hand.querySelector("path,ellipse")).not.toBeNull();
      expect(sleeve.querySelector("image")).toBeNull();
      expect(cuff.querySelector("image")).toBeNull();
      expect(hand.querySelector("image")).toBeNull();
      expect(precedes(sleeve, body)).toBe(true);
      expect(precedes(body, cuff)).toBe(true);
      expect(precedes(cuff, hand)).toBe(true);
      expect(precedes(hood, hand)).toBe(true);
      if (prop) {
        expect(precedes(cuff, prop)).toBe(true);
        expect(precedes(prop, hand)).toBe(true);
      }
    }
  }
);

it("makes the timer progress readable as geometry even with motion disabled", () => {
  const { container } = render(<Companion state="FOCUSING" motion="none" />);
  const timer = part(container, "timer");
  expect(container.querySelectorAll('[data-part="timer"]')).toHaveLength(1);
  const progress = part(timer, "timer-progress");
  expect(
    progress.matches("circle,path") || progress.querySelector("circle,path")
  ).toBeTruthy();
  expect(timer.querySelector("text")).toBeNull();
});

it("maps thinking to the magical focused eyes and distinguishes happy/excited geometry", () => {
  const view = render(
    <Companion
      motion="none"
      preview={{ expression: "THINKING", action: "FLOATING" }}
    />
  );
  const thinking = part(view.container, "eyes");
  expect(thinking).toHaveAttribute("data-eye-expression", "FOCUSED");
  expect(
    thinking.querySelectorAll('[data-eye-layer="star-reflection"]')
  ).toHaveLength(2);
  for (const oldSliver of [
    "M392 440L440 446Q434 484 392 440Z",
    "M544 446L592 440Q552 484 544 446Z",
  ]) {
    expect(
      [...thinking.querySelectorAll("path")].some(
        (path) => path.getAttribute("d") === oldSliver
      )
    ).toBe(false);
  }
  const eyePaths = () =>
    [...part(view.container, "eyes").querySelectorAll("path")].map((path) =>
      path.getAttribute("d")
    );
  view.rerender(
    <Companion
      motion="none"
      preview={{ expression: "HAPPY", action: "FLOATING" }}
    />
  );
  const happy = eyePaths();
  view.rerender(
    <Companion
      motion="none"
      preview={{ expression: "EXCITED", action: "FLOATING" }}
    />
  );
  expect(eyePaths()).not.toEqual(happy);
});

it.each([
  "HELLO",
  "READING",
  "USING_TABLET",
  "TIMER_MODE",
  "CELEBRATING",
] as Action[])(
  "keeps every SVG reference local and unique for simultaneous %s instances",
  (action) => {
    const { container } = render(
      <>
        <Companion motion="none" preview={{ expression: "THINKING", action }} />
        <Companion motion="none" preview={{ expression: "EXCITED", action }} />
      </>
    );
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll("svg")) {
      const localIds = new Set(
        [...svg.querySelectorAll("[id]")].map((node) => node.id)
      );
      for (const element of svg.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          const reference =
            attribute.value.match(/^url\(#(.+)\)$/)?.[1] ??
            (attribute.name === "href" && attribute.value.startsWith("#")
              ? attribute.value.slice(1)
              : undefined);
          if (reference)
            expect(
              localIds.has(reference),
              `${attribute.name} should resolve within its own SVG`
            ).toBe(true);
        }
      }
    }
  }
);
