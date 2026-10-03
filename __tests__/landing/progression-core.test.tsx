import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressionCore from "@/app/components/landing/ProgressionCore";
import {
  calculateRequiredXp,
  xpForNextLevel,
  rankForLevel,
  awardXP,
} from "@/lib/game-engine";

describe("ProgressionCore Component", () => {
  it("renders the SVG dial with accessible role and label", () => {
    render(<ProgressionCore />);
    const dial = screen.getByRole("img", {
      name: /sylf study progression dial/i,
    });
    expect(dial).toBeInTheDocument();
  });

  it("consumes canonical progression data accurately", () => {
    // Verify that the mathematical values consumed in ProgressionCore match canonical formulas
    const startingLevel = 9;
    const initialRank = rankForLevel(startingLevel);
    expect(initialRank).toBe("E");

    const bracketXP = xpForNextLevel(startingLevel);
    expect(bracketXP).toBe(calculateRequiredXp(10) - calculateRequiredXp(9));
    expect(bracketXP).toBe(462);

    // 30 min focus session with 1.1x multiplier = 165 XP
    const outcome = awardXP(startingLevel, Math.floor(bracketXP * 0.692), 0, 165);
    expect(outcome.newLevel).toBe(10);
    expect(outcome.newRank).toBe("D");
    expect(outcome.didRankUp).toBe(true);
  });

  it("handles isInputActive prop gracefully", () => {
    const { rerender } = render(<ProgressionCore isInputActive={false} />);
    const dial = screen.getByRole("img");
    expect(dial).toBeInTheDocument();

    rerender(<ProgressionCore isInputActive={true} />);
    expect(dial).toBeInTheDocument();
  });

  it("renders level numeral text within the vector core", () => {
    render(<ProgressionCore />);
    // Initial or milestone level should be visible
    expect(screen.getByText(/LV\./i)).toBeInTheDocument();
    expect(screen.getByText(/RANK SCHOLAR/i)).toBeInTheDocument();
  });
});
