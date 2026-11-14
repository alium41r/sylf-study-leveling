import "server-only";
// Sylf's shared syllabus library. The first time anyone plans a named syllabus, it is researched, mapped, double-checked and saved here; every
// later student who plans the same syllabus reuses it as it is, with no research and no mapping call. Entries hold the syllabus's content only:
// the student's own ratings, ticks and syllabus-node links are stripped before saving and re-applied per student when reused. A correction made
// after a student's report, and confirmed by a fresh check against sources, becomes the entry's next version for everyone.
import { prisma } from "@/lib/prisma";
import { anchorTerms, matchScore, normalizeSyllabus, papersIn, syllabusTerms, type PlanPreset, type StoredSyllabus, type Syllabus } from "../kernel";

export interface LibraryEntry { id: string; key: string; version: number; trust: "CHECKED" | "UNVERIFIED"; preset: PlanPreset; syllabus: Syllabus }

/** The syllabus as everyone shares it: no ratings, no ticks, no links to one student's syllabus nodes, no library pointer. */
export function shareable(syllabus: Syllabus): Syllabus {
  const { library: _library, ...rest } = syllabus;
  void _library;
  return { ...rest, checked: false, units: rest.units.map((u) => ({ ...u, confidence: null, included: true, topic: null })) };
}

const toEntry = (row: { id: string; key: string; version: number; trust: string; preset: string; outline: unknown; sources: unknown; edition: string | null }): LibraryEntry => {
  const raw = row.outline as Syllabus;
  const syllabus = normalizeSyllabus({ source: raw.source ?? "model", ref: raw.ref ?? null, name: raw.name ?? "Syllabus", papers: raw.papers ?? [], units: raw.units ?? [], sources: (row.sources as Syllabus["sources"]) ?? [], researched: raw.researched });
  return {
    id: row.id, key: row.key, version: row.version, trust: row.trust === "CHECKED" ? "CHECKED" : "UNVERIFIED", preset: row.preset as PlanPreset,
    syllabus: { ...syllabus, identity: raw.identity ? { ...raw.identity, edition: row.edition ?? raw.identity.edition ?? null } : null, library: { id: row.id, version: row.version, trust: row.trust === "CHECKED" ? "CHECKED" : "UNVERIFIED", reused: true } },
  };
};

/** The entry stored under any of these keys (its own key or its code-free alternative). */
export async function findOutline(keys: string | string[]): Promise<LibraryEntry | null> {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return null;
  const row = await prisma.syllabusOutline.findFirst({ where: { OR: [{ key: { in: list } }, { altKey: { in: list } }] }, orderBy: { createdAt: "asc" } });
  return row ? toEntry(row) : null;
}

/** An entry's search terms: what it is (board, qualification, subject, code, papers), its name, and its keys, which say the same in short form. */
export function termsFor(syllabus: Syllabus, keys: (string | null | undefined)[]): string[] {
  const id = syllabus.identity;
  return syllabusTerms([id?.board, id?.qualification, id?.subject, id?.code, id?.component, syllabus.name, ...keys.map((k) => k?.replace(/\|/g, " "))].filter(Boolean).join(" "));
}

/** What an entry is, for the model and the match check: from its identity, or from its key when it was saved without one. */
export function storedOf(entry: LibraryEntry): StoredSyllabus {
  const id = entry.syllabus.identity;
  const paper = entry.key.split("|").pop() ?? "";
  return { board: id?.board ?? null, code: id?.code ?? null, qualification: id?.qualification ?? null, subject: id?.subject ?? null, papers: id?.component ? papersIn(id.component) : paper === "all" ? [] : papersIn(paper.replace(/p/g, " p")), name: entry.syllabus.name };
}

// Entries saved before the terms column existed are indexed once, the first time this server searches.
let indexed: Promise<void> | null = null;
function indexOlderEntries(): Promise<void> {
  indexed ??= (async () => {
    const rows = await prisma.syllabusOutline.findMany({ where: { terms: { isEmpty: true } }, take: 500, select: { id: true, key: true, altKey: true, version: true, trust: true, preset: true, outline: true, sources: true, edition: true } });
    for (const row of rows) await prisma.syllabusOutline.update({ where: { id: row.id }, data: { terms: termsFor(toEntry(row).syllabus, [row.key, row.altKey]) } });
  })().catch(() => { indexed = null; });
  return indexed;
}

export interface LibraryHit { entry: LibraryEntry; stored: StoredSyllabus; score: number }

/**
 * The library entries a request might mean, best first. One indexed lookup: the GIN index on `terms` finds the rows that share a code or a subject
 * word with the request, Postgres orders them by how many terms they share, and the top few are scored here. Never a pass over the library.
 */
export async function searchOutlines(request: readonly string[], limit = 6): Promise<LibraryHit[]> {
  const anchors = anchorTerms(request);
  if (!anchors.length) return [];
  await indexOlderEntries();
  const all = [...request];
  const rows = await prisma.$queryRaw<{ id: string; key: string; version: number; trust: string; preset: string; outline: unknown; sources: unknown; edition: string | null; terms: string[] }[]>`
    SELECT "id", "key", "version", "trust", "preset", "outline", "sources", "edition", "terms" FROM "SyllabusOutline"
    WHERE "terms" && ${anchors}::text[]
    ORDER BY cardinality(ARRAY(SELECT unnest("terms") INTERSECT SELECT unnest(${all}::text[]))) DESC, "confirmations" DESC, "createdAt" ASC
    LIMIT 30`;
  return rows.map((row) => { const entry = toEntry(row); return { entry, stored: storedOf(entry), score: matchScore(request, row.terms) }; })
    .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The entry with this id, as the model chose it from a search. */
export async function outlineById(id: string): Promise<LibraryEntry | null> {
  const row = await prisma.syllabusOutline.findUnique({ where: { id } });
  return row ? toEntry(row) : null;
}

/** Saves a newly checked syllabus under its keys. If another student saved the same syllabus a moment earlier, theirs is kept and returned. */
export async function saveOutline(keys: string | string[], syllabus: Syllabus, preset: PlanPreset): Promise<LibraryEntry> {
  const [key, altKey] = Array.isArray(keys) ? keys : [keys];
  const shared = shareable(syllabus);
  const trust = shared.sources?.length ? "CHECKED" : "UNVERIFIED";
  try {
    const row = await prisma.syllabusOutline.create({ data: { key, altKey: altKey && altKey !== key ? altKey : null, name: shared.name.slice(0, 200), preset, outline: shared as object, sources: (shared.sources ?? []) as object, edition: shared.identity?.edition ?? null, trust, checkedAt: trust === "CHECKED" ? new Date() : null, terms: termsFor(shared, [key, altKey]) } });
    return { ...toEntry(row), syllabus: { ...syllabus, library: { id: row.id, version: row.version, trust, reused: false } } };
  } catch (error) {
    if ((error as { code?: string })?.code !== "P2002") throw error;
    const existing = await findOutline([key, altKey].filter((k): k is string => Boolean(k)));
    if (!existing) throw error;
    return existing;
  }
}

/** A correction confirmed by a fresh check against sources: the entry's next version, for everyone who plans it from now on. */
export async function reviseOutline(id: string, syllabus: Syllabus): Promise<{ version: number }> {
  const shared = shareable(syllabus);
  const before = await prisma.syllabusOutline.findUnique({ where: { id }, select: { key: true, altKey: true } });
  const row = await prisma.syllabusOutline.update({ where: { id }, data: { terms: termsFor(shared, [before?.key, before?.altKey]), outline: shared as object, sources: (shared.sources ?? []) as object, edition: shared.identity?.edition ?? null, trust: shared.sources?.length ? "CHECKED" : "UNVERIFIED", version: { increment: 1 }, reports: { increment: 1 }, checkedAt: new Date() } });
  return { version: row.version };
}

export type Verdict = "ACCURATE" | "INACCURATE" | "DISMISSED";

/** One answer per plan round. An "accurate" answer counts once towards the shared entry's confirmations. */
export async function recordFeedback(userId: number, input: { goalKey: string; round: number; outlineId: string | null; verdict: Verdict; note?: string | null }): Promise<void> {
  const note = input.note?.replace(/\s+/g, " ").trim().slice(0, 600) || null;
  const outlineId = input.outlineId && (await prisma.syllabusOutline.count({ where: { id: input.outlineId } })) ? input.outlineId : null;
  const before = await prisma.planFeedback.findUnique({ where: { userId_goalKey_round: { userId, goalKey: input.goalKey, round: input.round } } });
  await prisma.planFeedback.upsert({
    where: { userId_goalKey_round: { userId, goalKey: input.goalKey, round: input.round } },
    create: { userId, goalKey: input.goalKey, round: input.round, outlineId, verdict: input.verdict, note },
    update: { verdict: input.verdict, note, outlineId },
  });
  if (outlineId && input.verdict === "ACCURATE" && before?.verdict !== "ACCURATE") await prisma.syllabusOutline.update({ where: { id: outlineId }, data: { confirmations: { increment: 1 } } });
}

/** The student's latest answer for each goal, so the "Is this plan right?" card is shown once per plan round. */
export async function feedbackFor(userId: number): Promise<Record<string, { round: number; verdict: Verdict }>> {
  const rows = await prisma.planFeedback.findMany({ where: { userId }, orderBy: [{ goalKey: "asc" }, { round: "asc" }], select: { goalKey: true, round: true, verdict: true }, take: 500 });
  const out: Record<string, { round: number; verdict: Verdict }> = {};
  for (const row of rows) out[row.goalKey] = { round: row.round, verdict: row.verdict as Verdict };
  return out;
}
