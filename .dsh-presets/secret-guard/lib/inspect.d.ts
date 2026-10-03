/**
 * Safe inspection surface: dotenv parsing, value-shape classification, and the
 * `sg_*` tool family. These tools deliberately read sensitive files that the
 * gate blocks — that is their purpose — but they never return raw values:
 * they return key names, line numbers, booleans, shape labels, lengths, and
 * HMAC fingerprints only.
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { PolicyEngine } from './policy.js';
import type { Fingerprinter } from './fingerprint.js';
import type { ResolvedConfig } from './config.js';
export interface DotenvEntry {
    name: string;
    value: string;
    line: number;
}
/**
 * Minimal dotenv parser: blank lines and `#` comments skipped, optional
 * `export` prefix, single/double-quoted values (double quotes honor the common
 * `\n` `\r` `\t` `\"` `\\` escapes), inline comments after unquoted values AND
 * after closed quoted values (`A="x" # note` keeps `x`; `A="x # y"` keeps the
 * comment inside the quotes). Multi-line quoted values are not supported.
 */
export declare function parseDotenv(text: string): DotenvEntry[];
export type ValueShape = 'empty' | 'bool' | 'numeric' | 'jwt' | 'url' | 'hex' | 'base64' | 'opaque';
/** Shape classification only — never reveals the value itself. */
export declare function classifyShape(value: string): ValueShape;
export declare function readDotenvFile(path: string): DotenvEntry[];
export interface ReloadResult {
    ok: boolean;
    source: string;
    rules: number;
    allow: number;
    message?: string;
}
export interface InspectDeps {
    config: ResolvedConfig;
    getEngine: () => PolicyEngine;
    getFingerprinter: () => Fingerprinter;
    reloadRules: () => ReloadResult;
}
/** Resolve a tool-supplied file argument against the harness working dir. */
export declare function resolveFileArg(file: string | undefined, cwd: string): string;
/** Last entry wins for duplicate keys (dotenv semantics). */
export declare function findEntry(entries: DotenvEntry[], key: string): DotenvEntry | undefined;
export declare function registerSafeTools(ctx: {
    tools: {
        register(definition: ToolDefinition): () => void;
    };
}, deps: InspectDeps): () => void;
