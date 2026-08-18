/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { getPasswordStrength } from "@/app/components/PasswordStrengthMeter";

describe("Phase 2: Password Strength Logic", () => {
  it("returns score 0 for empty password", () => {
    const result = getPasswordStrength("");
    expect(result.score).toBe(0);
    expect(result.label).toBe("");
  });

  it("classifies short, simple passwords as Weak Protocol", () => {
    const result = getPasswordStrength("12345");
    expect(result.score).toBe(1);
    expect(result.label).toBe("Weak Protocol");
  });

  it("classifies passwords with mixed criteria as Fair/Good Encryption", () => {
    const fair = getPasswordStrength("hunter123");
    expect(fair.score).toBeGreaterThanOrEqual(2);

    const good = getPasswordStrength("Hunter1234");
    expect(good.score).toBeGreaterThanOrEqual(3);
  });

  it("classifies complex passwords as Monarch Security", () => {
    const monarch = getPasswordStrength("ShadowMonarch!99#");
    expect(monarch.score).toBe(4);
    expect(monarch.label).toBe("Monarch Security");
  });

  it("classifies long diverse random character strings as Monarch Security", () => {
    const longPass = getPasswordStrength("k9!mX7#qL2$wP5@vB8");
    expect(longPass.score).toBe(4);
    expect(longPass.label).toBe("Monarch Security");
  });
});
