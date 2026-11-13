import "server-only";
// Sylf's shared syllabus library. The first time anyone plans a named syllabus, it is researched, mapped, double-checked and saved here; every
// later student who plans the same syllabus reuses it as it is, with no research and no mapping call. Entries hold the syllabus's content only:
// the student's own ratings, ticks and syllabus-node links are stripped before saving and re-applied per student when reused. A correction made
// after a student's report, and confirmed by a fresh check against sources, becomes the entry's next version for everyone.
import { prisma } from "@/lib/prisma";
import { normalizeSyllabus, type PlanPreset, type Syllabus } from "../kernel";

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

/** Saves a newly checked syllabus under its keys. If another student saved the same syllabus a moment earlier, theirs is kept and returned. */
export async function saveOutline(keys: string | string[], syllabus: Syllabus, preset: PlanPreset): Promise<LibraryEntry> {
  const [key, altKey] = Array.isArray(keys) ? keys : [keys];
  const shared = shareable(syllabus);
  const trust = shared.sources?.length ? "CHECKED" : "UNVERIFIED";
  try {
    const row = await prisma.syllabusOutline.create({ data: { key, altKey: altKey && altKey !== key ? altKey : null, name: shared.name.slice(0, 200), preset, outline: shared as object, sources: (shared.sources ?? []) as object, edition: shared.identity?.edition ?? null, trust, checkedAt: trust === "CHECKED" ? new Date() : null } });
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
  const row = await prisma.syllabusOutline.update({ where: { id }, data: { outline: shared as object, sources: (shared.sources ?? []) as object, edition: shared.identity?.edition ?? null, trust: shared.sources?.length ? "CHECKED" : "UNVERIFIED", version: { increment: 1 }, reports: { increment: 1 }, checkedAt: new Date() } });
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
