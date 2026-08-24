// ============================================================
// Intent Routing — semantic-equivalence test suite
// ============================================================
// For every deterministic capability: groups of phrasings that MUST
// resolve to the same intent (regardless of wording), plus queries
// that must NOT be captured (ambiguity → LLM). Confidence is checked
// on clean matches. This is the correctness boundary for the
// "no-LLM" engine: semantic coverage × deterministic accuracy.
// ============================================================

import { describe, it, expect } from "vitest";
import { matchIntent } from "../../lib/ai/intents/matcher";
import { resolveContinuation } from "../../lib/ai/intents/continuation";
import { TimeScope } from "../../lib/ai/intents/registry";

const intentOf = (q: string) => matchIntent(q)?.intent?.id ?? null;
const scopeOf = (q: string): TimeScope | null | undefined => matchIntent(q)?.params?.timeScope;

describe("Intent Routing — semantic equivalence", () => {
  describe("get_current_time", () => {
    const variants = [
      "What time is it?",
      "What's the time?",
      "Can you tell me the current time?",
      "What time is it right now?",
      "Do you know the time?",
      "Tell me the time.",
      "Current time?",
      "What time do I have right now?",
    ];
    it("resolves every wording variation to get_current_time", () => {
      for (const q of variants) expect(intentOf(q)).toBe("get_current_time");
    });
    it("handles texting shorthand (rn / pls)", () => {
      expect(intentOf("time rn")).toBe("get_current_time");
      expect(intentOf("whats the time rn")).toBe("get_current_time");
      expect(intentOf("time pls")).toBe("get_current_time");
    });
  });

  describe("get_current_date", () => {
    it("handles date phrasings", () => {
      expect(intentOf("whats the date")).toBe("get_current_date");
      expect(intentOf("what day is it today")).toBe("get_current_date");
    });
  });

  describe("get_user_level", () => {
    const variants = [
      "What's my level?",
      "What level am I?",
      "Which level am I currently on?",
      "Can you tell me my level?",
      "What is my current level?",
      "My level?",
      "Where am I at in terms of level?",
    ];
    it("resolves every wording variation to get_user_level", () => {
      for (const q of variants) expect(intentOf(q)).toBe("get_user_level");
    });
  });

  describe("get_user_xp", () => {
    it("matches phrasing variations with the same intent", () => {
      expect(intentOf("How much XP do I have?")).toBe("get_user_xp");
      expect(intentOf("whats my xp")).toBe("get_user_xp");
      expect(intentOf("how much experience have i earned")).toBe("get_user_xp");
    });

    it("extracts time scopes independently from the intent", () => {
      expect(scopeOf("How much XP did I get yesterday?")).toBe("yesterday");
      expect(scopeOf("How much XP have I earned this week?")).toBe("this_week");
      expect(scopeOf("xp so far today")).toBe("today");
      expect(scopeOf("how much xp in total")).toBe("total");
    });
  });

  describe("get_study_time", () => {
    const variants = [
      "How long have I studied today?",
      "How much have I studied today?",
      "What's my study time today?",
      "How many hours have I studied?",
      "How much time have I spent studying today?",
      "Tell me today's study duration.",
    ];
    it("resolves every wording variation to get_study_time", () => {
      for (const q of variants) expect(intentOf(q)).toBe("get_study_time");
    });
    it("supports scoped study time", () => {
      expect(scopeOf("how long did i study yesterday")).toBe("yesterday");
      expect(scopeOf("study time this week")).toBe("this_week");
    });
  });

  describe("get_quests", () => {
    const variants = [
      "What do I have today?",
      "what quests do i have",
      "Any quests today?",
      "Show my quests",
      "are my quests due today",
      "whats on my schedule today",
    ];
    it("resolves every wording variation to get_quests", () => {
      for (const q of variants) expect(intentOf(q)).toBe("get_quests");
    });
    it("supports scoped quest lists", () => {
      expect(scopeOf("my quests yesterday")).toBe("yesterday");
      expect(scopeOf("quests tomorrow")).toBe("tomorrow");
      expect(scopeOf("what quests do i have this week")).toBe("this_week");
    });
  });

  describe("stat intents (rank / hp / streak / sylph / name / goals / subjects)", () => {
    it("rank", () => {
      expect(intentOf("what is my rank")).toBe("get_user_rank");
      expect(intentOf("what rank am i")).toBe("get_user_rank");
      expect(intentOf("hows my hunter rank")).toBe("get_user_rank");
    });
    it("hp", () => {
      expect(intentOf("my hp")).toBe("get_user_hp");
      expect(intentOf("how is my health")).toBe("get_user_hp");
      expect(intentOf("how much hp do i have")).toBe("get_user_hp");
    });
    it("streak", () => {
      expect(intentOf("my streak")).toBe("get_streak");
      expect(intentOf("whats my weekly streak")).toBe("get_streak");
    });
    it("sylph", () => {
      expect(intentOf("how much sylph do i have")).toBe("get_user_sylph");
      expect(intentOf("sylph balance")).toBe("get_user_sylph");
    });
    it("name / identity", () => {
      expect(intentOf("whats my name")).toBe("get_user_name");
      expect(intentOf("who am i")).toBe("who_am_i");
    });
    it("goals", () => {
      expect(intentOf("my goals")).toBe("get_goals");
      expect(intentOf("how many goals do i have")).toBe("get_goals");
      expect(intentOf("whats my goal progress")).toBe("get_goals");
    });
    it("subjects", () => {
      expect(intentOf("what subjects do i have")).toBe("get_subjects");
      expect(intentOf("what am i studying")).toBe("get_subjects");
    });
    it("weekly target", () => {
      expect(intentOf("weekly quest progress")).toBe("get_weekly_target");
      expect(intentOf("hows my weekly target")).toBe("get_weekly_target");
    });
  });

  describe("confidence", () => {
    it("reports high confidence on clean matches", () => {
      const m = matchIntent("my level");
      expect(m).not.toBeNull();
      expect(m!.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("generalization (the previously-failing phrasings + unseen wording)", () => {
    it("resolves casual, polite, conversational and unseen variations", () => {
      expect(intentOf("time rn?")).toBe("get_current_time");
      expect(intentOf("Just curious, what's my current level?")).toBe("get_user_level");
      expect(intentOf("Could you tell me how much XP I need?")).toBe("get_xp_to_next_level");
      expect(intentOf("What's my study time looking like?")).toBe("get_study_time");
      expect(intentOf("Do you know what level I'm on?")).toBe("get_user_level");
      expect(intentOf("How much experience have I earned?")).toBe("get_user_xp");
      expect(intentOf("hey, what's my XP?")).toBe("get_user_xp");
      // Unseen wording (not present in any example):
      expect(intentOf("Hey, I was wondering which level I'm currently at.")).toBe("get_user_level");
      expect(intentOf("Could you remind me what the clock says?")).toBe("get_current_time");
      expect(intentOf("Just wondering how much experience I've accumulated.")).toBe("get_user_xp");
    });

    it("maps XP-to-next phrasings to get_xp_to_next_level", () => {
      expect(intentOf("how much more xp until i level up")).toBe("get_xp_to_next_level");
      expect(intentOf("what xp do i need for the next level")).toBe("get_xp_to_next_level");
      expect(intentOf("how far am i from the next level")).toBe("get_xp_to_next_level");
      expect(intentOf("how much xp left to level up")).toBe("get_xp_to_next_level");
    });
  });

  describe("adversarial — must NOT be deterministic", () => {
    const mustEscalate = [
      "How am I doing?",
      "What should I study?",
      "Why am I struggling?",
      "What do you think I should do?",
      "Am I studying enough?",
      "Help me plan tomorrow.",
      "Explain my progress.",
      "Why did my productivity drop?",
      "What's my level in physics?",
      "What level should I be at?",
      "What level do you think I can reach?",
      "How much XP should I earn?",
    ];
    it("keeps advice/hypothetical/qualified queries with the LLM", () => {
      for (const q of mustEscalate) expect(intentOf(q)).toBeNull();
    });
  });

  describe("ambiguity & escalation (must NOT match)", () => {
    const mustEscalate = [
      "What am I doing?",
      "How am I doing?",
      "why did my rank change",
      "explain what sylph is used for",
      "how do i keep my streak alive",
      "what level should i aim for",
      "move my physics quest to friday",
      "what quests do i have next week",
      "what is on my schedule next tuesday",
      "what is my status",
      "give me an insight",
      "how is math",
      "what does mitochondria mean",
      "tell me about my day and my plans",
    ];
    it("leaves ambiguous / out-of-capability queries for the LLM", () => {
      for (const q of mustEscalate) expect(intentOf(q)).toBeNull();
    });
  });

  describe("continuation resolution", () => {
    const xpToday = { intentId: "get_user_xp", params: { stat: "XP", timeScope: "today" as TimeScope } };
    const questsToday = { intentId: "get_quests", params: { stat: "QUESTS", timeScope: "today" as TimeScope } };

    it("shifts scope on 'what about yesterday?'", () => {
      const r = resolveContinuation("what about yesterday?", xpToday);
      expect(r).not.toBeNull();
      expect(r!.intentId).toBe("get_user_xp");
      expect(r!.params.timeScope).toBe("yesterday");
    });

    it("shifts scope forward with 'and tomorrow?' for quests", () => {
      const r = resolveContinuation("and tomorrow?", questsToday);
      expect(r!.intentId).toBe("get_quests");
      expect(r!.params.timeScope).toBe("tomorrow");
    });

    it("switches stat on 'and my level?'", () => {
      const r = resolveContinuation("and my level?", xpToday);
      expect(r!.intentId).toBe("get_user_level");
    });

    it("inherits a supported scope when switching stats", () => {
      const last = { intentId: "get_user_xp", params: { stat: "XP", timeScope: "this_week" as TimeScope } };
      const r = resolveContinuation("what about my study time?", last);
      expect(r).not.toBeNull();
      expect(r!.intentId).toBe("get_study_time");
      expect(r!.params.timeScope).toBe("this_week");
    });

    it("returns null without a previous cheap answer or valid follow-up", () => {
      expect(resolveContinuation("what about yesterday?", null)).toBeNull();
      expect(resolveContinuation("how am i doing", xpToday)).toBeNull();
      expect(resolveContinuation("explain relativity", xpToday)).toBeNull();
    });
  });
});
