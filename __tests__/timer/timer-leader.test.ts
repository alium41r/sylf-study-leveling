import { describe, it, expect } from "vitest";
import {
  readLease,
  serializeLease,
  leaseIsHeldBy,
  leaseExpired,
  leaseHeldByOther,
  LEASE_TTL_MS,
} from "@/lib/timer-leader";

const T0 = 1_000_000_000_000;

describe("timer-leader: lease helpers", () => {
  it("round-trips leases through localStorage strings", () => {
    const raw = serializeLease("tabA", T0);
    expect(readLease(raw)).toEqual({ id: "tabA", ts: T0 });
  });

  it("treats corrupt/absent values as no lease", () => {
    expect(readLease(null)).toBeNull();
    expect(readLease("garbage")).toBeNull();
    expect(readLease(JSON.stringify({ id: 42 }))).toBeNull();
  });

  it("detects a fresh self-held lease", () => {
    const lease = { id: "tabA", ts: T0 - 500 };
    expect(leaseIsHeldBy(lease, T0, "tabA")).toBe(true);
    expect(leaseIsHeldBy(lease, T0, "tabB")).toBe(false);
  });

  it("expires stale leases", () => {
    const stale = { id: "tabA", ts: T0 - LEASE_TTL_MS - 1 };
    expect(leaseExpired(stale, T0)).toBe(true);
    expect(leaseExpired(null, T0)).toBe(true);
    expect(leaseExpired({ id: "tabA", ts: T0 - 100 }, T0)).toBe(false);
  });

  it("identifies leases held by another tab", () => {
    const freshOther = { id: "tabB", ts: T0 - 100 };
    expect(leaseHeldByOther(freshOther, T0, "tabA")).toBe(true);
    expect(leaseHeldByOther({ id: "tabA", ts: T0 - 100 }, T0, "tabA")).toBe(false);
    // Expired "other" lease is not held by anyone.
    expect(leaseHeldByOther({ id: "tabB", ts: T0 - LEASE_TTL_MS - 1 }, T0, "tabA")).toBe(false);
  });
});
