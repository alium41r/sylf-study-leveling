/**
 * Hot-reload watcher for the external rules file.
 *
 * Implementation note: this deliberately polls the file's mtime/size instead
 * of using `fs.watch`. On Windows, deleting a directory that `fs.watch` is
 * watching leaks the loop's exit eligibility (a known platform quirk), and the
 * rules file is routinely replaced by editors and `sg_reload` in ways that
 * make per-file watchers fragile. Polling is uniform across platforms,
 * deterministic, and cheap: one stat call every `pollMs` milliseconds.
 * The interval is unref'd, so it can never keep the harness process alive.
 */
export interface WatchHandle {
    close(): void;
}
export declare function watchFile(file: string, onChange: () => void | Promise<void>, debounceMs?: number, pollMs?: number): WatchHandle;
