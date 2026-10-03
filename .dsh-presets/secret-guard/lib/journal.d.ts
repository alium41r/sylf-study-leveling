/**
 * Append-only JSONL audit journal with size-based rotation. Entries carry
 * metadata only (tool names, paths, rule ids, shape counts) — by construction
 * the journal never receives raw secret values; callers are responsible for
 * honoring that contract.
 */
export type JournalKind = 'init' | 'block' | 'mask' | 'reload' | 'error';
export interface JournalEntry {
    ts: string;
    kind: JournalKind;
    tool?: string;
    path?: string;
    rule?: string;
    effect?: string;
    masked?: Record<string, number>;
    rules?: number;
    allow?: number;
    message?: string;
}
export interface JournalOptions {
    enabled?: boolean;
    maxBytes?: number;
    keep?: number;
    /** Called when a journal write fails; the write itself never throws. */
    onError?: (error: Error) => void;
}
export declare class Journal {
    private readonly file;
    private readonly dir;
    private readonly opts;
    constructor(dir: string, opts?: JournalOptions);
    write(entry: JournalEntry): void;
    /**
     * Parse the current journal file, best-effort. A single damaged line (e.g.
     * a torn write during rotation) must not hide the rest of the journal —
     * unparseable lines are skipped, and the surviving entries are returned.
     */
    readAll(): JournalEntry[];
    private size;
    private rotate;
}
