# ADR 0017 — HP stays off Native

**Accepted 4 November 2026, from the owner's instruction on 1 November.** Expansion Part 2.

## Context

Web has HP. A missed daily goal costs it, and `enableHpPenalty` defaults to true. Part 1 found that the setting was never honoured anywhere, and that the heartbeat and `calendar/month` run the lazy overdue and reconciliation jobs, so a Native session could have started penalising a student who never saw HP.

## Decision

1. **Native never shows HP.** No screen, number, bar or sentence. Attribute copy that mentions it is left out (`mentionsHp`).
2. **A Native-only student is never penalised.** Accounts created on Native, by password or OAuth, start with `enableHpPenalty` off. Native sessions never trigger reconciliation (`heartbeat`, `calendar/month`).
3. **The setting is honoured everywhere** on the server: reconciliation, the overdue job and the late path of `claim_quest_reward` (migration `20261101120000_quest_penalty_honors_setting`).
4. **HP is deferred, not removed.** A later phase can design it for Native. Until then, nothing on Native reads or writes `enableHpPenalty`.

## Consequences

- A student who uses both clients keeps web's behaviour on web.
- Onboarding does not explain HP, because Native has none to explain.
- The migration is not applied to any hosted database yet. Deploying it is the owner's step.
