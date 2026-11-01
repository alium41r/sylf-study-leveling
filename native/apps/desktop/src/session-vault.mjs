// @ts-check
// Where Electron keeps a refresh token (ADR 0009 decision 10). It is encrypted with the operating system's key store through safeStorage, and
// lives in one file that only this user can read. If encryption is not available the session stays in memory and ends with the process. It is
// never written in plain text. On Linux, `basic_text` is a key compiled into Chromium, which is plain text with extra steps, so it counts as unavailable.
import fs from "node:fs";
import path from "node:path";

/** @param {Pick<Electron.SafeStorage, "isAsyncEncryptionAvailable" | "encryptStringAsync" | "decryptStringAsync"> & { getSelectedStorageBackend?: () => string }} safeStorage @param {string} file */
export function createSessionVault(safeStorage, file) {
  /** @type {string | null} */ let memory = null;
  const durable = async () => {
    try { return (await safeStorage.isAsyncEncryptionAvailable()) && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend?.() !== "basic_text"); }
    catch { return false; }
  };
  const remove = () => { try { fs.rmSync(file, { force: true }); } catch { /* Nothing to do: it is encrypted, and its token can be refused. */ } };
  /** @param {string} value */
  const seal = async (value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const next = `${file}.next`;
    fs.writeFileSync(next, await safeStorage.encryptStringAsync(value), { mode: 0o600 });
    fs.renameSync(next, file);
  };

  return {
    durable,
    async read() {
      if (memory !== null) return memory;
      if (!fs.existsSync(file) || !(await durable())) return null;
      try {
        const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(fs.readFileSync(file));
        if (shouldReEncrypt) await seal(result).catch(() => undefined);
        return result;
      } catch {
        return null; // A key that changed, or a copied profile, reads as signed out.
      }
    },
    /** @param {string} value */
    async write(value) {
      if (!(await durable())) { memory = value; remove(); return; }
      memory = null;
      await seal(value);
    },
    async clear() { memory = null; remove(); },
  };
}
