import { reject, rows, type Sql } from "./database";

export type CompilerVersion = 1 | 2;
export function readCompilerVersion(value: unknown): CompilerVersion {
  if (value !== 1 && value !== 2) reject("INVALID_OUTPUT", "This operation requires a supported, pinned compiler version.", "RECOVERY");
  return value;
}
export async function loadCompilerVersion(sql: Sql, attemptId: string): Promise<CompilerVersion> {
  const row = (await rows<{ compilerVersion: unknown }>(sql, 'SELECT "compilerVersion" FROM "PlannerAttempt" WHERE id=$1', [attemptId]))[0];
  if (!row) reject("REFERENCE_NOT_OWNED", "This operation is unavailable.");
  return readCompilerVersion(row.compilerVersion);
}
