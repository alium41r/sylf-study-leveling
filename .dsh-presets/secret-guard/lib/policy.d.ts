/**
 * Path classification: rule types, the default rule table, and the matching
 * engine used by the gate and by `sg_status`.
 *
 * Rule patterns are gitignore-style globs:
 * - a pattern containing `/` is anchored to the normalized full path;
 * - a pattern without `/` matches the file's basename at any depth;
 * - `**` crosses path segments, `*` matches within one segment, `?` matches
 *   one character; a mid-pattern double-star followed by a slash matches zero
 *   or more directory levels (gitignore semantics, e.g. `foo/` + `bar` at
 *   any depth between the two segments);
 * - matching is case-insensitive (safer for blocklists on every platform).
 */
export type RuleEffect = 'allow' | 'block-read' | 'block-write' | 'block';
export interface Rule {
    id: string;
    match: string;
    effect: RuleEffect;
    reason?: string;
}
export interface Classification {
    effect: RuleEffect;
    rule?: Rule;
}
export type RuleSource = 'allow' | 'custom' | 'default';
export interface ListedRule {
    source: RuleSource;
    rule: Rule;
}
/**
 * Collapse a raw tool-supplied path into one canonical, matchable form:
 * forward slashes, no `file://` prefix, no drive letter, no leading slashes,
 * no `.` segments, and interior `..` segments folded (`a/../b` -> `b`).
 * The result is what rules and allow entries are matched against; patterns
 * should therefore be written without drive letters and with `/` separators.
 */
export declare function normalizePath(raw: string): string;
/** Compile a gitignore-style glob into an anchored, case-insensitive RegExp. */
export declare function compileGlob(pattern: string): RegExp;
/**
 * The built-in sensitive-surface table. Evaluated in order after the user's
 * allow list and custom rules; the first matching entry decides.
 */
export declare function defaultRules(): Rule[];
/** Immutable rule set with precompiled matchers; swap the whole engine to reload. */
export declare class PolicyEngine {
    private readonly compiled;
    constructor(allow: string[], custom: Rule[], defaults: Rule[]);
    classify(path: string): Classification;
    /** Every rule in evaluation order, with its origin — for `sg_status`. */
    list(): ListedRule[];
}
