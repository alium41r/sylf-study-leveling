import {
  commitSchema,
  documentSchema,
  OBJECT_BYTES,
  type CloudBinding,
  type PreparedObject,
} from "./contracts";
import { decodeJson, digest, joinContent } from "./bytes";
import { NotesError } from "./errors";
import type { NotesRepository } from "./repository";

/** Immutable logical hashes may have multiple physical provider files. Implementations must bound candidate/page sizes. */
export interface NotesTransport {
  readonly scope: {
    ownerId: string;
    libraryId: string;
    bindingGeneration: number;
  } & Pick<CloudBinding, "provider" | "accountId" | "rootId">;
  candidates(hash: string, signal: AbortSignal): Promise<Uint8Array[]>;
  create(hash: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  createMany?(
    objects: PreparedObject[],
    revisions: string[],
    signal: AbortSignal
  ): Promise<void>;
  enumerate(
    cursor: string | undefined,
    signal: AbortSignal
  ): Promise<{ revisionIds: string[]; cursor: string; more: boolean }>;
  /** Optional in-memory delivery optimization, called only after atomic local activation. */
  acknowledgePage?(cursor: string, signal: AbortSignal): void;
}
export class TransportError extends Error {
  constructor(
    readonly code: "AUTH" | "QUOTA" | "THROTTLE" | "CURSOR_EXPIRED" | "NETWORK",
    readonly retryAfterMs = 0
  ) {
    super(code);
  }
}

export class NotesSynchronizer {
  downloadIncomplete = true;
  constructor(
    private readonly repository: NotesRepository,
    private readonly transport: NotesTransport
  ) {}
  private async guard(): Promise<void> {
    this.repository.session.assert();
    const { binding } = await this.repository.library();
    const scope = this.transport.scope;
    if (
      scope.ownerId !== this.repository.session.ownerId ||
      scope.libraryId !== this.repository.libraryId ||
      scope.bindingGeneration !== binding.generation ||
      scope.provider !== binding.provider ||
      scope.accountId !== binding.accountId ||
      scope.rootId !== binding.rootId
    )
      throw new NotesError(
        "OWNERSHIP",
        "Transport does not match this library/account/root generation."
      );
  }
  private async candidate(hash: string): Promise<Uint8Array | undefined> {
    await this.guard();
    const items = await this.transport.candidates(
      hash,
      this.repository.session.signal
    );
    this.repository.session.assert();
    if (items.length > 32)
      throw new NotesError("LIMIT", "Too many provider object candidates.");
    for (const bytes of items) {
      if (bytes.length <= OBJECT_BYTES && (await digest(bytes)) === hash) {
        this.repository.session.assert();
        return bytes.slice();
      }
    }
    return undefined;
  }
  /** Revalidate acknowledged copies after a provider listing changes or the process restarts.
   * An old receipt alone cannot prove that the user has not removed cloud files since then.
   */
  async verifyAcknowledged(): Promise<void> {
    await this.guard();
    const pending = (await this.repository.jobs())
        .filter((j) => j.state === "verified")
        .map((j) => j.id),
      revisions = new Set<string>(),
      descriptors = new Set<string>(),
      objects = new Set<string>();
    const verify = async (ref: { hash: string; size?: number }) => {
      if (objects.has(ref.hash)) return;
      const local = await this.repository.readObject(ref.hash);
      if (ref.size !== undefined && local.length !== ref.size)
        throw new NotesError(
          "CORRUPT",
          "Local dependency size needs recovery."
        );
      const remote = await this.candidate(ref.hash);
      if (!remote || remote.length !== local.length)
        throw new NotesError(
          "CORRUPT",
          "A previously verified Drive copy is missing. Local originals were kept. Restore the original files from Drive Trash or export a portable backup before continuing."
        );
      objects.add(ref.hash);
    };
    // Visit each immutable commit/dependency once; do not expand the complete
    // ancestor closure again for every historical receipt.
    while (pending.length) {
      const id = pending.pop()!;
      if (revisions.has(id)) continue;
      await this.guard();
      const commit = commitSchema.parse(
        decodeJson(await this.repository.readObject(id))
      );
      if (commit.libraryId !== this.repository.libraryId)
        throw new NotesError("OWNERSHIP", "Cloud audit scope changed.");
      await verify({ hash: id });
      await verify(commit.descriptor);
      if (!descriptors.has(commit.descriptor.hash)) {
        const descriptor = await this.repository.descriptor(commit.descriptor);
        if (descriptor.documentId !== commit.documentId)
          throw new NotesError(
            "CORRUPT",
            "Cloud audit document identity changed."
          );
        for (const asset of descriptor.assets)
          for (const chunk of asset.content.parts) await verify(chunk);
        descriptors.add(commit.descriptor.hash);
      }
      for (const update of commit.updates)
        for (const chunk of update.content.parts) await verify(chunk);
      revisions.add(id);
      pending.push(...commit.parents);
    }
  }

  async publish(limit = 16): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new NotesError("LIMIT", "Invalid upload work budget.");
    await this.guard();
    if (this.transport.createMany) {
      const jobs = [];
      for (let i = 0; i < limit; i++) {
        const job = await this.repository.claimJob();
        if (!job) break;
        jobs.push(job);
      }
      if (!jobs.length) return 0;
      try {
        const objects = await this.repository.closure(jobs.map((j) => j.id));
        const missing: PreparedObject[] = [];
        for (const object of objects)
          if (!(await this.candidate(object.hash))) missing.push(object);
        await this.guard();
        try {
          await this.transport.createMany(
            missing,
            jobs.map((j) => j.id),
            this.repository.session.signal
          );
        } catch (error) {
          for (const object of missing)
            if (!(await this.candidate(object.hash))) throw error;
        }
        for (const object of objects)
          if (!(await this.candidate(object.hash)))
            throw new NotesError(
              "CORRUPT",
              "Cloud batch readback failed verification."
            );
        await this.guard();
        for (const job of jobs)
          await this.repository.settleJob(job.id, job.leaseId!, {
            verified: true,
          });
        return jobs.length;
      } catch (error) {
        if (this.repository.session.signal.aborted) throw error;
        for (const job of jobs)
          await this.repository.settleJob(job.id, job.leaseId!, {
            verified: false,
            code:
              error instanceof NotesError || error instanceof TransportError
                ? error.code
                : "NETWORK",
            blocked:
              error instanceof TransportError &&
              ["AUTH", "QUOTA"].includes(error.code),
            retryAt:
              Date.now() +
              Math.max(
                error instanceof TransportError ? error.retryAfterMs : 0,
                Math.min(300000, 1000 * 2 ** Math.min(job.attempts, 8))
              ) +
              Math.floor(Math.random() * 500),
          });
        throw error;
      }
    }
    let completed = 0;
    const verified = new Set<string>();
    while (completed < limit) {
      const job = await this.repository.claimJob();
      if (!job) break;
      try {
        const objects = await this.repository.closure([job.id]);
        for (const object of objects) {
          if (verified.has(object.hash)) continue;
          if (!(await this.candidate(object.hash))) {
            await this.guard();
            try {
              await this.transport.create(
                object.hash,
                object.bytes.slice(),
                this.repository.session.signal
              );
            } catch (error) {
              this.repository.session.assert();
              if (!(await this.candidate(object.hash))) throw error;
            }
            this.repository.session.assert();
            if (!(await this.candidate(object.hash)))
              throw new NotesError(
                "CORRUPT",
                "Remote readback did not verify the uploaded object."
              );
          }
          verified.add(object.hash);
        }
        await this.guard();
        await this.repository.settleJob(job.id, job.leaseId!, {
          verified: true,
        });
        completed++;
      } catch (error) {
        if (this.repository.session.signal.aborted) throw error;
        const retryAfter =
          error instanceof TransportError ? error.retryAfterMs : 0;
        const blocked =
          error instanceof TransportError &&
          (error.code === "AUTH" || error.code === "QUOTA");
        await this.repository.settleJob(job.id, job.leaseId!, {
          verified: false,
          code:
            error instanceof NotesError || error instanceof TransportError
              ? error.code
              : "NETWORK",
          retryAt:
            Date.now() +
            Math.max(
              retryAfter,
              Math.min(300000, 1000 * 2 ** Math.min(job.attempts, 8))
            ) +
            Math.floor(Math.random() * 500),
          blocked,
        });
        throw error;
      }
    }
    return completed;
  }
  /** A failed page never advances its cursor or activates partial history. Absence never means deletion. */
  async pull(channel = "primary", maximumPages = 100): Promise<number> {
    this.downloadIncomplete = true;
    if (
      !Number.isSafeInteger(maximumPages) ||
      maximumPages < 1 ||
      maximumPages > 1000
    )
      throw new NotesError("LIMIT", "Invalid download page budget.");
    await this.guard();
    let cursor = await this.repository.cursor(channel),
      pages = 0,
      reset = false;
    const seen = new Set<string>();
    while (pages < maximumPages) {
      await this.guard();
      let page: Awaited<ReturnType<NotesTransport["enumerate"]>>;
      try {
        page = await this.transport.enumerate(
          cursor,
          this.repository.session.signal
        );
      } catch (error) {
        if (
          !reset &&
          error instanceof TransportError &&
          error.code === "CURSOR_EXPIRED"
        ) {
          cursor = undefined;
          reset = true;
          continue;
        }
        throw error;
      }
      this.repository.session.assert();
      if (
        page.revisionIds.length > 1000 ||
        page.cursor.length > 4096 ||
        seen.has(page.cursor)
      )
        throw new NotesError(
          "LIMIT",
          "Invalid or looping provider pagination."
        );
      seen.add(page.cursor);
      const objects = new Map<string, Uint8Array>(),
        revisionIds = new Set<string>();
      let total = 0;
      const read = async (hash: string): Promise<Uint8Array> => {
        if (objects.has(hash)) return objects.get(hash)!;
        const bytes = await this.candidate(hash);
        if (!bytes)
          throw new NotesError(
            "CORRUPT",
            "A remote dependency is missing or damaged."
          );
        total += bytes.length;
        if (total > 256 * 1024 * 1024 || objects.size >= 60000)
          throw new NotesError(
            "LIMIT",
            "Download page exceeds the bounded import budget."
          );
        objects.set(hash, bytes);
        return bytes;
      };
      try {
        const pending = [...page.revisionIds];
        while (pending.length) {
          const id = pending.pop()!;
          if (revisionIds.has(id)) continue;
          const commit = commitSchema.parse(decodeJson(await read(id)));
          if (commit.libraryId !== this.repository.libraryId)
            throw new NotesError(
              "OWNERSHIP",
              "Remote commit belongs to another library."
            );
          const descriptor = documentSchema.parse(
            decodeJson(await read(commit.descriptor.hash))
          );
          for (const update of commit.updates)
            await joinContent(update.content, read);
          for (const asset of descriptor.assets)
            await joinContent(asset.content, read);
          revisionIds.add(id);
          pending.push(...commit.parents);
        }
        await this.guard();
        await this.repository.installBatch(
          [...objects].map(
            ([hash, bytes]): PreparedObject => ({ hash, bytes })
          ),
          [...revisionIds],
          "remote",
          { channel, value: page.cursor }
        );
        this.transport.acknowledgePage?.(
          page.cursor,
          this.repository.session.signal
        );
      } catch (error) {
        if (!this.repository.session.signal.aborted)
          await this.repository.quarantine(
            error instanceof NotesError ? error.code : "INVALID_REMOTE_PAGE"
          );
        throw error;
      }
      pages++;
      cursor = page.cursor;
      if (!page.more) {
        this.downloadIncomplete = false;
        return pages;
      }
    }
    return pages;
  }
}
