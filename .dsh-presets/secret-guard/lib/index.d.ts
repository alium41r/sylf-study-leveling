/**
 * secret-guard — a DeepSeek Harness (dsh) security plugin.
 *
 * What it does, in one paragraph:
 * - blocks agent file tools (`read`/`write`/`edit`, search tools) from
 *   touching sensitive files (.env, credentials, key material) before the
 *   tool body can run (`tools/pre-execute` waterfall);
 * - masks secret-shaped values that still reach tool results, as a
 *   defense-in-depth net (`tools/post-execute` waterfall);
 * - provides `sg_*` tools that inspect those same files safely (keys, shapes,
 *   fingerprints, boolean probes — never raw values);
 * - keeps a JSONL audit journal of blocks/masks/reloads, and can hot-reload
 *   its rules from an external JSON file (watched or via `sg_reload`).
 *
 * The plugin is self-contained and loads from source: dsh boots with a
 * TypeScript-aware loader, so no build step is needed.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type PluginConfig } from './config.js';
export { Config };
export type { PluginConfig };
/** Cordis plugin metadata. */
export declare const name = "secret-guard";
/** Services required by this plugin. */
export declare const inject: string[];
/**
 * Mount the plugin. Registrations are context-scoped effects and are also
 * explicitly disposed by the returned cleanup (belt and suspenders for HMR).
 */
export declare function apply(ctx: Context, config: PluginConfig): () => void;
