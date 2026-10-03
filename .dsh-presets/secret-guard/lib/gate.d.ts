/**
 * The pre-execution gate. A `tools/pre-execute` waterfall listener: it
 * classifies the file argument of gated tools against the policy engine and
 * returns `{ kind: 'deny' }` (short-circuiting the waterfall) for blocked
 * operations, so the tool body never runs. Denials carry guidance toward the
 * safe inspection tools and are recorded in the audit journal.
 */
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { PolicyEngine } from './policy.js';
import type { Journal } from './journal.js';
import type { ResolvedConfig } from './config.js';
export type PreExecuteHandler = (exec: ToolExecution, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
/** Which argument key holds the target path for each gated tool. */
export declare const PATH_ARG_KEY: Record<string, 'file_path' | 'path'>;
/** Tools that surface file content (read-like) vs. tools that mutate (write-like). */
export declare const READ_LIKE: Set<string>;
export declare const WRITE_LIKE: Set<string>;
export declare function extractGatedPath(tool: string, args: unknown): string | undefined;
export declare function createGateHandler(deps: {
    getEngine: () => PolicyEngine;
    journal: Journal;
    config: ResolvedConfig;
}): PreExecuteHandler;
