import "server-only";
// Finding a syllabus Sylf already holds. A request is reduced to search terms and looked up in both stores at once: the checked catalog (an
// in-memory inverted index) and the shared library (a GIN-indexed column). The few candidates that come back are shown to the model in the identify
// call, which decides whether one is exactly the syllabus asked for; its choice is then checked against what it identified (`agreesWith`).
import { searchCatalog, type Entry } from "../catalog/syllabi";
import { syllabusTerms, type StoredSyllabus } from "../kernel";
import { searchOutlines, type LibraryEntry } from "./outlines";

export interface Candidate { ref: string; kind: "catalog" | "library"; stored: StoredSyllabus; edition: string | null; units: string[]; score: number; catalog?: Entry; library?: LibraryEntry }

/** The stored syllabi a request might mean, best first, from both stores: at most `limit`, each with a short ref (c1, c2, …) for the model. */
export async function syllabusCandidates(text: string, limit = 6): Promise<Candidate[]> {
  const request = syllabusTerms(text);
  const library = await searchOutlines(request, limit).catch(() => []);
  const found: Omit<Candidate, "ref">[] = [
    ...searchCatalog(request, limit).map((hit) => ({ kind: "catalog" as const, stored: hit.stored, edition: hit.edition, units: hit.entry.units.map((u) => u.title), score: hit.score, catalog: hit.entry })),
    ...library.map((hit) => ({ kind: "library" as const, stored: hit.stored, edition: hit.entry.syllabus.identity?.edition ?? null, units: hit.entry.syllabus.units.map((u) => u.title), score: hit.score, library: hit.entry })),
  ];
  // The catalog is hand-checked, so it wins a tie with a library entry for the same paper.
  return found.sort((a, b) => b.score - a.score || (a.kind === "catalog" ? -1 : 1)).slice(0, limit).map((c, i) => ({ ...c, ref: `c${i + 1}` }));
}

/** The candidates as the identify call reads them: one line each, with what the syllabus is and its first topics. */
export function describeCandidates(candidates: readonly Candidate[]): string {
  if (!candidates.length) return "";
  const line = (c: Candidate) => {
    const s = c.stored;
    const facts = [s.board, s.qualification, s.subject, s.code ? `code ${s.code}` : null, s.papers.length ? `paper${s.papers.length > 1 ? "s" : ""} ${s.papers.join(" and ")}` : "whole course", c.edition ? `edition ${c.edition}` : null].filter(Boolean).join(" · ");
    const units = c.units.slice(0, 8).join(", ");
    return `${c.ref}: ${s.name} (${facts}). Topics: ${units}${c.units.length > 8 ? ", …" : ""}`;
  };
  return ["Syllabi Sylf already holds that a search found for this request (choose only an exact match, or none):", ...candidates.map(line)].join("\n");
}
