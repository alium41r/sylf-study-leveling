// The part of the door that only a signed-in client needs. Separate from ./index so that an app with no backend evaluates none of it at start.
// tooling/checks/check-boundaries.mjs audits this file as part of the allow-list, with the same rules.
export { TimerSync } from "../../../../lib/timer-sync";
export type { JournalStorage, TimerJournal, TimerSyncAccepted, TimerSyncStatus } from "../../../../lib/timer-sync";
export { SessionProtocolV2, SessionProtocolConflict, reconcileSessionSnapshot } from "../../../../lib/planner/v2/session-client";
export type { SessionExecutionV2, SessionActionV2 } from "../../../../lib/planner/v2/session-client";
export { StudySessionExecutionV2Schema } from "../../../../lib/planner/v2/contracts/session";
export { COSMETICS_CATALOG, getClassInfo } from "../../../../lib/cosmetics-catalog";
export * as nativeAuth from "../../../../lib/native-auth-contract";
export type { NativeSession, NativeUser } from "../../../../lib/native-auth-contract";

import { consumeResponseWithTimeout, fetchWithTimeout } from "../../../../lib/api-transport";
export const backend = { consumeResponseWithTimeout, fetchWithTimeout };
