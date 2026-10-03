import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { LevelUpProvider, useLevelUp } from "@/app/components/LevelUpProvider";
import type { UserStats } from "@/app/components/AuthProvider";

/**
 * Level-up celebration contract.
 *
 * The overlay is presentation only. These tests pin the two behaviours that
 * must not regress: the real progression signal (an increase in `user.level`)
 * is what starts the sequence, and nothing in the celebration path writes
 * progression data.
 */

let currentUser: UserStats | null = null;

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false }),
}));

function makeUser(overrides: Partial<UserStats> = {}): UserStats {
  return {
    id: 1,
    email: "scholar@sylf.test",
    username: "scholar",
    name: null,
    hunterRank: "E",
    level: 1,
    currentXP: 0,
    xpToNextLevel: 282,
    hp: 100,
    maxHp: 100,
    streakDays: 0,
    totalStudyMinutes: 0,
    sylph: 0,
    hasCompletedOnboarding: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function TriggerProbe() {
  const { triggerLevelUp } = useLevelUp();
  return (
    <button type="button" onClick={() => triggerLevelUp({ xpGained: 240 })}>
      probe
    </button>
  );
}

const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  currentUser = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LevelUpProvider — real level-up detection", () => {
  it("stays silent on the first observation so signing in never celebrates", () => {
    currentUser = makeUser({ level: 12 });
    const { rerender } = render(
      <LevelUpProvider>
        <div />
      </LevelUpProvider>
    );

    rerender(
      <LevelUpProvider>
        <div />
      </LevelUpProvider>
    );

    expect(dialog()).toBeNull();
  });

  it("celebrates when the scholar's level increases", () => {
    currentUser = makeUser({ level: 4, hunterRank: "E" });
    const { rerender } = render(
      <LevelUpProvider>
        <div />
      </LevelUpProvider>
    );

    currentUser = makeUser({ level: 5, hunterRank: "E" });
    act(() => {
      rerender(
        <LevelUpProvider>
          <div />
        </LevelUpProvider>
      );
    });

    // The new level is announced up front; the odometer then rolls to it.
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-label",
      "Level up. Level 5."
    );
    expect(screen.getByText("LV. 4")).toBeInTheDocument();
  });

  it("derives a rank promotion from the canonical ladder when the rank tier changes", () => {
    currentUser = makeUser({ level: 9, hunterRank: "E" });
    const { rerender } = render(
      <LevelUpProvider>
        <div />
      </LevelUpProvider>
    );

    currentUser = makeUser({ level: 10, hunterRank: "D" });
    act(() => {
      rerender(
        <LevelUpProvider>
          <div />
        </LevelUpProvider>
      );
    });

    expect(screen.getByText("Rank Promoted")).toBeInTheDocument();
    expect(screen.getByText("E-Rank → D-Rank")).toBeInTheDocument();
  });

  it("does not celebrate a downgrade or an account switch", () => {
    currentUser = makeUser({ id: 1, level: 20 });
    const { rerender } = render(
      <LevelUpProvider>
        <div />
      </LevelUpProvider>
    );

    // Same scholar, level repaired downwards — re-baseline quietly.
    currentUser = makeUser({ id: 1, level: 18 });
    act(() => {
      rerender(
        <LevelUpProvider>
          <div />
        </LevelUpProvider>
      );
    });
    expect(dialog()).toBeNull();

    // A different scholar with a higher level signs in — never celebrate that.
    currentUser = makeUser({ id: 2, level: 40 });
    act(() => {
      rerender(
        <LevelUpProvider>
          <div />
        </LevelUpProvider>
      );
    });
    expect(dialog()).toBeNull();

    // ...and that new scholar's first real level-up still works.
    currentUser = makeUser({ id: 2, level: 41 });
    act(() => {
      rerender(
        <LevelUpProvider>
          <div />
        </LevelUpProvider>
      );
    });
    expect(dialog()).not.toBeNull();
  });
});

describe("LevelUpProvider — presentation only", () => {
  it("triggers without issuing any network request", () => {
    currentUser = makeUser({ level: 7 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <LevelUpProvider>
        <TriggerProbe />
      </LevelUpProvider>
    );

    act(() => {
      screen.getByRole("button", { name: "probe" }).click();
    });

    expect(dialog()).not.toBeNull();
    expect(screen.getByText("+240 XP")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
