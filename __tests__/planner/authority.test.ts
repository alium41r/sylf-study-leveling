// @vitest-environment node
import { buildSource, documentRelevance, rankSources } from "@/lib/planner/research/sources";
import { describe, expect, it } from "vitest";
import {
  classifyHost,
  inferInstitution,
  isVerifiedAuthorityHost,
  resolveAuthorities,
} from "@/lib/planner/research/authority";

/**
 * Entity-aware authority classification.
 *
 * The behaviour that changed in this patch is a *demotion*: a credible academic or
 * government host is no longer official merely for being credible. These tests state
 * that from both sides — a verified authority is official for its own exam, and an
 * unrelated university is not official for someone else's — because a rule that only
 * promotes would pass a test suite that never checked the second half.
 */

const nust = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };
const caie = { goal: "A-Level Mathematics", subject: "Mathematics", board: "CAIE", level: "A-Level" };

describe("verified authorities are official for their own target", () => {
  it("recognises a university from the goal, including subdomains", () => {
    expect(inferInstitution("NUST NET Engineering")?.name).toBe("NUST");
    expect(inferInstitution("nust net")?.name).toBe("NUST");
    expect(inferInstitution("NUST")?.name).toBe("NUST");
    expect(isVerifiedAuthorityHost("nust.edu.pk", nust)).toBe(true);
    expect(isVerifiedAuthorityHost("ugadmissions.nust.edu.pk", nust)).toBe(true);
    expect(classifyHost("nust.edu.pk", nust)).toBe("OFFICIAL");
    expect(classifyHost("www.nust.edu.pk", nust)).toBe("OFFICIAL");
  });

  it("recognises an exam board from the registry and its hosts", () => {
    expect(classifyHost("cambridgeinternational.org", caie)).toBe("OFFICIAL");
    expect(classifyHost("www.cambridgeinternational.org", caie)).toBe("OFFICIAL");
    expect(classifyHost("cie.org.uk", caie)).toBe("OFFICIAL");
    expect(resolveAuthorities(caie).recognised.map((entry) => entry.name)).toContain(
      "Cambridge International"
    );
  });

  it("treats a board PDF as official-PDF-eligible and a board page as official", () => {
    // The path decides PDF vs page, never official vs not: both are the authority.
    expect(classifyHost("cambridgeinternational.org", caie)).toBe("OFFICIAL");
    expect(classifyHost("qualifications.pearson.com", { ...caie, board: "Edexcel" })).toBe("OFFICIAL");
  });
});

describe("credible is not the same as authoritative", () => {
  it("classifies unrelated academic hosts as institutional, never official", () => {
    for (const host of ["mit.edu", "ox.ac.uk", "harvard.edu", "iitb.ac.in", "uwaterloo.ca"]) {
      expect(classifyHost(host, caie), host).toBe("INSTITUTIONAL");
      expect(classifyHost(host, nust), host).toBe("INSTITUTIONAL");
    }
  });

  it("classifies government hosts as institutional unless they are the authority", () => {
    expect(classifyHost("gov.uk", caie)).toBe("INSTITUTIONAL");
    expect(classifyHost("education.gov.pk", nust)).toBe("INSTITUTIONAL");
    expect(classifyHost("cbse.gov.in", { ...caie, board: "CBSE" })).toBe("OFFICIAL");
  });

  it("keeps a university from becoming official for another body's exam", () => {
    // The Phase 2 report's example: a university page discussing CAIE is not the CAIE
    // specification, even though it is a perfectly credible source.
    expect(classifyHost("someuniversity.edu", caie)).toBe("INSTITUTIONAL");
    expect(classifyHost("someuniversity.edu", { ...caie, goal: "Some University entrance test" })).toBe(
      "INSTITUTIONAL"
    );
  });

  it("keeps preparation and tutoring hosts secondary whatever they are called", () => {
    expect(classifyHost("prepblog.example", caie)).toBe("SECONDARY");
    expect(classifyHost("nustian-academy.example", nust)).toBe("SECONDARY");
    expect(classifyHost("pastpapers.example", nust)).toBe("SECONDARY");
  });

  it("never reads the path or the title — only the host", () => {
    // A path full of authoritative words is not evidence, and the classifier cannot see
    // it: that is the structural version of this rule.
    expect(classifyHost("best-prep-blog.example", caie)).toBe("SECONDARY");
    expect(classifyHost("cambridgeinternational.org", caie)).toBe("OFFICIAL");
  });
});

describe("uncertainty downgrades rather than promotes", () => {
  it("grants no authority for an unknown board", () => {
    const unknown = { goal: "Some exam", board: "Totally Unknown Board", level: null };
    expect(resolveAuthorities(unknown).hosts).toEqual([]);
    expect(classifyHost("anything.example", unknown)).toBe("SECONDARY");
  });

  it("does not treat a name-like prep site as the institution", () => {
    // "NUSTian Academy" is not NUST: identity is a whole-word match on the authority's
    // own name, and authority comes from hosts, not from a resemblance.
    expect(inferInstitution("NUSTian Academy prep")).toBeNull();
    // …while a student phrasing that genuinely names the institution does resolve, and a
    // prep site mentioning it does not become the authority for its own content.
    expect(inferInstitution("Prepare for the NUST NET")?.name).toBe("NUST");
  });

  it("does not infer an institution from an ambiguous alias alone", () => {
    // "net" alone is not NUST — too many exams are called a net.
    expect(inferInstitution("NET preparation")).toBeNull();
  });

  it("is deterministic and returns the same authorities for the same target", () => {
    expect(resolveAuthorities(nust)).toEqual(resolveAuthorities(nust));
    expect(resolveAuthorities(caie)).toEqual(resolveAuthorities(caie));
  });

  it("never returns an empty hostname as an authority", () => {
    expect(isVerifiedAuthorityHost("", caie)).toBe(false);
    expect(isVerifiedAuthorityHost("   ", caie)).toBe(false);
    expect(classifyHost("", caie)).toBe("SECONDARY");
  });
});

/**
 * Ranking within an authority tier (Phase 5, §30).
 *
 * A live comparison exposed this: several pages from the *same* verified authority competed for
 * the four fetch slots, the comparator broke the tie alphabetically by domain, and the run read
 * grade thresholds and notices instead of the specification. The pipeline then correctly
 * declined to classify any unit — honest, and useless. Relevance now orders documents inside a
 * tier, and these tests pin both halves of that: the useful document is preferred, and no
 * authority is invented or demoted by it.
 */
describe("ranking prefers the document that carries the content", () => {
  const source = (url: string, title: string | null, type: "OFFICIAL" | "OFFICIAL_PDF" | "SECONDARY") =>
    ({ ...buildSource({ url, title, context: { goal: "CAIE A-Level", board: "CAIE" }, retrievedAt: "2030-01-01T00:00:00.000Z" })!, sourceType: type });

  it("puts a specification ahead of an administrative page from the same authority", () => {
    const graded = source("https://cambridgeinternational.org/programmes/grade-thresholds", "Grade thresholds June 2026", "OFFICIAL");
    const notice = source("https://cambridgeinternational.org/news/investigation-outcome-notice", "Investigation outcome notice", "OFFICIAL");
    const spec = source("https://cambridgeinternational.org/programmes/specification-9709.pdf", "9709 Mathematics specification 2026", "OFFICIAL_PDF");
    const ranked = rankSources([graded, notice, spec]);
    // The PDF leads on type; among the two pages, the content one leads on relevance.
    expect(ranked[0].url).toContain("specification-9709");
    expect(documentRelevance(spec)).toBeGreaterThan(documentRelevance(graded));
    // Both administrative pages are penalised; the year only decides between them.
    expect(documentRelevance(graded)).toBeLessThan(0);
    expect(documentRelevance(notice)).toBeLessThan(0);
  });

  it("never lets relevance promote a source across an authority tier", () => {
    const blog = source("https://prepblog.example/syllabus-subject-content", "Official syllabus subject content", "SECONDARY");
    const notice = source("https://cambridgeinternational.org/news/notice", "Notice", "OFFICIAL");
    // The blog is shaped exactly like the document we want and is still second.
    expect(documentRelevance(blog)).toBeGreaterThan(documentRelevance(notice));
    expect(rankSources([blog, notice])[0].url).toContain("cambridgeinternational.org");
  });

  it("prefers the newer of two identical specification documents", () => {
    const older = source("https://cambridgeinternational.org/specification-2022.pdf", "Specification 2022", "OFFICIAL_PDF");
    const newer = source("https://cambridgeinternational.org/specification-2026.pdf", "Specification 2026", "OFFICIAL_PDF");
    expect(rankSources([older, newer])[0].url).toContain("2026");
  });

  it("is deterministic and leaves unrecognised documents neutral", () => {
    const a = source("https://nust.edu.pk/admissions", "Admissions", "OFFICIAL");
    const b = source("https://nust.edu.pk/net", "NET", "OFFICIAL");
    expect(documentRelevance(a)).toBe(0);
    expect(documentRelevance(b)).toBe(0);
    // Neutral documents still order deterministically, so the same run always ranks the same.
    expect(rankSources([a, b]).map((entry) => entry.url)).toEqual(rankSources([b, a]).map((entry) => entry.url));
  });
});
