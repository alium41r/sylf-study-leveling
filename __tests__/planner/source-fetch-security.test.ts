// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBlockedAddress, isBlockedHostname } from "@/lib/planner/research/search/fetch";

/**
 * The address and hostname gates, tested directly and exhaustively.
 *
 * These two functions are the whole security decision of the fetcher, so they are
 * asserted as a matrix rather than through a fetch call: every non-routable range the
 * goal names, the IPv4-mapped spelling of loopback (which is the obvious bypass), and
 * the hostname forms no DNS answer can redeem.
 */

describe("non-routable addresses are blocked", () => {
  const blocked = [
    "127.0.0.1",
    "127.1.2.3",
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.0.1",
    "192.168.255.255",
    "169.254.169.254", // cloud metadata
    "169.254.0.1", // link-local
    "100.64.0.1",
    "192.0.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
  ];
  it.each(blocked)("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1", "2606:4700::1111"];
  it.each(allowed)("allows the public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("internal hostnames are blocked", () => {
  const blocked = [
    "localhost",
    "LOCALHOST",
    "api.localhost",
    "metadata",
    "intranet",
    "router.local",
    "service.internal",
    "host.home.arpa",
    "",
    "   ",
  ];
  it.each(blocked)("blocks %s", (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it("allows a public hostname, with or without a root dot", () => {
    expect(isBlockedHostname("cambridgeinternational.org")).toBe(false);
    expect(isBlockedHostname("nust.edu.pk")).toBe(false);
    expect(isBlockedHostname("www.example.co.uk")).toBe(false);
  });
});

describe("the fetcher refuses before any network call", () => {
  const scenarios: [string, string][] = [
    ["file:///etc/passwd", "FETCH_BLOCKED_SCHEME"],
    ["javascript:alert(1)", "FETCH_BLOCKED_SCHEME"],
    ["data:text/html,<h1>x</h1>", "FETCH_BLOCKED_SCHEME"],
    ["ftp://example.com/spec.pdf", "FETCH_BLOCKED_SCHEME"],
    ["not a url", "FETCH_BLOCKED_SCHEME"],
    ["http://user:pass@example.com/spec.pdf", "FETCH_BLOCKED_CREDENTIALS"],
    ["http://localhost/spec", "FETCH_BLOCKED_HOST"],
    ["http://metadata/", "FETCH_BLOCKED_HOST"],
    ["http://10.0.0.5/spec", "FETCH_BLOCKED_PRIVATE"],
  ];
  it.each(scenarios)("rejects %s with %s, without fetching", async (url, code) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { fetchSource } = await import("@/lib/planner/research/search/fetch");
    await expect(fetchSource(url)).rejects.toMatchObject({ code });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
