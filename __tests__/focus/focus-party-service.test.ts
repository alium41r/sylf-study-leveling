/**
 * Focus Party Backend Service & Invariant Verification Suite
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  deriveMemberTimer,
  deriveCollectiveSeconds,
  mapFocusPartyError,
} from "@/lib/focus-party-service";

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "prisma", "migrations");
const migrationSql = fs.readFileSync(
  path.join(MIGRATIONS_DIR, "20260907000000_focus_party_foundation", "migration.sql"),
  "utf8"
);

describe("Focus Party: Pure Timer Derivation Helpers", () => {
  const T0 = 1_700_000_000_000; // Reference epoch ms

  it("returns 0 liveSeconds for NOT_STARTED timer", () => {
    const res = deriveMemberTimer(0, null, "NOT_STARTED", T0);
    expect(res.liveSeconds).toBe(0);
    expect(res.isFocusing).toBe(false);
  });

  it("derives live elapsed seconds when timerState is FOCUSING", () => {
    const startedAt = new Date(T0).toISOString();
    // 45 seconds later
    const res = deriveMemberTimer(100, startedAt, "FOCUSING", T0 + 45_000);
    expect(res.liveSeconds).toBe(145);
    expect(res.isFocusing).toBe(true);
  });

  it("freezes live elapsed seconds when timerState is PAUSED", () => {
    const res = deriveMemberTimer(310, null, "PAUSED", T0 + 100_000);
    expect(res.liveSeconds).toBe(310);
    expect(res.isFocusing).toBe(false);
  });

  it("preserves accumulated seconds when timerState is LEFT", () => {
    const res = deriveMemberTimer(1200, null, "LEFT", T0 + 200_000);
    expect(res.liveSeconds).toBe(1200);
    expect(res.isFocusing).toBe(false);
  });

  it("calculates collective focus time across multiple participants", () => {
    const members = [
      // Ali: 100s banked + 20s live = 120s
      {
        accumulatedSeconds: 100,
        currentStartedAt: new Date(T0).toISOString(),
        timerState: "FOCUSING" as const,
      },
      // Dark: 80s banked, paused = 80s
      {
        accumulatedSeconds: 80,
        currentStartedAt: null,
        timerState: "PAUSED" as const,
      },
      // Sara: 0s, not started = 0s
      {
        accumulatedSeconds: 0,
        currentStartedAt: null,
        timerState: "NOT_STARTED" as const,
      },
      // Omar: 200s banked, left room = 200s
      {
        accumulatedSeconds: 200,
        currentStartedAt: null,
        timerState: "LEFT" as const,
      },
    ];

    const collective = deriveCollectiveSeconds(members, T0 + 20_000);
    // 120 + 80 + 0 + 200 = 400s
    expect(collective).toBe(400);
  });
});

describe("Focus Party: Database Invariant & Security Pinnings", () => {
  it("pins max 4 members capacity trigger and serialization lock", () => {
    expect(migrationSql).toContain("trg_check_focus_party_capacity");
    expect(migrationSql).toContain("SELECT count(*) INTO v_count");
    expect(migrationSql).toContain("IF v_count >= 4 THEN");
    expect(migrationSql).toContain("Party is full (maximum 4 members)");
    expect(migrationSql).toContain("PERFORM 1 FROM public.\"FocusParty\" WHERE id = NEW.\"partyId\" FOR UPDATE");
  });

  it("pins single active session per party partial unique index", () => {
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "focus_session_single_active_per_party"\s+ON public\."FocusSession" \("partyId"\)\s+WHERE "endedAt" IS NULL;/
    );
  });

  it("pins unique memberships per party and session", () => {
    expect(migrationSql).toContain('CONSTRAINT "FocusPartyMember_partyId_userId_key" UNIQUE ("partyId", "userId")');
    expect(migrationSql).toContain('CONSTRAINT "FocusSessionMember_sessionId_userId_key" UNIQUE ("sessionId", "userId")');
  });

  it("pins session participant party membership trigger", () => {
    expect(migrationSql).toContain("trg_check_focus_session_member_party");
    expect(migrationSql).toContain("User must be a member of the party to join its focus session");
  });

  it("pins ended session protection trigger", () => {
    expect(migrationSql).toContain("trg_check_focus_session_ended_guard");
    expect(migrationSql).toContain("Cannot modify timer state for an ended focus session");
  });

  it("pins RLS policies and own-timer modification boundary", () => {
    expect(migrationSql).toContain('ALTER TABLE public."FocusParty" ENABLE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusPartyMember" ENABLE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusSession" ENABLE ROW LEVEL SECURITY;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusSessionMember" ENABLE ROW LEVEL SECURITY;');

    // Users may modify ONLY their own timer
    expect(migrationSql).toMatch(/CREATE POLICY "focus_session_member_update" ON public\."FocusSessionMember"/);
    expect(migrationSql).toMatch(/USING \("userId" = COALESCE\(\(auth\.jwt\(\) ->> 'sub'\)::bigint/);
    expect(migrationSql).toMatch(/WITH CHECK \("userId" = COALESCE\(\(auth\.jwt\(\) ->> 'sub'\)::bigint/);
  });

  it("pins automatic leadership transfer to oldest joined member", () => {
    expect(migrationSql).toContain('SELECT "userId" INTO v_new_leader_id');
    expect(migrationSql).toContain('ORDER BY "joinedAt" ASC, id ASC');
    expect(migrationSql).toContain('LIMIT 1');
  });

  it("pins atomic create-or-join with race condition defense", () => {
    expect(migrationSql).toContain('ON CONFLICT ("partyId") WHERE "endedAt" IS NULL DO NOTHING');
  });

  it("pins cumulative time preservation on rejoin", () => {
    expect(migrationSql).toContain("IF v_member.\"timerState\" = 'LEFT' THEN");
    expect(migrationSql).toContain("CASE WHEN v_member.\"accumulatedSeconds\" > 0 THEN 'PAUSED'");
  });

  it("pins Realtime publication and REPLICA IDENTITY FULL", () => {
    expect(migrationSql).toContain('ALTER TABLE public."FocusParty" REPLICA IDENTITY FULL;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusPartyMember" REPLICA IDENTITY FULL;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusSession" REPLICA IDENTITY FULL;');
    expect(migrationSql).toContain('ALTER TABLE public."FocusSessionMember" REPLICA IDENTITY FULL;');
    expect(migrationSql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusParty";');
    expect(migrationSql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public."FocusSessionMember";');
  });

  it("pins single active party per user invariant trigger and concurrency lock", () => {
    const singleActiveMigrationSql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, "20260907030000_focus_party_single_active_membership", "migration.sql"),
      "utf8"
    );
    expect(singleActiveMigrationSql).toContain("trg_check_user_single_active_party");
    expect(singleActiveMigrationSql).toContain("User already belongs to an active Focus Party");
    expect(singleActiveMigrationSql).toContain('PERFORM 1 FROM public."User" WHERE id = NEW."userId" FOR UPDATE;');
    expect(singleActiveMigrationSql).toContain('PERFORM 1 FROM public."User" WHERE id = p_user_id FOR UPDATE;');
  });
});

describe("Focus Party: Domain Error Mapping", () => {
  it("maps active party conflict to USER_ALREADY_IN_PARTY domain error", () => {
    const err = mapFocusPartyError(new Error("check_violation: User already belongs to an active Focus Party"));
    expect(err.code).toBe("USER_ALREADY_IN_PARTY");
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain("Leave your current party first");
  });
});

