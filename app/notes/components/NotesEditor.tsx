"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockNoteViewRaw } from "@blocknote/react";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  Undo2,
  Redo2,
  List,
  ListChecks,
  ListOrdered,
  Link2,
  ImagePlus,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { createNotesBlockNoteEditor } from "@/lib/notes/blocknote-adapter";
import { exportNotesRecovery } from "@/lib/notes/portable";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import type { SaveState } from "@/lib/notes/engine";
import { notesResumeSchema } from "@/lib/resources";
import s from "../Notes.module.css";
import { downloadNotesBytes as downloadBytes } from "@/lib/notes/download";
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";

type Binding = Awaited<ReturnType<typeof createNotesBlockNoteEditor>>;
const states: Record<SaveState, string> = {
  ready: "Ready",
  saving: "Saving on this device…",
  pausing: "Finishing save…",
  "local-durable": "Saved on this device",
  failed: "Changes need attention",
  closed: "Editor locked",
};
export default function NotesEditor({
  library,
  note,
  pageId,
  onBack,
  onError,
  onState,
  registerLeave,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId?: string;
  onBack: () => void;
  onError: (message: string) => void;
  onState: (state: SaveState) => void;
  registerLeave: (leave?: () => Promise<void>) => void;
}) {
  const [binding, setBinding] = useState<Binding>(),
    [format, setFormat] = useState({
      block: "paragraph",
      bold: false,
      italic: false,
      underline: false,
    }),
    [pendingCount, setPendingCount] = useState(0),
    [status, setStatus] = useState<SaveState>("ready"),
    [failure, setFailure] = useState<string>(),
    [title, setTitle] = useState(note.view.descriptor.title),
    [titleState, setTitleState] = useState<"clean" | "saving" | "failed">(
      "clean"
    );
  useEffect(() => {
    if (!binding) return;
    const update = () => {
      try {
        const block = binding.editor.getTextCursorPosition().block,
          styles = binding.editor.getActiveStyles(),
          next = {
            block:
              block.type === "heading"
                ? `heading${block.props.level}`
                : block.type,
            bold: !!styles.bold,
            italic: !!styles.italic,
            underline: !!styles.underline,
          };
        setFormat((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next
        );
      } catch {
        /* Closing editors have no selection. */
      }
    };
    const selection = binding.editor.onSelectionChange(update),
      change = binding.editor.onChange(update);
    update();
    return () => {
      selection();
      change();
    };
  }, [binding]);
  const holder = useRef<Awaited<ReturnType<NotesLibrary["open"]>> | undefined>(
      undefined
    ),
    scroll = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null),
    link = useRef<HTMLDialogElement>(null),
    linkURL = useRef<HTMLInputElement>(null);
  const titleDraft = useRef({
      value: note.view.descriptor.title,
      dirty: false,
      failed: false,
    }),
    titleWrite = useRef<Promise<void> | undefined>(undefined),
    titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushTitle = useCallback(() => {
    clearTimeout(titleTimer.current);
    if (titleWrite.current) return titleWrite.current;
    if (!titleDraft.current.dirty) return Promise.resolve();
    titleWrite.current = (async () => {
      try {
        while (titleDraft.current.dirty) {
          const value = titleDraft.current.value;
          await library.mutate(note.id, (d) => {
            d.title = value.trim().slice(0, 500) || "Untitled note";
          });
          if (titleDraft.current.value === value)
            titleDraft.current.dirty = false;
        }
        titleDraft.current.failed = false;
        setTitleState("clean");
        onState(holder.current?.stream.status().state || "local-durable");
      } catch (error) {
        titleDraft.current.failed = true;
        setTitleState("failed");
        onState("failed");
        onError(
          "The title is not saved. Keep this tab open and retry the title before leaving."
        );
        throw error;
      }
    })().finally(() => {
      titleWrite.current = undefined;
    });
    return titleWrite.current;
  }, [library, note.id, onState, onError]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (titleDraft.current.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearTimeout(titleTimer.current);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  useEffect(() => {
    if (titleDraft.current.dirty) return;
    titleDraft.current.value = note.view.descriptor.title;
    queueMicrotask(() => setTitle(note.view.descriptor.title));
  }, [note.view.descriptor.title]);
  useEffect(() => {
    let cancelled = false,
      dispose: (() => void) | undefined;
    void (async () => {
      const opened = await library.open(note.id, pageId);
      if (cancelled) {
        opened.release();
        return;
      }
      holder.current = opened;
      const created = await createNotesBlockNoteEditor(opened.stream, {
        uploadFile: (input) => library.uploadImage(note.id, input),
        resolveFileUrl: (url) => library.resolveImage(note.id, url),
      });
      if (cancelled) {
        created.close();
        opened.release();
        return;
      }
      const remove = opened.stream.subscribe((state) => {
        setPendingCount(opened.stream.status().pending);
        setStatus(state);
        onState(
          titleDraft.current.dirty
            ? titleDraft.current.failed
              ? "failed"
              : "saving"
            : state
        );
        if (state === "failed")
          setFailure(
            "This editor paused to protect your changes. Retry saving, or export a recovery copy before leaving."
          );
      });
      let leaving: Promise<void> | undefined;
      const leave = () => {
        if (leaving) return leaving;
        leaving = (async () => {
          await flushTitle();
          const wasPaused = opened.stream.status().state === "pausing";
          opened.stream.pause();
          try {
            await opened.stream.flush();
            const area = scroll.current;
            const ratio =
              area && area.scrollHeight > area.clientHeight
                ? area.scrollTop / (area.scrollHeight - area.clientHeight)
                : 0;
            await library.saveResume(note.id, {
              version: 1,
              ...(pageId ? { pageId } : {}),
              blockId: created.editor.getTextCursorPosition().block.id,
              scrollRatio: Math.max(0, Math.min(1, ratio)),
            });
          } finally {
            if (!wasPaused) opened.stream.resume();
          }
        })().finally(() => {
          leaving = undefined;
        });
        return leaving;
      };
      const removeLeave = library.registerBeforeClose(leave);
      registerLeave(leave);
      dispose = () => {
        remove();
        removeLeave();
        registerLeave(undefined);
        void leave()
          .catch((error) =>
            onError(
              error instanceof Error
                ? error.message
                : "Keep your recovery copy."
            )
          )
          .finally(() => {
            created.close();
            opened.release();
          });
      };
      setBinding(created);
      const resume = notesResumeSchema.safeParse(
        note.resume ?? note.view.descriptor.extensions.resume
      );
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (resume.success && (!pageId || pageId === resume.data.pageId)) {
          try {
            if (
              resume.data.blockId &&
              created.editor.document.some((b) => b.id === resume.data.blockId)
            )
              created.editor.setTextCursorPosition(
                resume.data.blockId,
                "start"
              );
          } catch {
            /* A missing old block does not invalidate the document. */
          }
          const area = scroll.current;
          if (area)
            area.scrollTop =
              resume.data.scrollRatio * (area.scrollHeight - area.clientHeight);
        }
      });
    })().catch((error) => {
      if (!cancelled) {
        setFailure(
          error instanceof Error
            ? error.message
            : "This document needs recovery."
        );
        setStatus("failed");
        onState("failed");
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
    // A document/page identity owns the binding. Metadata updates are accepted by the existing stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, note.id, pageId, flushTitle]);
  const act = (fn: () => void) => {
    try {
      fn();
      binding?.editor.focus();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "This edit could not be applied."
      );
    }
  };
  const editable =
    !!binding && !["failed", "closed", "pausing"].includes(status);
  return (
    <section className={s.editorLayout} aria-label="Note editor">
      <div className={s.documentHeader}>
        <button
          className={s.iconButton}
          onClick={onBack}
          aria-label="Back to notes"
        >
          <ArrowLeft size={19} />
        </button>
        <input
          aria-label="Document title"
          className={s.titleInput}
          value={title}
          maxLength={500}
          onChange={(event) => {
            const value = event.target.value;
            setTitle(value);
            titleDraft.current = { value, dirty: true, failed: false };
            setTitleState("saving");
            onState("saving");
            clearTimeout(titleTimer.current);
            titleTimer.current = setTimeout(
              () => void flushTitle().catch(() => {}),
              300
            );
          }}
          onBlur={() => void flushTitle().catch(() => {})}
        />
        <span
          role="status"
          className={s.localStatus}
          data-error={status === "failed" || titleState === "failed"}
        >
          {titleState === "failed"
            ? "Title not saved — retry by leaving the field"
            : titleState === "saving"
              ? "Saving title…"
              : states[status]}
        </span>
      </div>
      <div className={s.formatBar} role="toolbar" aria-label="Text formatting">
        <select
          aria-label="Block style"
          disabled={!editable}
          onChange={(event) =>
            act(() => {
              const block = binding!.editor.getTextCursorPosition().block;
              const value = event.target.value;
              if (value.startsWith("heading"))
                binding!.editor.updateBlock(block, {
                  type: "heading",
                  props: { level: Number(value.slice(-1)) as 1 | 2 | 3 },
                });
              else binding!.editor.updateBlock(block, { type: "paragraph" });
            })
          }
          value={
            format.block.startsWith("heading") ? format.block : "paragraph"
          }
        >
          <option value="paragraph">Text</option>
          <option value="heading1">Heading 1</option>
          <option value="heading2">Heading 2</option>
          <option value="heading3">Heading 3</option>
        </select>
        <span className={s.toolbarDivider} />
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() => binding!.editor.toggleStyles({ bold: true }))
          }
          aria-label="Bold"
          aria-pressed={format.bold}
          title="Bold (Ctrl/⌘ B)"
        >
          <Bold size={17} />
        </button>
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() => binding!.editor.toggleStyles({ italic: true }))
          }
          aria-label="Italic"
          aria-pressed={format.italic}
        >
          <Italic size={17} />
        </button>
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() => binding!.editor.toggleStyles({ underline: true }))
          }
          aria-label="Underline"
          aria-pressed={format.underline}
        >
          <Underline size={17} />
        </button>
        <span className={s.toolbarDivider} />
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() =>
              binding!.editor.updateBlock(
                binding!.editor.getTextCursorPosition().block,
                { type: "bulletListItem" }
              )
            )
          }
          aria-label="Bullet list"
          aria-pressed={format.block === "bulletListItem"}
        >
          <List size={18} />
        </button>
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() =>
              binding!.editor.updateBlock(
                binding!.editor.getTextCursorPosition().block,
                { type: "numberedListItem" }
              )
            )
          }
          aria-label="Numbered list"
          aria-pressed={format.block === "numberedListItem"}
        >
          <ListOrdered size={18} />
        </button>
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            act(() =>
              binding!.editor.updateBlock(
                binding!.editor.getTextCursorPosition().block,
                { type: "checkListItem" }
              )
            )
          }
          aria-label="Checklist"
          aria-pressed={format.block === "checkListItem"}
        >
          <ListChecks size={18} />
        </button>
        <button
          disabled={!editable}
          onClick={() => link.current?.showModal()}
          aria-label="Insert link"
        >
          <Link2 size={17} />
        </button>
        <button
          disabled={!editable}
          onClick={() => file.current?.click()}
          aria-label="Insert image"
        >
          <ImagePlus size={18} />
        </button>
        <span className={s.toolbarSpacer} />
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => act(() => binding!.editor.undo())}
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          disabled={!editable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => act(() => binding!.editor.redo())}
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
      </div>
      {failure && (
        <div role="alert" className={s.editorError}>
          <span>{failure}</span>
          <button
            className={s.secondary}
            onClick={() =>
              void holder.current?.stream
                .retry()
                .then(() => {
                  setFailure(undefined);
                  setStatus("local-durable");
                })
                .catch((error) => onError(String(error.message)))
            }
          >
            <RotateCcw size={15} />
            Retry save
          </button>
          <button
            className={s.secondary}
            onClick={() =>
              void (async () => {
                if (!holder.current) return;
                const bytes = await exportNotesRecovery(
                  library.repository,
                  holder.current.stream.recoverySnapshot()
                );
                downloadBytes(bytes, `${title} recovery.sylfnote`);
              })().catch((error) =>
                onError(
                  error instanceof Error
                    ? error.message
                    : "Keep this tab open; export needs recovery."
                )
              )
            }
          >
            <Download size={15} />
            Export recovery copy
          </button>
          <button
            className={s.secondary}
            disabled={pendingCount > 0 || !!library.snapshot().memoryPending}
            onClick={() => {
              if (
                holder.current?.stream.status().pending ||
                library.snapshot().memoryPending
              ) {
                onError(
                  "Export your recovery copy and retry saving before reopening. Unsaved changes are retained."
                );
                return;
              }
              window.location.reload();
            }}
          >
            Reopen saved version
          </button>
        </div>
      )}
      <div
        ref={scroll}
        className={s.paperScroll}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();
            void holder.current?.stream
              .flush()
              .catch((error) => onError(String(error.message)));
          }
        }}
      >
        <div className={s.paper}>
          {binding ? (
            <BlockNoteViewRaw
              editor={binding.editor}
              formattingToolbar={false}
              slashMenu={false}
              sideMenu={false}
              filePanel={false}
              linkToolbar={false}
              tableHandles={false}
            />
          ) : (
            !failure && (
              <p className={s.loading}>
                <Loader2 size={18} className={s.spin} />
                Opening document…
              </p>
            )
          )}
        </div>
      </div>
      <input
        ref={file}
        className={s.hidden}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Choose an image"
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = "";
          if (!image || !binding) return;
          void library
            .uploadImage(note.id, image)
            .then((url) => {
              binding.editor.insertBlocks(
                [{ type: "image", props: { url, name: image.name } }],
                binding.editor.getTextCursorPosition().block,
                "after"
              );
            })
            .catch((error) =>
              onError(
                error instanceof Error ? error.message : "Image upload failed."
              )
            );
        }}
      />
      <dialog ref={link} className={s.dialog} aria-label="Insert link">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const url = linkURL.current?.value || "";
            if (!/^https?:\/\//i.test(url)) {
              onError("Use a complete HTTPS or HTTP link.");
              return;
            }
            act(() => binding!.editor.createLink(url));
            link.current?.close();
          }}
        >
          <h2>Insert link</h2>
          <label className={s.field}>
            Web address
            <input
              ref={linkURL}
              type="url"
              required
              autoFocus
              placeholder="https://…"
            />
          </label>
          <div className={s.dialogActions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => link.current?.close()}
            >
              Cancel
            </button>
            <button className={s.primary}>Add link</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
