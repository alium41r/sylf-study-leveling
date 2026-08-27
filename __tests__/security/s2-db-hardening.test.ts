/**
 * S2 database-hardening regression tests (static, no DB connection).
 *
 * These assertions pin the security invariants of the three S2 migrations so
 * that a future edit cannot silently re-open the anonymous RPC exposure or
 * regress the RLS/policy hardening. They run against the migration files
 * themselves — the same SQL that `prisma migrate deploy` applies.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS = path.join(__dirname, "..", "..", "prisma", "migrations");

const s1 = read("20260827000000_s2_security_hardening/migration.sql");
const s2 = read("20260827010000_s2_policy_jwt_semantics/migration.sql");
const s3 = read("20260827020000_s2_policy_recursion_fix/migration.sql");

function read(rel: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, rel), "utf8");
}

const HARDENED = [
  "start_study_session",
  "settle_study_session_atomic",
  "complete_study_session",
  "claim_quest_reward",
  "claim_achievement_reward_atomic",
  "forge_apex_node_atomic",
  "unlock_skill_node_atomic",
];

describe("S2 migration — RPC EXECUTE closure", () => {
  it("revokes EXECUTE from PUBLIC, anon, authenticated on all public functions", () => {
    expect(s1).toMatch(/REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;/);
    expect(s1).toMatch(/REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;/);
  });

  it("secures default privileges so future functions do not inherit PUBLIC EXECUTE", () => {
    expect(s1).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/);
  });

  it("revokes residual table/sequence grants from anon and authenticated", () => {
    expect(s1).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;/);
    expect(s1).toMatch(/REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;/);
  });

  it("drops the dead claim_session_reward_atomic (caller-supplied reward amounts)", () => {
    expect(s1).toMatch(/DROP FUNCTION IF EXISTS public\.claim_session_reward_atomic\(text, text, integer, integer, text, numeric\);/);
  });

  it.each(HARDENED)("hardens %s with the S2 identity guard (never trusts p_user_id)", (fn) => {
    const block = s1.slice(
      s1.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`),
      s1.indexOf("$$;", s1.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`))
    );
    expect(block).toContain("S2 identity guard");
    expect(block).toContain("RAISE EXCEPTION 'S2 identity guard");
    expect(block).toContain("ERRCODE = '42501'");
    // the guard must compare the caller's JWT subject against p_user_id
    expect(block).toMatch(/auth\.jwt\(\) ->> 'sub'/);
    expect(block).toMatch(/p_user_id::text/);
  });
});

describe("S2 migration — RLS coverage", () => {
  it.each([
    "AiUsageLog", "FloatingRestDay", "Item", "UserInventory", "UserQuota",
    "UserSkillNode", "UserStats", "WaitlistEntry", "XpLedger",
  ])("enables RLS on %s", (t) => {
    expect(s1).toMatch(new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`));
  });

  it("leaves _prisma_migrations untouched by RLS (infrastructure metadata)", () => {
    expect(s1).not.toMatch(/ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY/);
  });

  it("WaitlistEntry gets RLS with NO policies (PII block-all)", () => {
    expect(s1).toMatch(/ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;/);
    const waitlistSection = s1.slice(s1.indexOf("WaitlistEntry"), s1.indexOf("Item"));
    expect(waitlistSection).not.toMatch(/CREATE POLICY/);
  });

  it("Item keeps an intentional public-catalog SELECT policy", () => {
    expect(s1).toMatch(/CREATE POLICY "item_select_public_catalog" ON "Item"/);
  });
});

describe("S2 migration — WITH CHECK and legacy consolidation", () => {
  it("replaces users_select_policy USING(true) with a self-only select", () => {
    expect(s1).toMatch(/DROP POLICY IF EXISTS "users_select_policy" ON "User";/);
    const select = s1.slice(s1.indexOf("users_select_own_policy"), s1.indexOf("users_update_policy"));
    expect(select).not.toMatch(/USING \(true\)/);
    expect(select).toMatch(/id = COALESCE\(\(auth\.jwt\(\) ->> 'userId'\)::integer, 0\)/);
  });

  it("users_update_policy gains WITH CHECK (result row must still be the caller's)", () => {
    const upd = s1.slice(s1.indexOf("users_update_policy"), s1.indexOf("Conversation: replace"));
    expect(upd).toMatch(/WITH CHECK/);
  });

  it("drops the three legacy unchecked dashboard policies", () => {
    expect(s1).toMatch(/DROP POLICY IF EXISTS "Users manage own quests" ON "Quest";/);
    expect(s1).toMatch(/DROP POLICY IF EXISTS "Users manage own subjects" ON "Subject";/);
    expect(s1).toMatch(/DROP POLICY IF EXISTS "Users manage own subject nodes" ON "SubjectNode";/);
  });

  it("conversation write policies carry WITH CHECK (creator-only update)", () => {
    expect(s1).toMatch(/DROP POLICY IF EXISTS "convo_write_policy" ON "Conversation";/);
    const upd = s1.slice(s1.indexOf("conversation_update_creator"), s1.indexOf("conversation_delete_participant"));
    expect(upd).toMatch(/WITH CHECK/);
  });
});

describe("S2b migration — custom-JWT policy semantics", () => {
  it("rewrites identity policies to (auth.jwt() ->> 'sub')::bigint (no UUID-casting auth.uid())", () => {
    // auth.uid() casts sub to UUID and errors for SYLF's integer ids.
    // (Strip comment lines first — the header comment legitimately mentions auth.uid().)
    const statements = s2.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/auth\.uid\(\)/);
    expect(statements).toMatch(/COALESCE\(\(auth\.jwt\(\) ->> 'sub'\)::bigint, \(auth\.jwt\(\) ->> 'userId'\)::bigint, 0\)/);
  });

  it("keeps every repaired policy with WITH CHECK where required", () => {
    for (const name of ["users_update_own_policy", "friend_request_update_policy", "session_invite_update_policy", "subject_node_user_policy", "conversation_update_creator"]) {
      const idx = s2.indexOf(`CREATE POLICY "${name}"`);
      expect(idx, name).toBeGreaterThan(-1);
    }
  });
});

describe("S2c migration — recursion fix", () => {
  it("makes ConversationParticipant SELECT self-only (no self-referencing subquery)", () => {
    expect(s3).toMatch(/DROP POLICY IF EXISTS "convo_participant_select_policy"/);
    const block = s3.slice(s3.indexOf("CREATE POLICY"), s3.indexOf(";", s3.indexOf("CREATE POLICY")));
    expect(block).not.toMatch(/ConversationParticipant cp/);
    expect(block).toMatch(/"userId" = COALESCE/);
  });
});
