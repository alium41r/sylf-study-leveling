import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import {
  SylvRenderer,
  createDefaultSylvAppearance,
} from "../../lib/sylvs";

describe("SylvRenderer Component", () => {
  it("renders male base by default with canonical viewBox and aria label", () => {
    const appearance = createDefaultSylvAppearance("male");
    const { container } = render(
      <SylvRenderer appearance={appearance} size={240} />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 400 600");
    expect(svg).toHaveAttribute("aria-label", "male Sylv companion");

    const maleGroup = container.querySelector("#sylv-base-male");
    expect(maleGroup).toBeInTheDocument();
    expect(maleGroup).toHaveAttribute("data-gender", "male");

    // Check SVG layers
    expect(container.querySelector("#sylv-tail")).toBeInTheDocument();
    expect(container.querySelector("#sylv-body")).toBeInTheDocument();
    expect(container.querySelector("#sylv-head")).toBeInTheDocument();
    expect(container.querySelector("#sylv-arms")).toBeInTheDocument();
    expect(container.querySelector("#sylv-eyes")).toBeInTheDocument();
    expect(container.querySelector("#sylv-ears")).toBeInTheDocument();
  });

  it("renders female base when appearance.gender is female", () => {
    const appearance = createDefaultSylvAppearance("female");
    const { container } = render(
      <SylvRenderer appearance={appearance} size={240} />
    );

    const femaleGroup = container.querySelector("#sylv-base-female");
    expect(femaleGroup).toBeInTheDocument();
    expect(femaleGroup).toHaveAttribute("data-gender", "female");
    expect(container.querySelector("#sylv-base-male")).toBeNull();
  });

  it("injects dynamic CSS variables into the root SVG element style", () => {
    const customColors = {
      primary: "#112233",
      secondary: "#445566",
      eye: "#778899",
      accent: "#AABBCC",
    };
    const appearance = createDefaultSylvAppearance("male", customColors);
    const { container } = render(<SylvRenderer appearance={appearance} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();

    const style = svg?.getAttribute("style");
    expect(style).toContain("--sylv-primary: #112233");
    expect(style).toContain("--sylv-secondary: #445566");
    expect(style).toContain("--sylv-eye: #778899");
    expect(style).toContain("--sylv-accent: #AABBCC");
  });

  it("renders anchor debug overlay when showAnchors is true", () => {
    const appearance = createDefaultSylvAppearance("male");
    const { container, rerender } = render(
      <SylvRenderer appearance={appearance} showAnchors={false} />
    );

    expect(
      container.querySelector("#sylv-debug-anchor-overlay")
    ).not.toBeInTheDocument();

    rerender(<SylvRenderer appearance={appearance} showAnchors={true} />);

    expect(
      container.querySelector("#sylv-debug-anchor-overlay")
    ).toBeInTheDocument();
    expect(container.querySelector("#anchor-HEAD")).toBeInTheDocument();
    expect(container.querySelector("#anchor-LEFT_EYE")).toBeInTheDocument();
    expect(container.querySelector("#anchor-TAIL_TIP")).toBeInTheDocument();
  });

  it("renders modular slots when slot props are provided", () => {
    const appearance = createDefaultSylvAppearance("male");
    const { container } = render(
      <SylvRenderer
        appearance={appearance}
        slots={{
          foregroundEffects: <circle id="custom-sparkle" cx="200" cy="200" r="10" />,
          headAccessory: <rect id="custom-halo" x="180" y="40" width="40" height="10" />,
        }}
      />
    );

    expect(container.querySelector("#custom-sparkle")).toBeInTheDocument();
    expect(container.querySelector("#custom-halo")).toBeInTheDocument();
  });
});
