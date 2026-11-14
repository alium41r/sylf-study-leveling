// Finding a syllabus Sylf already holds: one vocabulary of search terms for requests and stored syllabi, an indexed catalog search, and the check
// that a model's choice agrees with what it identified. The model decides; these make sure it only sees likely candidates and never gets the wrong one through.
import { describe, expect, it } from "vitest";
import { agreesWith, anchorTerms, matchScore, outlineKey, papersIn, syllabusTerms, type StoredSyllabus, type SyllabusIdentity } from "@/lib/planner/kernel";
import { catalogEntries, matchSyllabi, searchCatalog } from "@/lib/planner/catalog/syllabi";

const identity = (over: Partial<SyllabusIdentity>): SyllabusIdentity => ({ board: null, qualification: null, subject: null, code: null, component: null, edition: null, ...over });
const maths = (paper: string): StoredSyllabus => ({ board: "Cambridge International", code: "9709", qualification: "AS & A Level", subject: "Mathematics", papers: [paper], name: `Cambridge International AS & A Level Mathematics (9709), Paper ${paper}: Pure Mathematics ${paper}` });

describe("syllabus search terms", () => {
  it("reads every paper a request names, in any wording", () => {
    expect(papersIn("Further Maths paper 1 and paper 2")).toEqual(["1", "2"]);
    expect(papersIn("papers 1, 3 and 5")).toEqual(["1", "3", "5"]);
    expect(papersIn("P1/P3 mocks")).toEqual(["1", "3"]);
    expect(papersIn("paper one")).toEqual(["1"]);
    expect(papersIn("Paper IV")).toEqual(["4"]);
    expect(papersIn("component 2")).toEqual(["2"]);
    expect(papersIn("paper 12")).toEqual([]);
    expect(papersIn("Physics revision")).toEqual([]);
  });

  it("reduces a request and a stored syllabus to the same terms", () => {
    expect(syllabusTerms("A level CAIE Further Maths paper 1 and paper 2 complete for midterm exams preparation").sort()).toEqual(["board:caie", "paper:1", "paper:2", "qual:alevel", "w:further", "w:mathematics"]);
    expect(syllabusTerms("Cambridge International AS & A Level Mathematics (9709), Paper 1")).toEqual(expect.arrayContaining(["board:caie", "qual:alevel", "code:9709", "paper:1", "w:mathematics"]));
    expect(syllabusTerms("AQA GCSE Biology Paper 1 (8461) higher tier")).toEqual(expect.arrayContaining(["board:aqa", "qual:gcse", "code:8461", "paper:1", "tier:higher", "w:biology"]));
    // Years are not codes; planning words are not subjects.
    expect(syllabusTerms("May 2026 exam preparation, final revision")).toEqual([]);
    expect(anchorTerms(syllabusTerms("CAIE A level paper 2"))).toEqual([]);
  });

  it("ranks the same subject above a different one that shares a word", () => {
    const request = syllabusTerms("A level CAIE Further Maths paper 1 and paper 2");
    const further = syllabusTerms("Cambridge International A Level Further Mathematics 9231 Paper 1 and Paper 2");
    const plain = syllabusTerms("Cambridge International AS & A Level Mathematics 9709 Paper 1 Pure Mathematics 1");
    expect(matchScore(request, further)).toBeGreaterThan(matchScore(request, plain));
    // A different code or board counts heavily against.
    expect(matchScore(syllabusTerms("9231 paper 1"), syllabusTerms("9709 paper 1 mathematics"))).toBeLessThan(0);
    expect(matchScore(syllabusTerms("AQA GCSE Biology paper 1"), syllabusTerms("Edexcel GCSE Biology paper 1"))).toBeLessThan(matchScore(syllabusTerms("AQA GCSE Biology paper 1"), syllabusTerms("AQA GCSE Biology paper 1")));
  });

  it("keeps every paper in a library key", () => {
    expect(outlineKey(identity({ board: "CAIE", qualification: "A Level", subject: "Further Mathematics", code: "9231", component: "Paper 1 and Paper 2" }))).toBe("caie|9231|p1+p2");
    expect(outlineKey(identity({ board: "CAIE", code: "9701", subject: "Chemistry", component: "P2" }))).toBe("caie|9701|p2");
    expect(outlineKey(identity({ board: "CAIE", code: "9701", subject: "Chemistry", component: "Paper 2" }))).toBe("caie|9701|p2");
  });
});

describe("the model's choice of a stored syllabus", () => {
  it("is refused when the subject is a variant with its own syllabus", () => {
    expect(agreesWith(identity({ board: "Cambridge International", qualification: "A Level", subject: "Further Mathematics", code: "9231", component: "Paper 1 and Paper 2" }), [maths("1")])).toBe(false);
    // Even when the model leaves out the code.
    expect(agreesWith(identity({ board: "CAIE", qualification: "A Level", subject: "Further Mathematics", component: "Paper 1" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "CAIE", subject: "Additional Mathematics", component: "Paper 1" }), [maths("1")])).toBe(false);
  });

  it("is accepted for the very syllabus and papers asked for", () => {
    expect(agreesWith(identity({ board: "Cambridge International", qualification: "A Level", subject: "Mathematics", code: "9709", component: "Paper 1" }), [maths("1")])).toBe(true);
    expect(agreesWith(identity({ board: "CAIE", subject: "Pure Mathematics", component: "Paper 1" }), [maths("1")])).toBe(true);
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", code: "9709", component: "Papers 1 and 3" }), [maths("1"), maths("3")])).toBe(true);
  });

  it("is refused when the papers, code or board differ, or a single paper stands for a whole course", () => {
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", code: "9709", component: "Paper 1 and Paper 2" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", code: "9709", component: "Paper 3" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", code: "9709", component: "" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", code: "9708", component: "Paper 1" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "Pearson Edexcel", subject: "Mathematics", component: "Paper 1" }), [maths("1")])).toBe(false);
    expect(agreesWith(identity({ board: "CAIE", subject: "Mathematics", component: "Paper 1" }), [])).toBe(false);
  });
});

describe("the checked catalog as a search index", () => {
  it("finds the papers a request might mean, best first, and nothing for requests with no subject or code", () => {
    expect(searchCatalog(syllabusTerms("CAIE A level physics paper 4"))[0].entry.id).toBe("caie-9702-p4");
    expect(searchCatalog(syllabusTerms("Cambridge 9709 P3 mock"))[0].entry.id).toBe("caie-9709-p3");
    expect(searchCatalog(syllabusTerms("my exam next week"))).toEqual([]);
    expect(searchCatalog(syllabusTerms("KCSE Biology paper 1"))).toEqual([]);
  });

  it("may show Mathematics for a Further Mathematics request, but the choice cannot pass the check", () => {
    const hits = searchCatalog(syllabusTerms("A level CAIE Further Maths paper 1 and paper 2"));
    const further = identity({ board: "Cambridge International", qualification: "A Level", subject: "Further Mathematics", code: "9231", component: "Paper 1 and Paper 2" });
    for (const hit of hits) expect(agreesWith(further, [hit.stored])).toBe(false);
    expect(agreesWith(further, hits.map((h) => h.stored))).toBe(false);
  });

  it("returns entries by id in syllabus order", () => {
    expect(catalogEntries(["caie-9709-p3", "caie-9709-p1"]).map((e) => e.id)).toEqual(["caie-9709-p1", "caie-9709-p3"]);
  });

  it("never matches a variant subject without the model either", () => {
    expect(matchSyllabi("A level CAIE Further Maths paper 1 and paper 2 complete for midterm exams preparation")).toEqual([]);
    expect(matchSyllabi("Cambridge A level Further Mathematics paper 1")).toEqual([]);
    expect(matchSyllabi("CAIE AS level Additional Maths paper 1")).toEqual([]);
    expect(matchSyllabi("Maths mid term Complete Paper 1 CAIE A levels").map((e) => e.id)).toEqual(["caie-9709-p1"]);
  });
});
