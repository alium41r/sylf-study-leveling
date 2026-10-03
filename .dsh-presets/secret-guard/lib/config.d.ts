/**
 * Plugin configuration: the schemastery schema validated by the loader, plus
 * `resolveConfig`, which applies defaults, resolves relative paths against the
 * harness working directory, assigns rule ids and validates invariants
 * fail-loud. Rule compilation is shared with the hot-reload path.
 */
import type { Rule, RuleEffect } from './policy.js';
export declare const DEFAULT_SEAL_ENV = "SECRET_GUARD_SEAL_KEY";
export declare const DEFAULT_SEAL_PATH = ".secret-guard/seal.key";
export declare const DEFAULT_AUDIT_DIR = ".secret-guard/logs";
export declare const DEFAULT_GATE_TOOLS: string[];
export declare const DEFAULT_AUDIT_MAX_BYTES: number;
export declare const DEFAULT_AUDIT_KEEP = 5;
export declare const EFFECTS: readonly ["allow", "block-read", "block-write", "block"];
export interface RuleInput {
    id?: string;
    match: string;
    effect?: RuleEffect;
    reason?: string;
}
export interface PluginConfig {
    /** Custom rules, evaluated before the built-in table. */
    rules?: RuleInput[];
    /** Path patterns that are always allowed (checked before any rule). */
    allow?: string[];
    /** Tool names whose file arguments are gated. */
    gateTools?: string[];
    /** Also block `grep` patterns that look secret-oriented. */
    guardSearchPatterns?: boolean;
    /** Mask secret-shaped values in tool results (defense in depth). */
    maskResults?: boolean;
    /** HMAC seal key: env var name + file path. */
    sealKey?: {
        env?: string;
        path?: string;
    };
    /** JSONL audit journal settings. */
    audit?: {
        enabled?: boolean;
        dir?: string;
        maxBytes?: number;
        keep?: number;
    };
    /** External JSON rules file, hot-reloadable at runtime. */
    rulesFile?: string;
    /** Watch `rulesFile` for changes and reload automatically. */
    watchRules?: boolean;
}
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
    rules: import("@deepseek-ai/schemastery").default<({
        id?: string | null | undefined;
        match?: string | null | undefined;
        effect?: "allow" | "block-read" | "block-write" | "block" | null | undefined;
        reason?: string | null | undefined;
    } & import("cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        id: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        match: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        effect: import("@deepseek-ai/schemastery").default<"allow" | "block-read" | "block-write" | "block", "allow" | "block-read" | "block-write" | "block", Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        reason: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    allow: import("@deepseek-ai/schemastery").default<string[], string[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    gateTools: import("@deepseek-ai/schemastery").default<string[], string[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    guardSearchPatterns: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    maskResults: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    sealKey: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        env: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        path: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        env: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        path: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, "plain">;
    audit: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        dir: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        maxBytes: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        keep: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        dir: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        maxBytes: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        keep: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, "plain">;
    rulesFile: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    watchRules: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    rules: import("@deepseek-ai/schemastery").default<({
        id?: string | null | undefined;
        match?: string | null | undefined;
        effect?: "allow" | "block-read" | "block-write" | "block" | null | undefined;
        reason?: string | null | undefined;
    } & import("cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
        id: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        match: import("@deepseek-ai/schemastery").default<string, string, "plain">;
        effect: import("@deepseek-ai/schemastery").default<"allow" | "block-read" | "block-write" | "block", "allow" | "block-read" | "block-write" | "block", Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        reason: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    allow: import("@deepseek-ai/schemastery").default<string[], string[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    gateTools: import("@deepseek-ai/schemastery").default<string[], string[], Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    guardSearchPatterns: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    maskResults: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    sealKey: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        env: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        path: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        env: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        path: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, "plain">;
    audit: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        dir: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        maxBytes: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        keep: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        dir: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        maxBytes: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
        keep: import("@deepseek-ai/schemastery").default<number, number, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    }>>, "plain">;
    rulesFile: import("@deepseek-ai/schemastery").default<string, string, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
    watchRules: import("@deepseek-ai/schemastery").default<boolean, boolean, Mode extends "volatile" | "volatile-defined" ? "volatile-defined" : "defined">;
}>>, "plain">;
export interface ResolvedConfig {
    rules: Rule[];
    allow: string[];
    gateTools: string[];
    guardSearchPatterns: boolean;
    maskResults: boolean;
    sealKey: {
        env: string;
        path: string;
    };
    audit: {
        enabled: boolean;
        dir: string;
        maxBytes: number;
        keep: number;
    };
    rulesFile: string;
    watchRules: boolean;
    /** Base directory for every relative path in the config. */
    cwd: string;
}
/** Validate raw rule entries and return them with guaranteed ids. */
export declare function compileRules(raw: unknown): Rule[];
/** Validate raw allow-list entries and drop blanks. */
export declare function compileAllowList(raw: unknown): string[];
export declare function resolveConfig(raw: unknown, cwd?: string): ResolvedConfig;
