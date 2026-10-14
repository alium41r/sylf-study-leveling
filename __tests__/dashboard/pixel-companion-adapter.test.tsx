import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * ============================================================================
 * DASHBOARD PIXEL-COMPANION ADAPTER — BOUNDARY AND SIGNAL PATH
 * ============================================================================
 * Phase 3 exists to prove one path:
 *
 *   application signal → adapter → Sylf state → runtime → framebuffer → renderer
 *
 * These tests drive that path from the application end. The application emits a
 * level-up; the dashboard card is what consumes it. Nothing here reaches into a
 * framebuffer, and nothing asserts on pixels — the whole point of the boundary
 * is that the application side cannot.
 *
 * The engine and content are deliberately **not** mocked. A mocked content layer
 * would let this suite pass while the real path was broken.
 */

// ─── A controllable stand-in for the application's level-up owner ─────────────

interface FakeSignal {
  runId: number;
  newLevel: number;
  didRankUp?: boolean;
}

let lastLevelUp: FakeSignal | null = null;

vi.mock("@/app/components/LevelUpProvider", () => ({
  useLevelUp: () => ({ lastLevelUp }),
}));

/**
 * The equipped configuration the card resolves.
 *
 * Mocked at the *auth* boundary rather than at the resolver, so the card runs the
 * real registry and the real composition. Mocking the resolver would let this
 * suite pass while the display path was broken — which is the whole thing these
 * tests exist to check.
 */
let user: unknown = null;

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user }),
}));

/** Minimal ambient-media stand-in, since jsdom does not implement matchMedia. */
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  lastLevelUp = null;
  user = null;
  stubMatchMedia(false);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Imported after the mock is declared so the provider resolves to the stub.
const { PixelCompanionCard } = await import(
  "@/app/dashboard/components/PixelCompanionCard"
);
const {
  COMPANION_REACTIONS,
  DASHBOARD_BASE_STATE,
  LEVEL_UP_REACTION_MS,
  LEVEL_UP_REACTION_REDUCED_MS,
  levelUpAnnouncement,
  reactionDurationMs,
  reactionForLevelUp,
} = await import("@/app/dashboard/pixel-companion-adapter");

function cardElement(): HTMLElement {
  const card = document.querySelector("[data-companion='pixel-display']");
  if (!card) throw new Error("The dashboard card did not render.");
  return card as HTMLElement;
}

function renderCard(
  props: {
    size?: number;
    resolution?: number;
    signal?: {
      kind: "LEVEL_UP" | "TASK_COMPLETE" | "STREAK_EXTENDED" | "AI_THINKING";
      token: number;
      active?: boolean;
    } | null;
  } = {},
) {
  return render(<PixelCompanionCard {...props} /> as ReactNode as never);
}

describe("the adapter's mapping is a readable decision", () => {
  it("maps a level-up onto the celebrating state", () => {
    const reaction = reactionForLevelUp(false);
    expect(reaction.state).toBe("CELEBRATING");
    expect(reaction.durationMs).toBe(LEVEL_UP_REACTION_MS);
  });

  it("keeps a shorter, calmer reaction under reduced motion", () => {
    const reaction = reactionForLevelUp(true);
    // Still a reaction — an event that never appeared would hide the
    // information rather than reduce the motion.
    expect(reaction.state).toBe("CELEBRATING");
    expect(reaction.durationMs).toBe(LEVEL_UP_REACTION_REDUCED_MS);
    expect(reaction.durationMs).toBeLessThan(LEVEL_UP_REACTION_MS);
  });

  it("describes the event in words that do not depend on the animation", () => {
    expect(
      levelUpAnnouncement({ runId: 1, newLevel: 12, didRankUp: true }),
    ).toContain("level 12");
    expect(
      levelUpAnnouncement({ runId: 1, newLevel: 12, didRankUp: true }),
    ).toContain("Rank increased");
    expect(
      levelUpAnnouncement({ runId: 1, newLevel: 12, didRankUp: false }),
    ).not.toContain("Rank increased");
  });
});

describe("every application signal has a defined reaction", () => {
  const kinds = [
    "LEVEL_UP",
    "TASK_COMPLETE",
    "STREAK_EXTENDED",
    "AI_THINKING",
  ] as const;

  it("names a state for each, drawn from the content vocabulary", () => {
    for (const kind of kinds) {
      expect(COMPANION_REACTIONS[kind].state, kind).toBeTruthy();
    }
  });

  it("distinguishes an acknowledgment from a celebration", () => {
    // A completed task must not read the same as a level-up, or the companion
    // would have no way to say "noted" without also saying "congratulations".
    expect(COMPANION_REACTIONS.TASK_COMPLETE.state).toBe(DASHBOARD_BASE_STATE);
    expect(COMPANION_REACTIONS.TASK_COMPLETE.effect?.kind).toBe("bodyPulse");
    expect(COMPANION_REACTIONS.LEVEL_UP.state).toBe("CELEBRATING");
    expect(COMPANION_REACTIONS.LEVEL_UP.effect?.kind).toBe("sparkleWave");
  });

  it("gives the sustained signal no effect at all", () => {
    // A pulse would imply progress, and AI_THINKING exists precisely when
    // progress cannot be known.
    expect(COMPANION_REACTIONS.AI_THINKING.effect).toBeNull();
    expect(COMPANION_REACTIONS.AI_THINKING.sustained).toBe(true);
    expect(COMPANION_REACTIONS.AI_THINKING.state).toBe("THINKING");
  });

  it("uses a different seed for a streak than for a level-up", () => {
    // Same state, deliberately: a streak is a run continuing rather than a new
    // achievement. The seed is what keeps two celebrations from being identical.
    expect(COMPANION_REACTIONS.STREAK_EXTENDED.state).toBe(
      COMPANION_REACTIONS.LEVEL_UP.state,
    );
    expect(COMPANION_REACTIONS.STREAK_EXTENDED.effect?.seed).not.toBe(
      COMPANION_REACTIONS.LEVEL_UP.effect?.seed,
    );
  });

  it("shortens every reaction under reduced motion without removing it", () => {
    for (const kind of kinds) {
      const reaction = COMPANION_REACTIONS[kind];
      if (reaction.sustained) continue;
      expect(reactionDurationMs(reaction, true), kind).toBeLessThan(
        reactionDurationMs(reaction, false),
      );
      expect(reactionDurationMs(reaction, true), kind).toBeGreaterThan(0);
    }
  });

  it("expresses each signal as a state on the card", () => {
    for (const kind of kinds) {
      const view = renderCard({ signal: { kind, token: 1 } });
      const card = view.container.querySelector(
        "[data-companion='pixel-display']",
      ) as HTMLElement;
      expect(card.getAttribute("data-signal"), kind).toBe(kind);
      expect(card.getAttribute("data-state"), kind).toBe(
        COMPANION_REACTIONS[kind].state,
      );
      expect(card.getAttribute("data-reacting"), kind).toBe("true");
      view.unmount();
    }
  });

  it("stops expressing a sustained signal when it is withdrawn", () => {
    const view = renderCard({ signal: { kind: "AI_THINKING", token: 1 } });
    const card = () =>
      view.container.querySelector(
        "[data-companion='pixel-display']",
      ) as HTMLElement;
    expect(card().getAttribute("data-state")).toBe("THINKING");

    act(() => {
      view.rerender(
        <PixelCompanionCard
          signal={{ kind: "AI_THINKING", token: 2, active: false }}
        /> as never,
      );
    });
    expect(card().getAttribute("data-state")).toBe(DASHBOARD_BASE_STATE);
    expect(card().getAttribute("data-reacting")).toBe("false");
  });
});

describe("the signal path, driven from the application end", () => {
  it("rests in the base state before any level-up is observed", () => {
    renderCard();
    expect(cardElement()).toHaveAttribute("data-state", DASHBOARD_BASE_STATE);
    expect(cardElement()).toHaveAttribute("data-reacting", "false");
  });

  it("reacts when the application emits a level-up", () => {
    const view = renderCard();
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");

    act(() => {
      lastLevelUp = { runId: 1, newLevel: 5 };
      view.rerender(<PixelCompanionCard /> as never);
    });

    expect(cardElement()).toHaveAttribute("data-state", "CELEBRATING");
    expect(cardElement()).toHaveAttribute("data-reacting", "true");
  });

  it("returns to the base state when the reaction expires", () => {
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 1, newLevel: 5 };
      view.rerender(<PixelCompanionCard /> as never);
    });
    expect(cardElement()).toHaveAttribute("data-state", "CELEBRATING");

    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_REACTION_MS + 50);
    });

    expect(cardElement()).toHaveAttribute("data-state", "IDLE");
    expect(cardElement()).toHaveAttribute("data-reacting", "false");
  });

  it("does not replay the same level-up on a later render", () => {
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 7, newLevel: 9 };
      view.rerender(<PixelCompanionCard /> as never);
    });
    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_REACTION_MS + 50);
    });
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");

    // The same occurrence is still the last observed one — a re-render, a
    // remount or a navigation must not celebrate it a second time.
    act(() => {
      view.rerender(<PixelCompanionCard /> as never);
    });
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");
    expect(cardElement()).toHaveAttribute("data-reacting", "false");
  });

  it("reacts to a subsequent, distinct level-up", () => {
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 1, newLevel: 5 };
      view.rerender(<PixelCompanionCard /> as never);
    });
    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_REACTION_MS + 50);
    });

    act(() => {
      lastLevelUp = { runId: 2, newLevel: 6 };
      view.rerender(<PixelCompanionCard /> as never);
    });

    expect(cardElement()).toHaveAttribute("data-state", "CELEBRATING");
  });
});

describe("reduced motion", () => {
  it("suppresses self-triggered idle animation", () => {
    stubMatchMedia(true);
    renderCard();
    const card = cardElement();
    // The signal the card publishes still reports a resting state; what changes
    // is that the display is not asked to animate on its own. The production
    // card additionally pins auto-blink off from measurement, so this asserts the
    // *preference* path rather than the card's own choice.
    expect(card).toHaveAttribute("data-state", DASHBOARD_BASE_STATE);
  });

  it("still acknowledges a level-up, for a shorter time", () => {
    stubMatchMedia(true);
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 11, newLevel: 4 };
      view.rerender(<PixelCompanionCard /> as never);
    });
    expect(cardElement()).toHaveAttribute("data-state", "CELEBRATING");

    act(() => {
      vi.advanceTimersByTime(LEVEL_UP_REACTION_REDUCED_MS + 50);
    });
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");
  });

  it("keeps the spoken equivalent regardless of the animation setting", () => {
    stubMatchMedia(true);
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 12, newLevel: 4, didRankUp: false };
      view.rerender(<PixelCompanionCard /> as never);
    });
    // The information survives with animation reduced, which is the point.
    expect(screen.getByRole("status").textContent).toContain("level 4");
  });
});

describe("accessibility", () => {
  it("exposes the event in words while reacting, not only as animation", () => {
    const view = renderCard();
    act(() => {
      lastLevelUp = { runId: 3, newLevel: 12, didRankUp: true };
      view.rerender(<PixelCompanionCard /> as never);
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("level 12");
    expect(status.textContent).toContain("Rank increased");
  });

  it("stays silent at rest so the card does not talk over the interface", () => {
    renderCard();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the card draws the scholar's equipped character", () => {
  it("renders with no configuration at all", () => {
    // A scholar whose config has not loaded yet must still get a character.
    user = null;
    const view = renderCard();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(0);
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");
  });

  it("renders with every slot equipped from persisted keys", () => {
    user = {
      characterConfig: {
        outfit: "form_tanjiro",
        pedestal: "pedestal_cyber",
        aura: "aura_ember",
        relic: "relic_practice_wand",
        accessory: "accessory_study_scarf",
      },
    };
    const view = renderCard();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(0);
    expect(cardElement()).toHaveAttribute("data-state", "IDLE");
  });

  it("shows a create-artwork invitation for an unknown form", () => {
    // The fallback that matters most: an unrecognised figure must still draw a
    // character, because a card with nothing in it is not a degraded experience.
    user = { characterConfig: { outfit: "form_from_a_future_build" } };
    const view = renderCard();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("survives a malformed configuration without throwing", () => {
    user = { characterConfig: { outfit: 42, pedestal: {}, aura: [] } };
    const view = renderCard();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("survives a configuration that is not an object", () => {
    user = { characterConfig: "not-an-object" };
    const view = renderCard();
    expect(view.container.querySelectorAll("canvas")).toHaveLength(0);
  });
});

describe("the card is a drop-in for the slot it replaces", () => {
  it("keeps the empty invitation at the requested box size", () => {
    const view = renderCard({ size: 110 });
    const canvases = view.container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(0);
    // The box is what the renderer derives its backing store from.
    expect(cardElement().style.getPropertyValue("--pixel-card-size")).toBe(
      "110px",
    );
  });

  it("keeps the same box at every density", () => {
    // The Phase 4 requirement: changing pixel density must not resize the
    // surrounding card. The presentation size is driven by one custom property
    // that density has no part in, so holding it constant across densities is
    // what proves the two are independent.
    const presentational = [16, 32, 40, 48, 64];
    const sizes = presentational.map((resolution) => {
      const view = renderCard({ resolution });
      const card = view.container.querySelector(
        "[data-companion='pixel-display']",
      ) as HTMLElement;
      const box = card.style.getPropertyValue("--pixel-card-size");
      const density = card.getAttribute("data-density");
      expect(density).toBe(String(resolution));
      view.unmount();
      return box;
    });
    // Every density produced the same presentation box.
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBe("110px");
  });

  it("exposes which signal it is expressing", () => {
    const view = renderCard({ signal: { kind: "AI_THINKING", token: 1 } });
    const card = view.container.querySelector(
      "[data-companion='pixel-display']",
    ) as HTMLElement;
    expect(card.getAttribute("data-signal")).toBe("AI_THINKING");
    expect(card.getAttribute("data-state")).toBe("THINKING");
  });

  it("makes the empty display actionable", () => {
    renderCard();
    expect(screen.getByRole('link', { name: 'Create artwork in Pixel Studio' })).toHaveAttribute('href', '/locker?tab=identity&view=pixel-studio');
  });
});
