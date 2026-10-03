import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SkillTreeCore from "@/app/components/landing/SkillTreeCore";
import { rankForLevel, xpForNextLevel } from "@/lib/game-engine";

describe("SkillTreeCore Component", () => {
  it("renders the SVG living skill tree with accessible role and label", () => {
    render(<SkillTreeCore />);
    const tree = screen.getByRole("img", {
      name: /sylf living skill tree/i,
    });
    expect(tree).toBeInTheDocument();
  });

  it("consumes canonical progression data for the scholar tier", () => {
    const level = 3;
    const rank = rankForLevel(level);
    expect(rank).toBe("E");
    const nextBracket = xpForNextLevel(level);
    expect(nextBracket).toBeGreaterThan(0);
  });

  it("handles isInputActive prop gracefully", () => {
    const { rerender } = render(<SkillTreeCore isInputActive={false} />);
    const tree = screen.getByRole("img");
    expect(tree).toBeInTheDocument();

    rerender(<SkillTreeCore isInputActive={true} />);
    expect(tree).toBeInTheDocument();
  });

  it("renders the central hexagonal nexus and radiant nodes", () => {
    const { container } = render(<SkillTreeCore />);
    // Check for SVG polygons (hexagons)
    const polygons = container.querySelectorAll("polygon");
    expect(polygons.length).toBeGreaterThan(0);
    // Check for SVG paths (branches)
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(10);
  });
});
