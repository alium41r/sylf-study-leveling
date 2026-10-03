/**
 * Deterministic, value-free fingerprinting of dotenv values using an HMAC-SHA256
 * "seal key". The same value always yields the same short fingerprint, but the
 * fingerprint cannot be dictionary-reversed without the key, and the key never
 * leaves the host. The seal key comes from an environment variable when set,
 * otherwise from a local file that is created automatically (0644-independent:
 * created 0600 where the platform supports it).
 */
export interface SealKeyOptions {
    env: string;
    path: string;
}
export declare class Fingerprinter {
    private readonly key;
    private constructor();
    static create(opts: SealKeyOptions): Fingerprinter;
    private digest;
    /** First 16 hex chars of the value's HMAC digest — stable, not reversible. */
    fingerprint(value: string): string;
    /** Constant-time comparison of two values via their digests (never values). */
    equals(stored: string, candidate: string): boolean;
}
