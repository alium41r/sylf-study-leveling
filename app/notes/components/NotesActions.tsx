"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Download,
  Copy,
  Trash2,
  History,
  RotateCcw,
  FolderInput,
  Loader2,
  Star,
} from "lucide-react";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import type {
  Revision,
  DocumentDescriptor,
  AssetDescriptor,
} from "@/lib/notes/contracts";
import { exportNotes, exportNotesRecovery } from "@/lib/notes/portable";
import { exportLockedNotesDevice } from "@/lib/notes/device-recovery";
import NotesDialog from "./NotesDialog";
import { downloadNotesBytes as downloadBytes } from "@/lib/notes/download";
import s from "../Notes.module.css";
const InkThumbnail = lazy(() => import("./InkThumbnail"));
export interface NotesModal {
  type: "folder" | "notebook" | "manage" | "history" | "recovery" | "conflict";
  id?: string;
  parentId?: string | null;
  ink?: boolean;
}
export interface NotesSubject {
  id: number;
  name: string;
}
export default function NotesActions({
  library,
  modal,
  subjects,
  onClose,
  onOpen,
  onError,
  onResolved,
}: {
  library: NotesLibrary;
  modal: NotesModal;
  subjects: NotesSubject[];
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
  onError: (error: string) => void;
  onResolved: () => void;
}) {
  const snapshot = library.snapshot(),
    note = snapshot.notes.find((n) => n.id === modal.id),
    folder = snapshot.folders.find((f) => f.id === modal.id);
  const [name, setName] = useState(
      folder?.name || note?.view.descriptor.title || ""
    ),
    [parent, setParent] = useState(
      folder?.parentId || note?.view.descriptor.folderId || modal.parentId || ""
    ),
    [subject, setSubject] = useState(note?.view.descriptor.subjectId || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<Revision[]>([]),
    [preview, setPreview] = useState(""),
    [inkPreview, setInkPreview] = useState<NoteSummary>(),
    [inkPreviewPage, setInkPreviewPage] = useState<string>(),
    [historyLimit, setHistoryLimit] = useState(100),
    [alternatives, setAlternatives] = useState<
      { hash: string; descriptor: DocumentDescriptor }[]
    >([]),
    [integrity, setIntegrity] = useState<string>(),
    [recoveryInfo, setRecoveryInfo] = useState<{
      stages: AssetDescriptor[];
      pending: number;
      blocked: number;
      errors: string[];
      used?: number;
      quota?: number;
    }>();
  useEffect(() => {
    let active = true;
    const id = modal.id;
    if (modal.type === "recovery")
      void Promise.all([
        library.repository.pendingAssets(),
        library.repository.jobs(),
        navigator.storage?.estimate?.() ||
          Promise.resolve({ usage: undefined, quota: undefined }),
      ])
        .then(([stages, jobs, estimate]) => {
          if (active)
            setRecoveryInfo({
              stages,
              pending: jobs.filter((j) => j.state !== "verified").length,
              blocked: jobs.filter((j) => j.state === "blocked").length,
              errors: [
                ...new Set(jobs.flatMap((j) => (j.error ? [j.error] : []))),
              ],
              used: estimate.usage,
              quota: estimate.quota,
            });
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    if (modal.type === "history" && id)
      void library.repository
        .listRevisions(id)
        .then((rows) => {
          if (active)
            setHistory(
              rows.sort((a, b) => b.commit.sequence - a.commit.sequence)
            );
        })
        .catch((error) => {
          if (active) setError(String(error.message));
        });
    if (modal.type === "conflict" && id)
      void library.repository
        .document(id)
        .then((view) =>
          Promise.all(
            view.alternatives.map(async (ref) => ({
              hash: ref.hash,
              descriptor: await library.repository.descriptor(ref),
            }))
          )
        )
        .then((rows) => {
          if (active) setAlternatives(rows);
        })
        .catch((error) => {
          if (active) setError(String(error.message));
        });
    return () => {
      active = false;
    };
  }, [library, modal.type, modal.id]);
  const run = async (fn: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (close) onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "This operation could not finish. Your notes were retained.";
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };
  const title = {
    folder: folder ? "Edit folder" : "New folder",
    notebook: modal.ink ? "Handwritten notebook" : "New notebook",
    manage: "Document details",
    history: "Version history",
    recovery: "Recovery & storage",
    conflict: "Review preserved versions",
  }[modal.type];
  const exportSelection = async () => {
    await library.flushEditors();
    const file = await exportNotes(
      library.repository,
      note ? [note.id] : undefined
    );
    downloadBytes(
      file.bytes,
      `${note?.view.descriptor.title || "Sylf Notes library"}.sylfnote`
    );
  };
  return (
    <NotesDialog
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p role="alert" className={s.inlineError}>
          {error}
        </p>
      )}
      {["folder", "notebook", "manage"].includes(modal.type) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (modal.type === "folder")
                await library.folder(name, parent || null, folder?.id);
              else if (modal.type === "notebook")
                await onOpen(
                  await library.create(
                    name || "Untitled notebook",
                    "notebook",
                    parent || null,
                    modal.ink ? "ink" : "typed"
                  )
                );
              else if (note)
                await library.mutate(note.id, (descriptor) => {
                  descriptor.title = name.trim() || "Untitled note";
                  descriptor.folderId = parent || null;
                  descriptor.subjectId = subject || null;
                });
            });
          }}
        >
          <label className={s.field}>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={modal.type === "folder" ? 160 : 500}
              autoFocus
              placeholder={
                modal.type === "notebook"
                  ? "e.g. Lecture notebook"
                  : "Give it a name"
              }
            />
          </label>
          <label className={s.field}>
            <span>
              <FolderInput size={15} />
              Folder
            </span>
            <select
              value={parent}
              onChange={(event) => setParent(event.target.value)}
            >
              <option value="">Unfiled</option>
              {snapshot.folders
                .filter((f) => f.id !== folder?.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          {modal.type === "manage" && (
            <label className={s.field}>
              Subject
              <select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option value="">No subject</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={String(sub.id)}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={s.dialogActions}>
            <button
              type="button"
              className={s.secondary}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className={s.primary} disabled={busy}>
              {busy ? <Loader2 size={17} className={s.spin} /> : "Save"}
            </button>
          </div>
        </form>
      )}
      {modal.type === "manage" && note && (
        <div className={s.actionList}>
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                library.mutate(note.id, (d) => {
                  d.extensions.favorite = !d.extensions.favorite;
                })
              )
            }
          >
            <Star size={17} />
            {note.view.descriptor.extensions.favorite
              ? "Remove from favorites"
              : "Add to favorites"}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await library.flushEditors();
                await onOpen(await library.duplicate(note.id));
              })
            }
          >
            <Copy size={17} />
            Duplicate document
          </button>
          <button
            disabled={busy}
            onClick={() => void run(exportSelection, false)}
          >
            <Download size={17} />
            Export portable copy
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await library.mutate(
                  note.id,
                  () => {},
                  note.view.state === "trashed" ? "restore" : "tombstone"
                );
              })
            }
          >
            <Trash2 size={17} />
            {note.view.state === "trashed"
              ? "Restore document"
              : "Move to Trash"}
          </button>
          <p>
            Trash keeps your content and history. Export files contain readable
            note content; keep copies somewhere safe.
          </p>
        </div>
      )}
      {modal.type === "folder" && folder && (
        <button
          className={s.dangerButton}
          disabled={busy}
          onClick={() =>
            void run(() =>
              library.folder(folder.name, folder.parentId, folder.id, true)
            )
          }
        >
          <Trash2 size={16} />
          Remove folder, keep its notes
        </button>
      )}
      {modal.type === "history" && (
        <>
          <p className={s.hint}>
            Every saved revision is retained. Restoring creates a separate note
            and preserves the current document.
          </p>
          <div className={s.historyList}>
            {history.slice(0, historyLimit).map((revision) => (
              <div key={revision.id} className={s.historyRow}>
                <History size={16} />
                <div>
                  <strong>
                    {revision.commit.kind === "create"
                      ? "Created"
                      : revision.commit.kind === "tombstone"
                        ? "Moved to Trash"
                        : revision.commit.kind === "restore"
                          ? "Restored"
                          : "Saved revision"}
                  </strong>
                  <small>
                    {new Date(revision.commit.createdAt).toLocaleString()}
                  </small>
                </div>
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const descriptor = await library.repository.descriptor(
                          revision.commit.descriptor
                        ),
                        definition = descriptor.streams.find(
                          (stream) => stream.adapter === "blocknote/0.56.0"
                        );
                      setInkPreview(undefined);
                      if (!definition) {
                        const inkPage = descriptor.pages.find((p) =>
                          descriptor.streams.some(
                            (s) =>
                              s.streamId === p.streamId &&
                              s.adapter === "sylf-ink/1"
                          )
                        );
                        if (inkPage) {
                          setInkPreview({
                            id: descriptor.documentId,
                            view: {
                              descriptor,
                              descriptorRef: revision.commit.descriptor,
                              heads: [revision.id],
                              state: "active",
                              alternatives: [],
                            },
                            updatedAt: revision.commit.createdAt,
                            preview: "",
                            searchText: "",
                          });
                          setInkPreviewPage(inkPage.pageId);
                          setPreview(
                            "Retained handwriting at this revision. Restoring creates a separate notebook."
                          );
                        } else
                          setPreview(
                            "This revision requires its original reader."
                          );
                        return;
                      }
                      const loaded = await library.repository.loadStream(
                        revision.commit.documentId,
                        definition.streamId,
                        definition.epoch,
                        [revision.id]
                      );
                      try {
                        setPreview(
                          loaded.doc
                            .getXmlFragment("body")
                            .toString()
                            .replace(/<[^>]*>/g, " ")
                            .slice(0, 10000) || "Empty document"
                        );
                      } finally {
                        loaded.doc.destroy();
                      }
                    }, false)
                  }
                >
                  Preview
                </button>
                <button
                  className={s.iconButton}
                  disabled={busy}
                  title="Restore as a new note"
                  aria-label={`Restore revision ${revision.commit.sequence} as new note`}
                  onClick={() =>
                    void run(async () => {
                      await onOpen(
                        await library.duplicate(
                          revision.commit.documentId,
                          revision.id
                        )
                      );
                    })
                  }
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            ))}
          </div>
          {history.length > historyLimit && (
            <button
              className={s.secondary}
              onClick={() => setHistoryLimit((n) => n + 100)}
            >
              Show earlier revisions
            </button>
          )}
          {preview && (
            <div
              className={s.historyPreview}
              aria-label="Read-only revision preview"
            >
              {preview}
              {inkPreview && inkPreviewPage && (
                <div>
                  <label>
                    Retained page
                    <select
                      aria-label="History paper page"
                      value={inkPreviewPage}
                      onChange={(e) => setInkPreviewPage(e.target.value)}
                    >
                      {inkPreview.view.descriptor.pages.map((p, i) => (
                        <option key={p.pageId} value={p.pageId}>
                          Page {i + 1}
                          {p.extensions.archived ? " · removed" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Suspense fallback={<p>Loading retained ink…</p>}>
                    <InkThumbnail
                      library={library}
                      note={inkPreview}
                      pageId={inkPreviewPage}
                      size={200}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {modal.type === "conflict" && note && (
        <>
          <p className={s.hint}>
            All versions and text edits are preserved. Choose the title and
            organization to keep. Text, images and pages from the alternatives
            remain available.
          </p>
          {alternatives.map((alt) => (
            <div key={alt.hash} className={s.conflictChoice}>
              <div>
                <strong>{alt.descriptor.title}</strong>
                <small>
                  {snapshot.folders.find(
                    (f) => f.id === alt.descriptor.folderId
                  )?.name || "Unfiled"}{" "}
                  · {alt.descriptor.assets.length} attachments
                </small>
              </div>
              <button
                className={s.secondary}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await library.resolveConflict(note.id, alt.hash);
                    onResolved();
                  })
                }
              >
                Keep this version
              </button>
            </div>
          ))}
        </>
      )}
      {modal.type === "recovery" && (
        <>
          <p className={s.hint}>
            <a
              href="/notes-licenses/notices.txt"
              target="_blank"
              rel="noreferrer"
            >
              Open-source notices
            </a>{" "}
            ·{" "}
            <a href="/notes-licenses/blocknote-0.56.0-source.zip" download>
              BlockNote covered source
            </a>
          </p>
          {recoveryInfo && (
            <div className={s.hint} role="status">
              <p>
                {recoveryInfo.pending} revisions waiting for cloud verification
                · {recoveryInfo.blocked} blocked
                {recoveryInfo.errors.length
                  ? ` · ${recoveryInfo.errors.join(", ")}`
                  : ""}
              </p>
              <p>
                {snapshot.verifiedAt
                  ? `Last cloud verification: ${new Date(snapshot.verifiedAt).toLocaleString()}`
                  : "No current full cloud verification."}
              </p>
              {recoveryInfo.quota && (
                <p>
                  Sylf browser storage:{" "}
                  {Math.round((recoveryInfo.used || 0) / 1048576)} /{" "}
                  {Math.round(recoveryInfo.quota / 1048576)} MiB estimated.
                  Browser persistence is advisory.
                </p>
              )}
            </div>
          )}
          {!!recoveryInfo?.stages.length && (
            <div className={s.actionList}>
              <p>
                Retained uploads ({recoveryInfo.stages.length}). These originals
                are kept even if attaching them was interrupted.
              </p>
              {recoveryInfo.stages.slice(0, 100).map((asset) => (
                <button
                  key={asset.assetId}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () =>
                        downloadBytes(
                          await library.repository.readContent(asset.content),
                          asset.name || asset.assetId
                        ),
                      false
                    )
                  }
                >
                  <Download size={16} />
                  Save original: {asset.name || asset.assetId.slice(0, 12)}
                </button>
              ))}
              {recoveryInfo.stages.length > 100 && (
                <p>
                  First 100 shown. All originals remain retained on this device.
                </p>
              )}
            </div>
          )}
          {!!snapshot.memoryPending && (
            <div role="alert" className={s.inlineError}>
              Unsaved edits are retained in this tab. Keep it open until a
              recovery copy is exported and saving works again.
              <div className={s.dialogActions}>
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const snapshots = library.recoverySnapshots();
                      downloadBytes(
                        await exportNotesRecovery(
                          library.repository,
                          snapshots
                        ),
                        "Sylf Notes pending recovery.sylfnote"
                      );
                    }, false)
                  }
                >
                  Export pending recovery copy
                </button>
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() =>
                    void run(() => library.retryMemoryRecovery(), false)
                  }
                >
                  Retry pending saves
                </button>
              </div>
            </div>
          )}
          <p className={s.hint}>
            Local saves and cloud copies are separate. Export an independent
            copy regularly. Clearing browser storage or losing this device can
            remove work that has not reached Drive.
          </p>
          <div className={s.actionList}>
            <button
              disabled={busy}
              onClick={() => void run(exportSelection, false)}
            >
              <Download size={18} />
              Export entire library
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  async () =>
                    downloadBytes(
                      await exportLockedNotesDevice(
                        library.session.ownerId,
                        library.repository.libraryId,
                        () => !library.session.signal.aborted
                      ),
                      "Sylf encrypted device recovery.sylfdevice.json"
                    ),
                  false
                )
              }
            >
              <Download size={18} />
              Preserve encrypted device copy
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await library.repository.inspectIntegrity();
                  setIntegrity(
                    result.issues.length
                      ? `${result.issues.length} source objects need recovery. Keep local data and restore original bytes from Drive or a portable copy.`
                      : "All retained revision dependencies passed their integrity checks."
                  );
                }, false)
              }
            >
              <History size={18} />
              Check local data
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await library.repository.recoverLostJournal();
                  await library.repository.rebuildCatalog();
                  await library.refresh();
                  setIntegrity(
                    "Local indexes were rebuilt from verified originals. Pending work was retained."
                  );
                }, false)
              }
            >
              <RotateCcw size={18} />
              Rebuild local indexes
            </button>
          </div>
          {integrity && (
            <p role="status" className={s.hint}>
              {integrity}
            </p>
          )}
          <p className={s.privacyNote}>
            This device keeps encrypted note content. Reopening requires an
            authenticated connection to Sylf. Portable files and your Drive
            library remain readable; this is not end-to-end encryption.
          </p>
        </>
      )}
    </NotesDialog>
  );
}
