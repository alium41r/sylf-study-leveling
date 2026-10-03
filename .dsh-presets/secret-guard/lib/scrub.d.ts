/**
 * Defense-in-depth content scrubber. Even if a tool that was not gated (or a
 * path that slipped past the rules) surfaces secret-shaped text in its result,
 * this listener masks the values before the content reaches the model.
 *
 * Masking is deliberately context-aware to avoid noise: bare long base64 or
 * hex strings (git hashes, uuids) are NOT masked; only high-confidence shapes
 * (private key blocks, JWTs, bearer tokens, known key prefixes, URLs with
 * embedded credentials, and `key=value` assignments whose value is not a
 * placeholder) are redacted.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { Journal } from './journal.js';
import type { ResolvedConfig } from './config.js';
export interface ScrubStats {
    count: number;
    kinds: Record<string, number>;
}
export declare function scrubText(text: string): {
    text: string;
    stats: ScrubStats;
} | null;
export declare function scrubBlocks(blocks: readonly ContentBlock[]): {
    blocks: ContentBlock[];
    stats: ScrubStats;
} | null;
export type PostExecuteHandler = (exec: ToolExecution, result: ToolExecutionResult, next: () => Promise<PostToolDecision>) => Promise<PostToolDecision>;
/** `tools/post-execute` listener: mask accepted content, journal the event. */
export declare function createScrubHandler(deps: {
    journal: Journal;
    config: ResolvedConfig;
}): PostExecuteHandler;
