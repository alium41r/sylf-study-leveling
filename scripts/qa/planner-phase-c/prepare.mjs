/** Pure preparation only. There is deliberately no paid execution mode. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const reportPath = "documentation/planner/reports/2026-10-28-phase-c-qualification-preparation";
export const funding = Object.freeze({ maxCalls: 48, inputUnits: 3000000, completionTokens: 700000,
  roleInputUnits: 500000, roleCompletionTokens: 65536, processingMs: 4 * 3600000,
  peakInputUsdPerMillion: 0.30, peakOutputUsdPerMillion: 1.20, proposedAuthorizationUsd: 1.75 });
export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function modelPacket(c) {
  return { title: c.title, student: c.student, acceptedInstructions: c.acceptedInstructions,
    goals: c.goals, availability: c.availability, calendar: c.calendar, existingTasks: c.existingTasks,
    materials: c.materials.map(m => ({ id: m.id, title: m.title, text: m.text })), webPermission: c.webPermission };
}
export function maximumModelUsd(profile = funding) {
  return (profile.inputUnits * profile.peakInputUsdPerMillion + profile.completionTokens * profile.peakOutputUsdPerMillion) / 1e6;
}
export function validateBank(bank, evaluator) {
  if (bank.schemaVersion !== 1 || !bank.allStudentsAndSchoolMaterialsSynthetic || !Array.isArray(bank.cases) || bank.cases.length < 10) throw new Error("CASE_BANK_SHAPE");
  const ids = new Set();
  for (const c of bank.cases) {
    if (ids.has(c.id) || !/^C\d{2}$/.test(c.id)) throw new Error("CASE_ID"); ids.add(c.id);
    if (!c.student || !c.acceptedInstructions || c.goals.length < 1 || c.goals.length > 2 || !c.materials.length) throw new Error("CASE_PACKET");
    if (c.availability.dailyCeilingMinutes.length !== 7 || !c.availability.studyWindows.length) throw new Error("ACCEPTED_AVAILABILITY");
    for (const w of c.availability.studyWindows) if (w.weekday < 0 || w.weekday > 6 || w.startMinute < 0 || w.endMinute > 1440 || w.endMinute <= w.startMinute) throw new Error("STUDY_WINDOW");
    if (new Set(c.materials.map(m => m.id)).size !== c.materials.length || c.materials.some(m => !m.text || !m.title)) throw new Error("RESOURCE_PACKET");
    // Evaluator keys/hidden transfer items are never merged into student/model packets.
    for (const q of evaluator.pilot.hiddenTransferItems) if (JSON.stringify(c).includes(q.question)) throw new Error("EVALUATOR_LEAK");
  }
  const pilot = bank.cases.find(c => c.id === bank.pilotCaseId);
  if (!pilot || pilot.webPermission || pilot.partition !== "DEVELOPMENT_PILOT" || pilot.goals.length !== 2) throw new Error("PILOT_SCOPE");
  if (maximumModelUsd() > funding.proposedAuthorizationUsd) throw new Error("FUNDING_BOUND");
  // Existing downstream input/output escrows must fit before Research/strategy.
  if (funding.roleInputUnits * 6 > funding.inputUnits || funding.roleCompletionTokens * 6 > funding.completionTokens) throw new Error("DOWNSTREAM_CAPACITY");
  return pilot;
}
export function prepare(root, { privateBalanceReceipt = null } = {}) {
  const folder = resolve(root, reportPath), bank = JSON.parse(readFileSync(resolve(folder, "CASE_BANK.json"), "utf8"));
  const evaluator = JSON.parse(readFileSync(resolve(folder, "EVALUATOR_ONLY.json"), "utf8"));
  const pilot = validateBank(bank, evaluator);
  const names = ["CASE_BANK.json", "PILOT_INPUT.json", "EVALUATOR_ONLY.json", "RUBRIC.json", "PROTOCOL.md", "APPROVAL_REQUEST.md"];
  const hashes = Object.fromEntries(names.map(n => [n, sha(readFileSync(resolve(folder, n)))]));
  const sourcePins = JSON.parse(readFileSync(resolve(root, "documentation/planner/reports/2026-10-27-ai-first-phase-b-steps6-8/evidence/qualification-final-7/postgres-source-pins.json"), "utf8"));
  const changed = Object.entries(sourcePins.sources).filter(([name, digest]) => sha(readFileSync(resolve(root, name))) !== digest).map(([name]) => name);
  if (changed.some(name => name !== "scripts/test/test-planner-ai-first-foundation.mjs")) throw new Error("PHASE_B_SOURCE_DRIFT");
  const balance = privateBalanceReceipt ? JSON.parse(readFileSync(privateBalanceReceipt, "utf8")) : null;
  const usd = balance?.balance?.balances?.find(b => b.currency === "USD");
  const metadataFresh = balance?.status === "METADATA_REACHABLE" && Date.now() >= Date.parse(balance.checkedAt) && Date.now() - Date.parse(balance.checkedAt) <= 15 * 60000;
  const balanceCoversProposedCeiling = metadataFresh && balance.balance?.isAvailable === true && usd && /^\d+(\.\d+)?$/.test(usd.total_balance) ? Number(usd.total_balance) >= funding.proposedAuthorizationUsd : null;
  const rubric = JSON.parse(readFileSync(resolve(folder, "RUBRIC.json"), "utf8"));
  if (rubric.dimensions.reduce((sum, d) => sum + d.weight, 0) !== 100 || rubric.dimensions.some(d => !d.anchors?.[1] || !d.anchors?.[5])) throw new Error("RUBRIC_INCOMPLETE");
  return { schemaVersion: 1, status: "PREPARED_NOT_AUTHORIZED", paidCalls: 0, paidExecutionEnabled: false,
    pilotCaseId: pilot.id, frozenAnchor: JSON.parse(readFileSync(resolve(folder,"PILOT_INPUT.json"),"utf8")).anchor, repetitions: 1, approved: false, hashes,
    financialEnvelope: { ...funding, maximumModelUsd: maximumModelUsd(), externalPaidToolsAllowed: false,
      balanceCoversProposedCeiling, metadataFresh, balanceCheckedAt: balance?.checkedAt ?? null,
      basis: "Published peak, cache-miss rates; reasoning included in completion once. This is a conservative admission bound, not a provider invoice guarantee." },
    roles: { model: "deepseek-flash", effort: "HIGH", strategistFormat: "TEXT", otherFormats: "JSON" },
    preservedPhaseBSourcePins: Object.keys(sourcePins.sources).length - changed.length,
    qualificationOnlyHarnessChanges: changed,
    qualificationSources: Object.fromEntries(["scripts/qa/planner-phase-c/prepare.mjs", "scripts/qa/planner-phase-c/preflight.mjs", "scripts/test/test-planner-ai-first-foundation.mjs", "scripts/test/test-planner-v2-phase1-postgres.mjs", "__tests__/planner-v2/postgres/phase-c-preparation.phasec.ts"].map(name => [name, sha(readFileSync(resolve(root, name)))])),
    modelInputPacketDigest: sha(JSON.stringify(modelPacket(pilot))),
    preparedAt: new Date().toISOString(),
    blockedActions: ["Paid generation", "DeepSeek Search/Fetch", "Paid independent judge", "Production admission/routing/deployment", "Hosted Apply", "UI"] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(x => !["--private-balance"].includes(x) && !x.startsWith("/private/tmp/")) || args.length && (args.length !== 2 || args[0] !== "--private-balance")) throw new Error("PREPARATION_ONLY_NO_LIVE_FLAGS");
  const output = prepare(process.cwd(), { privateBalanceReceipt: args[1] ?? null });
  const target = resolve(process.cwd(), reportPath, "evidence/prepared-manifest.json");
  if (existsSync(target)) throw new Error("Prepared manifests are immutable; retain the previous artifact before preparing a new version.");
  writeFileSync(target, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: output.status, case: output.pilotCaseId, paidCalls: 0, proposedCeilingUsd: funding.proposedAuthorizationUsd, maximumModelUsd: maximumModelUsd(), balanceCoversProposedCeiling: output.financialEnvelope.balanceCoversProposedCeiling }));
}
