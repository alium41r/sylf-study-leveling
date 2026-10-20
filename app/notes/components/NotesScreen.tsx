"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Folder,
  Plus,
  Search,
  Clock3,
  Star,
  Trash2,
  PanelLeft,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Cloud,
  CloudOff,
  Check,
  Loader2,
  Upload,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  History,
  X,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  NotesLibrary,
  type NoteSummary,
  type NotesCloudConnection,
  type LibrarySnapshot,
} from "@/lib/notes/library";
import { notesRequest } from "@/lib/notes/drive-transport";
import { prepareNotesLogout } from "@/lib/notes/session";
import { notesResourceURL } from "@/lib/resources";
import { exportLockedNotesDevice } from "@/lib/notes/device-recovery";
import { downloadNotesBytes } from "@/lib/notes/download";
import { importNotes } from "@/lib/notes/portable";
import type { SaveState } from "@/lib/notes/engine";
import NotesActions, {
  type NotesModal,
  type NotesSubject,
} from "./NotesActions";
import s from "../Notes.module.css";
const NotesEditor = lazy(() => import("./NotesEditor"));
const InkEditor = lazy(() => import("./InkEditor"));
const InkThumbnail = lazy(() => import("./InkThumbnail"));
const emptySnapshot: LibrarySnapshot = {
  notes: [],
  folders: [],
  ready: false,
  syncing: false,
  pending: 0,
  searchIndexed: 0,
  searchTotal: 0,
};
const noopSubscribe = () => () => {};
const message = (error: unknown) =>
  error instanceof Error
    ? {
        AUTH: "Reconnect the original Google Drive account. Your local notes are retained.",
        NETWORK:
          "Notes could not reach its storage service. Your local changes are retained.",
        QUOTA: "Cloud storage is full. Free space in Drive, then retry.",
        THROTTLE: "Drive is busy. Notes will retry after a short pause.",
      }[error.message] || error.message
    : "Notes could not finish this operation.";

export default function NotesScreen() {
  const { user, isLoading } = useAuth(),
    router = useRouter(),
    params = useSearchParams();
  const ownerId = user ? String(user.id) : "",
    owner = useRef(ownerId);
  useLayoutEffect(() => {
    owner.current = ownerId;
  }, [ownerId]);
  const [library, setLibrary] = useState<NotesLibrary>(),
    [headerRecoveryFor, setHeaderRecoveryFor] = useState<string>(),
    [connection, setConnection] = useState<NotesCloudConnection | null>(),
    [configured, setConfigured] = useState(false),
    [opening, setOpening] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [navOpen, setNavOpen] = useState(false),
    [filter, setFilter] = useState("recent"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [grid, setGrid] = useState(true),
    [limit, setLimit] = useState(50),
    [folderLimit, setFolderLimit] = useState(200),
    [editorGeneration, setEditorGeneration] = useState(0),
    [subjects, setSubjects] = useState<NotesSubject[]>([]),
    [modal, setModal] = useState<NotesModal>(),
    [saveState, setSaveState] = useState<SaveState>("ready"),
    [createOpen, setCreateOpen] = useState(false);
  const leave = useRef<(() => Promise<void>) | undefined>(undefined),
    importInput = useRef<HTMLInputElement>(null);
  const ownsLibrary =
    library?.session.ownerId === ownerId && !library?.session.signal.aborted;
  const snapshot = useSyncExternalStore(
    ownsLibrary ? library.subscribe : noopSubscribe,
    ownsLibrary ? library.snapshot : () => emptySnapshot,
    () => emptySnapshot
  );
  const documentId = params.get("document"),
    pageId = params.get("page") || undefined;
  const note =
    !params.get("library") ||
    params.get("library") === library?.repository.libraryId
      ? snapshot.notes.find((n) => n.id === documentId)
      : undefined;
  const resolvedPage =
    pageId ||
    (note?.resume?.pageId &&
    note.view.descriptor.pages.some(
      (page) => page.pageId === note.resume?.pageId && !page.extensions.archived
    )
      ? note.resume.pageId
      : undefined);
  const isInk =
    note?.view.descriptor.streams.find(
      (s) =>
        s.streamId ===
        (
          note.view.descriptor.pages.find((p) => p.pageId === resolvedPage) ||
          note.view.descriptor.pages.find((p) => !p.extensions.archived)
        )?.streamId
    )?.adapter === "sylf-ink/1";
  useEffect(() => {
    if (
      !ownsLibrary ||
      !library ||
      !note ||
      pageId ||
      note.view.descriptor.kind !== "notebook"
    )
      return;
    const initialPage =
      resolvedPage ||
      note.view.descriptor.pages.find((p) => !p.extensions.archived)?.pageId;
    if (initialPage)
      router.replace(
        notesResourceURL({
          version: 1,
          type: "sylf-note",
          libraryId: library.repository.libraryId,
          documentId: note.id,
          pageId: initialPage,
        }),
        { scroll: false }
      );
  }, [ownsLibrary, library, note, pageId, resolvedPage, router]);
  const onError = useCallback((value: string) => setError(value), []),
    onState = useCallback((state: SaveState) => setSaveState(state), []),
    registerLeave = useCallback((callback?: () => Promise<void>) => {
      leave.current = callback;
    }, []);
  useEffect(() => {
    let disposed = false,
      opened: NotesLibrary | undefined;
    queueMicrotask(() => {
      if (!disposed) {
        setOpening(!!ownerId);
        setError("");
        setSubjects([]);
        setModal(undefined);
        setQuery("");
        setFilter("recent");
        setNavOpen(false);
        setLimit(50);
        setSaveState("ready");
      }
    });
    if (!ownerId)
      return () => {
        disposed = true;
      };
    void (async () => {
      const result = await (await notesRequest("/api/notes/connection")).json();
      if (disposed || owner.current !== ownerId) return;
      setConfigured(result.configured);
      setConnection(result.connection);
      if (result.connection) {
        opened = await NotesLibrary.unlock(
          ownerId,
          () => !disposed && owner.current === ownerId,
          headerRecoveryFor === ownerId
        );
        if (disposed) {
          await opened.dispose();
          return;
        }
        setLibrary(opened);
      }
      const loaded = await fetchCachedJSON<NotesSubject[]>(
        "/api/subjects",
        undefined,
        { ttlMs: 60000 }
      );
      if (!disposed) setSubjects(Array.isArray(loaded) ? loaded : []);
    })()
      .catch((error) => {
        if (!disposed) setError(message(error));
      })
      .finally(() => {
        if (!disposed) setOpening(false);
      });
    return () => {
      disposed = true;
      if (opened) void opened.dispose().catch(() => {});
    };
  }, [ownerId, retry, headerRecoveryFor]);
  useEffect(() => {
    if (!ownsLibrary || !query.trim()) return;
    const timer = setTimeout(() => {
      void library.indexSearch().catch((error) => setError(message(error)));
    }, 350);
    return () => clearTimeout(timer);
  }, [library, ownsLibrary, query]);
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      // OAuth replaces this page. It must not strand the only memory copy of
      // failed saves or a title still waiting for persistence.
      if (ownsLibrary && library) {
        await library.flushEditors();
        await library.retryMemoryRecovery();
      } else await prepareNotesLogout(ownerId);
      if (owner.current !== ownerId)
        throw new Error(
          "Notes access changed. Reopen the current account before connecting Drive."
        );
      const response = await notesRequest("/api/notes/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const result = await response.json();
      const url = new URL(result.url);
      if (url.origin !== "https://accounts.google.com")
        throw new Error(
          "Google connection returned an unexpected destination."
        );
      window.location.assign(url.href);
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  };
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string, page?: string) => {
    await leave.current?.();
    setSaveState("ready");
    setNavOpen(false);
    const selected = snapshot.notes.find((n) => n.id === id);
    const resumePage = selected?.resume?.pageId;
    const targetPage =
      page ||
      (selected?.view.descriptor.pages.some(
        (p) => p.pageId === resumePage && !p.extensions.archived
      )
        ? resumePage
        : selected?.view.descriptor.pages.find((p) => !p.extensions.archived)
            ?.pageId);
    router.replace(
      notesResourceURL({
        version: 1,
        type: "sylf-note",
        libraryId: library!.repository.libraryId,
        documentId: id,
        ...(targetPage ? { pageId: targetPage } : {}),
      }),
      { scroll: false }
    );
  };
  const back = async () => {
    await leave.current?.();
    setSaveState("ready");
    router.replace("/notes", { scroll: false });
  };
  const chooseFilter = (value: string) => {
    void run(async () => {
      await back();
      setFilter(value);
      setLimit(50);
      setNavOpen(false);
    });
  };
  const selectedFolder = filter.startsWith("folder:") ? filter.slice(7) : null;
  const selectedSubject = filter.startsWith("subject:")
    ? filter.slice(8)
    : null;
  const heading = selectedFolder
    ? snapshot.folders.find((f) => f.id === selectedFolder)?.name || "Unfiled"
    : selectedSubject
      ? subjects.find((sub) => String(sub.id) === selectedSubject)?.name ||
        "Subject notes"
      : {
          recent: "Recent",
          all: "All notes",
          favorites: "Favorites",
          trash: "Trash",
          unfiled: "Unfiled",
        }[filter] || "All notes";
  const filtered = snapshot.notes
    .filter((n) => {
      const d = n.view.descriptor;
      if (
        filter === "trash"
          ? n.view.state !== "trashed"
          : n.view.state === "trashed"
      )
        return false;
      if (
        (selectedFolder && d.folderId !== selectedFolder) ||
        (selectedSubject && d.subjectId !== selectedSubject) ||
        (filter === "favorites" && !d.extensions.favorite) ||
        (filter === "unfiled" &&
          d.folderId &&
          snapshot.folders.some((f) => f.id === d.folderId))
      )
        return false;
      const search = query.toLocaleLowerCase().trim();
      return (
        !search ||
        d.title.toLocaleLowerCase().includes(search) ||
        n.searchText.includes(search)
      );
    })
    .sort((a, b) =>
      sort === "title"
        ? a.view.descriptor.title.localeCompare(b.view.descriptor.title)
        : sort === "oldest"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt)
    );
  const cloudError = snapshot.error ? message(new Error(snapshot.error)) : "";
  const cloudLabel = snapshot.memoryPending
    ? "Unsaved recovery"
    : saveState === "saving" || busy
      ? "Saving…"
      : saveState === "failed"
        ? "Unsaved changes"
        : snapshot.syncing
          ? "Syncing…"
          : cloudError
            ? "Sync paused"
            : snapshot.localUploads
              ? `${snapshot.localUploads} upload${snapshot.localUploads === 1 ? "" : "s"} on device`
              : snapshot.pending
                ? `${snapshot.pending} pending`
                : snapshot.verifiedAt
                  ? "Saved to Drive"
                  : "On this device";
  const titleLabel = note?.view.descriptor.title || heading;
  if (isLoading || (opening && !ownsLibrary))
    return (
      <div className={s.root}>
        <header className={s.pageHeader}>
          <h1>Notes</h1>
        </header>
        <div className={s.loadingScreen} role="status">
          <Loader2 className={s.spin} size={24} />
          <p>Opening your library…</p>
          <span>Verifying access and retaining your local changes.</span>
        </div>
      </div>
    );
  if (!user)
    return (
      <div className={s.root}>
        <header className={s.pageHeader}>
          <h1>Notes</h1>
        </header>
        <div className={s.onboarding}>
          <BookOpen size={42} />
          <h2>Your notes, together.</h2>
          <p>Sign in to open your private Notes library.</p>
          <Link className={s.primary} href="/login">
            Sign in
          </Link>
        </div>
      </div>
    );
  if (!ownsLibrary)
    return (
      <div className={s.root}>
        <header className={s.pageHeader}>
          <h1>Notes</h1>
        </header>
        <div className={s.onboarding}>
          <div className={s.paperIllustration} aria-hidden="true">
            <div>
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <BookOpen size={34} />
              <span />
              <span />
            </div>
          </div>
          <h2>Your notes, in your Drive.</h2>
          <p>
            A quiet place for lecture notes, ideas, and everything you’re
            learning. Connect Google Drive to create your library.
          </p>
          {error && (
            <p role="alert" className={s.inlineError}>
              {error}
            </p>
          )}
          {params.get("drive") === "failed" && (
            <p role="alert" className={s.inlineError}>
              Drive setup was not completed. Reconnect with the original Google
              account. Any existing library was kept.
            </p>
          )}
          <button
            className={s.primary}
            disabled={busy || !configured}
            onClick={() => void connect()}
          >
            {busy ? (
              <Loader2 size={18} className={s.spin} />
            ) : (
              <Cloud size={19} />
            )}{" "}
            {connection ? "Reconnect Google Drive" : "Connect Google Drive"}
            <ArrowUpRight size={16} />
          </button>
          {!configured && (
            <p className={s.hint}>
              Google Drive is not available on this Sylf deployment yet.
            </p>
          )}
          <button
            className={s.textButton}
            onClick={() => {
              setHeaderRecoveryFor(undefined);
              setRetry((value) => value + 1);
            }}
          >
            Retry opening library
          </button>
          {connection && error && (
            <button
              className={s.textButton}
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  downloadNotesBytes(
                    await exportLockedNotesDevice(
                      ownerId,
                      connection.descriptor.libraryId,
                      () => owner.current === ownerId
                    ),
                    "Sylf encrypted device recovery.sylfdevice.json"
                  )
                )
              }
            >
              Preserve encrypted device copy
            </button>
          )}
          {connection && configured && error && (
            <button
              className={s.textButton}
              onClick={() => {
                setHeaderRecoveryFor(ownerId);
                setRetry((value) => value + 1);
              }}
            >
              Repair device header from original Drive library
            </button>
          )}
          <div className={s.onboardingTrust}>
            <ShieldCheck size={16} />
            <span>
              Local autosave. Your own cloud storage. Recoverable history.
            </span>
          </div>
          <p className={s.privacyNote}>
            Notes can keep working through temporary outages after unlocking.
            Reopening requires a connection to Sylf. Browser storage deletion
            can remove unsynchronized work.
          </p>
        </div>
      </div>
    );
  const folderDepth = (id: string) => {
    let depth = 0,
      current = snapshot.folders.find((f) => f.id === id);
    while (current?.parentId && depth < 7) {
      depth++;
      current = snapshot.folders.find((f) => f.id === current!.parentId);
    }
    return depth;
  };
  return (
    <div
      className={s.root}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          navOpen &&
          !(
            event.target instanceof Element &&
            event.target.closest("dialog[open]")
          )
        ) {
          setNavOpen(false);
          event.preventDefault();
          event.currentTarget
            .querySelector<HTMLButtonElement>(
              '[aria-label="Open library navigation"]'
            )
            ?.focus();
        }
      }}
    >
      <header className={s.pageHeader}>
        <h1>Notes</h1>
        <div className={s.headerActions}>
          <button
            className={s.cloudStatus}
            data-warning={
              !!cloudError || !!snapshot.memoryPending || saveState === "failed"
            }
            onClick={() => void run(() => library.retrySync())}
            title={
              snapshot.verifiedAt
                ? `Last verified ${new Date(snapshot.verifiedAt).toLocaleString()}`
                : "View synchronization status"
            }
          >
            {snapshot.syncing ? (
              <Loader2 size={15} className={s.spin} />
            ) : cloudError ? (
              <CloudOff size={16} />
            ) : snapshot.verifiedAt && !snapshot.pending ? (
              <Check size={16} />
            ) : (
              <Cloud size={16} />
            )}
            <span>{cloudLabel}</span>
          </button>
          <button
            className={s.iconButton}
            title="Recovery and storage"
            aria-label="Recovery and storage"
            onClick={() => setModal({ type: "recovery" })}
          >
            <History size={19} />
          </button>
        </div>
      </header>
      {(error || cloudError || !!snapshot.memoryPending) && (
        <div role="alert" className={s.notice}>
          <CloudOff size={17} />
          <span>
            {snapshot.memoryPending
              ? "Unsaved edits are retained in this tab. Open Recovery to export or retry them before closing."
              : error || cloudError}
          </span>
          {!!snapshot.memoryPending && (
            <button
              className={s.textButton}
              onClick={() => setModal({ type: "recovery" })}
            >
              Open Recovery
            </button>
          )}
          <button
            className={s.textButton}
            onClick={() => void run(() => library.retrySync())}
          >
            Retry sync
          </button>
          <button className={s.textButton} onClick={() => void connect()}>
            Reconnect
          </button>
          {error && (
            <button
              className={s.iconButton}
              aria-label="Dismiss message"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <div className={`${s.workspace} ${navOpen ? s.navOpen : ""}`} data-paper={isInk || undefined}>
        {navOpen && (
          <button
            className={s.navBackdrop}
            aria-label="Close library navigation"
            onClick={() => setNavOpen(false)}
          />
        )}
        <nav
          id="notes-library-navigation"
          className={s.libraryNav}
          aria-label="Notes library"
        >
          <div className={s.navGroup}>
            {[
              { id: "recent", label: "Recent", icon: Clock3 },
              { id: "all", label: "All notes", icon: FileText },
              { id: "favorites", label: "Favorites", icon: Star },
              { id: "trash", label: "Trash", icon: Trash2 },
            ].map((item) => (
              <button
                key={item.id}
                className={`${s.navItem} ${filter === item.id && !documentId ? s.navActive : ""}`}
                onClick={() => chooseFilter(item.id)}
              >
                <item.icon size={18} />
                {item.label}
                {item.id === "all" && (
                  <span>
                    {
                      snapshot.notes.filter((n) => n.view.state !== "trashed")
                        .length
                    }
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className={s.navSection}>
            <span>Folders</span>
            <button
              className={s.iconButton}
              aria-label="New folder"
              disabled={!snapshot.ready}
              onClick={() =>
                setModal({ type: "folder", parentId: selectedFolder })
              }
            >
              <Plus size={16} />
            </button>
          </div>
          <div className={s.folderList}>
            {snapshot.folders.length === 0 && (
              <p className={s.navHint}>A little order for your ideas.</p>
            )}
            {snapshot.folders.slice(0, folderLimit).map((folder) => (
              <div
                key={folder.id}
                className={s.folderRow}
                style={{ paddingLeft: folderDepth(folder.id) * 12 }}
              >
                <button
                  className={`${s.navItem} ${selectedFolder === folder.id ? s.navActive : ""}`}
                  title={folder.name}
                  onClick={() => chooseFilter("folder:" + folder.id)}
                >
                  <Folder size={16} />
                  <span>{folder.name}</span>
                </button>
                <button
                  className={s.folderMore}
                  aria-label={`Edit folder ${folder.name}`}
                  onClick={() => setModal({ type: "folder", id: folder.id })}
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            ))}
            {snapshot.folders.length > folderLimit && (
              <button
                className={s.textButton}
                onClick={() => setFolderLimit((value) => value + 200)}
              >
                Show more folders
              </button>
            )}
            <button
              className={`${s.navItem} ${filter === "unfiled" ? s.navActive : ""}`}
              onClick={() => chooseFilter("unfiled")}
            >
              <FileText size={16} />
              Unfiled
            </button>
          </div>
          {subjects.length > 0 && (
            <details className={s.subjects}>
              <summary>
                <ChevronRight size={14} />
                Subjects
              </summary>
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  className={`${s.navItem} ${selectedSubject === String(subject.id) ? s.navActive : ""}`}
                  onClick={() => chooseFilter("subject:" + subject.id)}
                >
                  <span className={s.subjectDot} />
                  <span>{subject.name}</span>
                </button>
              ))}
            </details>
          )}
          <div className={s.navFooter}>
            <Cloud size={17} />
            <div>
              <strong>Google Drive</strong>
              <span>
                {snapshot.pending
                  ? "Changes waiting to sync"
                  : "Your connected library"}
              </span>
            </div>
          </div>
        </nav>
        <section
          className={s.mainPane}
          aria-label={documentId ? "Document workspace" : "Document library"}
        >
          <div className={s.libraryHeader}>
            <div className={s.breadcrumb}>
              <button
                className={s.mobileNavToggle}
                aria-label="Open library navigation"
                aria-expanded={navOpen}
                aria-controls="notes-library-navigation"
                onClick={() => setNavOpen(!navOpen)}
              >
                <PanelLeft size={19} />
              </button>
              <span>{documentId ? "Library" : heading}</span>
              {documentId && (
                <>
                  <ChevronRight size={14} />
                  <strong>{titleLabel}</strong>
                </>
              )}
            </div>
            <div className={s.libraryControls}>
              <button
                className={s.iconButton}
                aria-label="Import portable Notes archive"
                title="Import .sylfnote"
                onClick={() => importInput.current?.click()}
                disabled={busy || !snapshot.ready}
              >
                <Upload size={18} />
              </button>
              {note && (
                <>
                  <button
                    className={s.iconButton}
                    aria-label="Document version history"
                    onClick={() => setModal({ type: "history", id: note.id })}
                  >
                    <History size={18} />
                  </button>
                  <button
                    className={s.iconButton}
                    aria-label="Document details"
                    onClick={() => setModal({ type: "manage", id: note.id })}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </>
              )}
              <div className={s.createGroup}>
                <button
                  aria-label="New note"
                  className={s.primary}
                  disabled={busy || !snapshot.ready}
                  onClick={() =>
                    void run(async () => {
                      await leave.current?.();
                      await open(
                        await library.create(
                          "Untitled note",
                          "flow",
                          selectedFolder
                        )
                      );
                    })
                  }
                >
                  <Plus size={17} />
                  <span>New note</span>
                </button>
                <button
                  className={s.createToggle}
                  aria-label="More creation options"
                  aria-expanded={createOpen}
                  onClick={() => setCreateOpen(!createOpen)}
                  disabled={!snapshot.ready}
                >
                  <ChevronDown size={16} />
                </button>
                {createOpen && (
                  <>
                    <button
                      className={s.menuDismiss}
                      aria-label="Close creation menu"
                      onClick={() => setCreateOpen(false)}
                    />
                    <div className={s.createMenu}>
                      <button
                        onClick={() => {
                          setCreateOpen(false);
                          setModal({
                            type: "notebook",
                            parentId: selectedFolder,
                            ink: true,
                          });
                        }}
                      >
                        <BookOpen size={17} />
                        Handwritten notebook
                      </button>
                      <button
                        onClick={() => {
                          setCreateOpen(false);
                          setModal({
                            type: "notebook",
                            parentId: selectedFolder,
                          });
                        }}
                      >
                        <BookOpen size={17} />
                        New notebook
                      </button>
                      <button
                        onClick={() => {
                          setCreateOpen(false);
                          setModal({
                            type: "folder",
                            parentId: selectedFolder,
                          });
                        }}
                      >
                        <Folder size={17} />
                        New folder
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {!snapshot.ready ? (
            <div className={s.empty}>
              <Loader2 size={26} className={s.spin} />
              <h2>Restoring your library</h2>
              <p>
                Notes creation is available after the original cloud library has
                been verified. Existing data is kept.
              </p>
              <button
                className={s.secondary}
                onClick={() => void run(() => library.retrySync())}
              >
                Retry recovery
              </button>
            </div>
          ) : documentId ? (
            note ? (
              note.view.state === "trashed" ? (
                <div className={s.empty}>
                  <Trash2 size={32} />
                  <h2>This note is in Trash</h2>
                  <p>Its content and history are still here.</p>
                  <button
                    className={s.primary}
                    onClick={() =>
                      void run(() =>
                        library.mutate(note.id, () => {}, "restore")
                      )
                    }
                  >
                    <RotateCcw size={17} />
                    Restore note
                  </button>
                  <button
                    className={s.textButton}
                    onClick={() => void run(back)}
                  >
                    Back to library
                  </button>
                </div>
              ) : (
                <>
                  {note.view.state === "conflict" && (
                    <div className={s.notice}>
                      <span>
                        Different versions need review. All text and originals
                        are retained.
                      </span>
                      <button
                        className={s.secondary}
                        onClick={() =>
                          setModal({ type: "conflict", id: note.id })
                        }
                      >
                        Review versions
                      </button>
                    </div>
                  )}
                  {note.view.descriptor.kind === "notebook" && !isInk && (
                    <div className={s.pageTabs} aria-label="Notebook pages">
                      {note.view.descriptor.pages.map((page, index) => (
                        <button
                          key={page.pageId}
                          aria-current={
                            page.pageId ===
                            (resolvedPage ||
                              note.view.descriptor.pages[0]?.pageId)
                              ? "page"
                              : undefined
                          }
                          onClick={() =>
                            void run(() => open(note.id, page.pageId))
                          }
                        >
                          Page {index + 1}
                        </button>
                      ))}
                      <button
                        aria-label="Add notebook page"
                        onClick={() =>
                          void run(async () => {
                            await leave.current?.();
                            await open(note.id, await library.addPage(note.id));
                          })
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                  <Suspense
                    fallback={
                      <p role="status" className={s.loading}>
                        Loading editor…
                      </p>
                    }
                  >
                    {isInk ? (
                      <InkEditor
                        key={`${note.id}:${resolvedPage || "first"}:${editorGeneration}`}
                        library={library}
                        note={note}
                        pageId={resolvedPage}
                        onBack={() => void run(back)}
                        onPage={(page) => void run(() => open(note.id, page))}
                        onError={onError}
                        onState={onState}
                        registerLeave={registerLeave}
                      />
                    ) : (
                      <NotesEditor
                        key={`${note.id}:${resolvedPage || "first"}:${editorGeneration}`}
                        library={library}
                        note={note}
                        pageId={resolvedPage}
                        onBack={() => void run(back)}
                        onError={onError}
                        onState={onState}
                        registerLeave={registerLeave}
                      />
                    )}
                  </Suspense>
                </>
              )
            ) : (
              <div className={s.empty}>
                <FileText size={30} />
                <h2>Document unavailable</h2>
                <p>
                  This link may belong to a different library, or the document
                  may still need recovery.
                </p>
                <button className={s.secondary} onClick={() => void run(back)}>
                  Open library
                </button>
              </div>
            )
          ) : (
            <>
              <div className={s.collectionHeading}>
                <div>
                  <h2>{heading}</h2>
                  <p>
                    {filtered.length} {filtered.length === 1 ? "note" : "notes"}
                    {filter === "trash" ? " · Kept until you restore them" : ""}
                  </p>
                </div>
              </div>
              <div className={s.searchToolbar}>
                <label className={s.search}>
                  <Search size={17} />
                  <input
                    aria-label="Search notes"
                    placeholder="Search your notes…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setLimit(50);
                    }}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Sort notes"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="recent">Last edited</option>
                  <option value="title">Title A–Z</option>
                  <option value="oldest">Oldest first</option>
                </select>
                <div className={s.viewToggle} aria-label="Library view">
                  <button
                    aria-label="Grid view"
                    aria-pressed={grid}
                    onClick={() => setGrid(true)}
                  >
                    <LayoutGrid size={17} />
                  </button>
                  <button
                    aria-label="List view"
                    aria-pressed={!grid}
                    onClick={() => setGrid(false)}
                  >
                    <List size={18} />
                  </button>
                </div>
              </div>
              {query && snapshot.searchIndexed < snapshot.searchTotal && (
                <p className={s.searchProgress} role="status">
                  {snapshot.searchLimited
                    ? "Content search limit reached. Titles remain searchable. Indexed "
                    : "Searching local content… "}{" "}
                  {snapshot.searchIndexed}/{snapshot.searchTotal} notes indexed.
                  Titles are available now.
                </p>
              )}
              <div className={s.collectionScroll}>
                {filtered.length ? (
                  <>
                    <div className={grid ? s.noteGrid : s.noteList}>
                      {filtered.slice(0, limit).map((n) => (
                        <NoteCard
                          key={n.id}
                          note={n}
                          library={library}
                          grid={grid}
                          folder={
                            snapshot.folders.find(
                              (f) => f.id === n.view.descriptor.folderId
                            )?.name
                          }
                          onOpen={() => void run(() => open(n.id))}
                          onFavorite={() =>
                            void run(() =>
                              library.mutate(n.id, (d) => {
                                d.extensions.favorite = !d.extensions.favorite;
                              })
                            )
                          }
                          onMenu={() => setModal({ type: "manage", id: n.id })}
                        />
                      ))}
                    </div>
                    {filtered.length > limit && (
                      <button
                        className={s.loadMore}
                        onClick={() => setLimit((value) => value + 50)}
                      >
                        Show next 50 · {limit} of {filtered.length}
                      </button>
                    )}
                  </>
                ) : (
                  <div className={s.empty}>
                    <div className={s.emptyIcon}>
                      {filter === "trash" ? (
                        <Trash2 size={28} />
                      ) : query ? (
                        <Search size={28} />
                      ) : selectedFolder ? (
                        <Folder size={30} />
                      ) : (
                        <FileText size={29} />
                      )}
                    </div>
                    <h2>
                      {query
                        ? "No notes found"
                        : filter === "trash"
                          ? "Nothing in Trash"
                          : "Make room for your next idea."}
                    </h2>
                    <p>
                      {query
                        ? "Try another title or wait for local content indexing."
                        : filter === "trash"
                          ? "Deleted notes appear here, ready to restore."
                          : "Start with a note, or gather a subject into a notebook."}
                    </p>
                    {!query && filter !== "trash" && (
                      <button
                        className={s.primary}
                        onClick={() =>
                          void run(async () =>
                            open(
                              await library.create(
                                "Untitled note",
                                "flow",
                                selectedFolder
                              )
                            )
                          )
                        }
                      >
                        <Plus size={17} />
                        Create a note
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <input
        ref={importInput}
        className={s.hidden}
        type="file"
        accept=".sylfnote"
        aria-label="Choose a portable Notes archive"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void run(async () => {
            await leave.current?.();
            if (file.size > 256 * 1024 * 1024)
              throw new Error("Choose an archive smaller than 256 MiB.");
            const result = await importNotes(
              library.repository,
              new Uint8Array(await file.arrayBuffer())
            );
            if (result.state === "read-only") throw new Error(result.reason);
            await library.refresh();
          });
        }}
      />
      {modal && (
        <NotesActions
          key={`${modal.type}:${modal.id || "new"}`}
          library={library}
          modal={modal}
          subjects={subjects}
          onClose={() => setModal(undefined)}
          onResolved={() => {
            leave.current = undefined;
            setEditorGeneration((value) => value + 1);
          }}
          onOpen={open}
          onError={onError}
        />
      )}
    </div>
  );
}
function NoteCard({
  note,
  library,
  grid,
  folder,
  onOpen,
  onFavorite,
  onMenu,
}: {
  note: NoteSummary;
  library: NotesLibrary;
  grid: boolean;
  folder?: string;
  onOpen: () => void;
  onFavorite: () => void;
  onMenu: () => void;
}) {
  const descriptor = note.view.descriptor,
    notebook = descriptor.kind === "notebook",
    inkPage = descriptor.pages.find(
      (p) =>
        !p.extensions.archived &&
        descriptor.streams.some(
          (s) => s.streamId === p.streamId && s.adapter === "sylf-ink/1"
        )
    );
  return (
    <article className={s.noteCard} data-grid={grid}>
      <button
        className={s.cardOpen}
        onClick={onOpen}
        aria-label={`Open ${descriptor.title}`}
      >
        <div
          className={`${s.documentPreview} ${notebook ? s.notebookPreview : ""}`}
          aria-hidden="true"
        >
          {inkPage ? (
            <Suspense fallback={<BookOpen size={29} />}>
              <InkThumbnail
                library={library}
                note={note}
                pageId={inkPage.pageId}
              />
            </Suspense>
          ) : notebook ? (
            <BookOpen size={29} />
          ) : (
            <>
              <span className={s.previewHeading}>{descriptor.title}</span>
              {note.preview ? (
                <p>{note.preview}</p>
              ) : (
                <div className={s.previewLines}>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </>
          )}
        </div>
        <div className={s.cardText}>
          <h3>{descriptor.title}</h3>
          <p>
            {folder ||
              (notebook
                ? `${descriptor.pages.length} ${descriptor.pages.length === 1 ? "page" : "pages"}`
                : "Note")}
            <span>·</span>
            {new Date(note.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
          {note.view.state === "conflict" && (
            <small>Versions need review</small>
          )}
        </div>
      </button>
      <div className={s.cardActions}>
        <button
          aria-label={`${descriptor.extensions.favorite ? "Unfavorite" : "Favorite"} ${descriptor.title}`}
          aria-pressed={!!descriptor.extensions.favorite}
          onClick={onFavorite}
        >
          <Star
            size={16}
            fill={descriptor.extensions.favorite ? "currentColor" : "none"}
          />
        </button>
        <button aria-label={`Details for ${descriptor.title}`} onClick={onMenu}>
          <MoreHorizontal size={18} />
        </button>
      </div>
    </article>
  );
}
