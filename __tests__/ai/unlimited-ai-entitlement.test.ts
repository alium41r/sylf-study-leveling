/**
 * @vitest-environment node
 *
 * The entitlement POLICY: exactly who is unlimited, and — more importantly —
 * who is not. Every case here is fail-closed by design.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  UNLIMITED_AI_USER_IDS_ENV,
  getAiEntitlements,
  isUnlimitedAiUser,
  parseUnlimitedAiUserIds,
} from "@/lib/ai/entitlements";

const OWNER = 122;
const OTHER = 7;

/** Set (or clear) the single configuration variable. */
function configure(value: string | undefined) {
  if (value === undefined) delete process.env[UNLIMITED_AI_USER_IDS_ENV];
  else process.env[UNLIMITED_AI_USER_IDS_ENV] = value;
}

describe("AI entitlements: the configured owner account", () => {
  beforeEach(() => configure(undefined));
  afterEach(() => configure(undefined));

  it("grants exactly the configured User.id", () => {
    configure(String(OWNER));
    expect(isUnlimitedAiUser(OWNER)).toBe(true);
  });

  it("does not grant any other authenticated account", () => {
    configure(String(OWNER));
    expect(isUnlimitedAiUser(OTHER)).toBe(false);
    expect(isUnlimitedAiUser(OWNER + 1)).toBe(false);
    expect(isUnlimitedAiUser(1)).toBe(false);
  });

  it("exposes the full entitlement set with both quota families bypassed", () => {
    configure(String(OWNER));
    expect(getAiEntitlements(OWNER)).toEqual({
      userId: OWNER,
      unlimitedAi: true,
      bypassAiQuota: true,
      bypassPlannerQuota: true,
    });
  });

  it("returns a fully-denying entitlement set for everyone else", () => {
    configure(String(OWNER));
    expect(getAiEntitlements(OTHER)).toEqual({
      userId: OTHER,
      unlimitedAi: false,
      bypassAiQuota: false,
      bypassPlannerQuota: false,
    });
  });

  it("supports a comma-separated list and trims each entry", () => {
    configure(` ${OWNER} , 900 ,\t901 `);
    expect(isUnlimitedAiUser(OWNER)).toBe(true);
    expect(isUnlimitedAiUser(900)).toBe(true);
    expect(isUnlimitedAiUser(901)).toBe(true);
    expect(isUnlimitedAiUser(902)).toBe(false);
  });

  it("collapses duplicates without changing the outcome", () => {
    configure(`${OWNER},${OWNER},${OWNER}`);
    expect(isUnlimitedAiUser(OWNER)).toBe(true);
    expect(isUnlimitedAiUser(OTHER)).toBe(false);
  });

  it("tolerates a trailing comma — a blank slot grants nobody, the valid id still applies", () => {
    configure(`${OWNER},`);
    expect(isUnlimitedAiUser(OWNER)).toBe(true);
    expect(isUnlimitedAiUser(OTHER)).toBe(false);
  });
});

describe("AI entitlements: fail closed when unconfigured or malformed", () => {
  afterEach(() => configure(undefined));

  const DENYING_CASES: Array<[string, string | undefined]> = [
    ["variable absent", undefined],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["only commas", ",,,"],
    ["a non-numeric token", "owner"],
    ["an email address", "alium14r@gmail.com"],
    ["a UUID", "8f14e45f-ceea-467a-9c1c-1f0f5f6b7a10"],
    ["a JSON blob", '{"unlimited":true}'],
    ["a boolean", "true"],
    ["a wildcard", "*"],
    ["a prefix expression", "12*"],
    ["a zero id", "0"],
    ["a negative id", `-${OWNER}`],
    ["an id beyond int4", "99999999999"],
    ["a float", "122.0"],
    ["scientific notation", "1.22e2"],
    ["hex", "0x7a"],
    ["leading zeros (not the canonical id)", "0122"],
    ["an injected id with a suffix", `${OWNER}abc`],
    ["an injected id with a prefix", `abc${OWNER}`],
  ];

  it.each(DENYING_CASES)("grants nobody when the value is %s", (_label, raw) => {
    configure(raw);
    expect(isUnlimitedAiUser(OWNER)).toBe(false);
    expect(isUnlimitedAiUser(OTHER)).toBe(false);
    expect(isUnlimitedAiUser(1)).toBe(false);
  });

  it("drops malformed entries but keeps the valid ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    configure(`owner,${OWNER},nope`);
    expect(isUnlimitedAiUser(OWNER)).toBe(true);
    expect(isUnlimitedAiUser(OTHER)).toBe(false);
    // The rejection is visible on the server console, without echoing values.
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain("owner");
    warn.mockRestore();
  });

  it("never matches on a prefix, suffix, or substring of a configured id", () => {
    configure(String(OWNER));
    for (const candidate of [12, 1, 2, 1220, 1222, 221, 0]) {
      expect(isUnlimitedAiUser(candidate)).toBe(false);
    }
  });

  it("rejects values that are not usable User.id numbers at all", () => {
    configure(String(OWNER));
    for (const candidate of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2_147_483_648,
      undefined as unknown as number,
      null as unknown as number,
      String(OWNER) as unknown as number, // a string id is not an id
    ]) {
      expect(isUnlimitedAiUser(candidate)).toBe(false);
    }
  });
});

describe("AI entitlements: parsing is pure and canonical", () => {
  it("returns an empty set for anything unusable", () => {
    expect(parseUnlimitedAiUserIds(undefined).size).toBe(0);
    expect(parseUnlimitedAiUserIds(null).size).toBe(0);
    expect(parseUnlimitedAiUserIds("").size).toBe(0);
    expect(parseUnlimitedAiUserIds("nope,also-nope").size).toBe(0);
  });

  it("stores ids in canonical decimal form", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ids = parseUnlimitedAiUserIds(` ${OWNER} , 900 `);
    expect([...ids].sort()).toEqual(["122", "900"]);
    warn.mockRestore();
  });
});

describe("AI entitlements: configuration surface is server-only", () => {
  const source = () =>
    readFileSync(path.resolve(process.cwd(), "lib/ai/entitlements.ts"), "utf8");

  it("uses a non-public environment variable name", () => {
    expect(UNLIMITED_AI_USER_IDS_ENV).toBe("SYLF_UNLIMITED_AI_USER_IDS");
    expect(UNLIMITED_AI_USER_IDS_ENV.startsWith("NEXT_PUBLIC_")).toBe(false);
  });

  it("declares the server-only boundary so it can never be bundled to the client", () => {
    expect(source()).toMatch(/^import "server-only";$/m);
  });

  it("contains no email, username, or display-name matching rule", () => {
    // There is deliberately no identity string for a caller to compare against.
    expect(source()).not.toMatch(/\.email\b|\.username\b|\.name\b/);
    expect(source()).not.toMatch(/endsWith\(|startsWith\(/);
  });

  it("hardcodes no User.id in repository source", () => {
    // The discovered owner id must live ONLY in the environment.
    expect(source()).not.toMatch(/\b122\b/);
  });

  it("is the only module that reads the environment variable", () => {
    const consumers = readFileSync(
      path.resolve(process.cwd(), "lib/ai/usage-limiter.ts"),
      "utf8"
    );
    // Every other module goes through the entitlement API, never the raw env.
    expect(consumers).not.toContain(UNLIMITED_AI_USER_IDS_ENV);
    expect(consumers).not.toMatch(/process\.env\.[A-Z_]*UNLIMITED/);
  });
});
