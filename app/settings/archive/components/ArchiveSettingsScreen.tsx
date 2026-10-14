"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Feather,
  Hourglass,
  Search,
  Sparkles,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import BackToSettings from "@/app/components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import {
  ARCHIVE_ENTRIES,
  type ArchiveCategory,
  type ArchiveEntry,
  type ContentBlock,
} from "@/lib/archive-catalog";
import { useSystemAppearance } from "../../components/useSystemAppearance";
import styles from "./ArchiveSettingsScreen.module.css";

const CHAPTERS: {
  name: ArchiveCategory;
  numeral: string;
  icon: LucideIcon;
  note: string;
}[] = [
  {
    name: "Progression",
    numeral: "I",
    icon: Compass,
    note: "Every journey begins with understanding your own potential.",
  },
  {
    name: "Focus & Study",
    numeral: "II",
    icon: Hourglass,
    note: "Make room for quiet effort, steady rhythms, and time to recover.",
  },
  {
    name: "Quests & AI",
    numeral: "III",
    icon: Sparkles,
    note: "Give your ambition a direction, one meaningful task at a time.",
  },
  {
    name: "Economy & Shop",
    numeral: "IV",
    icon: Bookmark,
    note: "The rewards of your effort, and the tools for the road ahead.",
  },
  {
    name: "Customization",
    numeral: "V",
    icon: Feather,
    note: "Shape a world that feels like yours.",
  },
  {
    name: "Social & Network",
    numeral: "VI",
    icon: Users,
    note: "A personal journey can still be a shared one.",
  },
  {
    name: "Achievements",
    numeral: "VII",
    icon: Trophy,
    note: "A record of the small beginnings and remarkable milestones.",
  },
];

function parseStoredIds(snapshot: string): string[] {
  try {
    const value: unknown = JSON.parse(snapshot);
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is string =>
                typeof id === "string" &&
                ARCHIVE_ENTRIES.some((entry) => entry.id === id)
            )
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

const STORAGE_EVENT = "sylf-archive-storage";
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

// A server snapshot keeps hydration consistent; memory supports browsers that block storage.
function useStoredIds(key: string) {
  const memory = useRef<string | null>(null);
  const getSnapshot = useCallback(() => {
    if (memory.current !== null) return memory.current;
    try {
      return localStorage.getItem(key) || "[]";
    } catch {
      return "[]";
    }
  }, [key]);
  const snapshot = useSyncExternalStore(
    subscribeToStorage,
    getSnapshot,
    () => "[]"
  );
  const ids = useMemo(() => parseStoredIds(snapshot), [snapshot]);
  const updateIds = useCallback(
    (update: (previous: string[]) => string[]) => {
      const next = JSON.stringify(update(parseStoredIds(getSnapshot())));
      if (next === getSnapshot()) return;
      try {
        localStorage.setItem(key, next);
        memory.current = null;
      } catch {
        memory.current = next;
      }
      window.dispatchEvent(new Event(STORAGE_EVENT));
    },
    [getSnapshot, key]
  );

  useEffect(() => {
    updateIds((previous) => previous);
  }, [updateIds]);
  return [ids, updateIds] as const;
}

export function ArchiveSettingsScreen() {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState("sys_leveling");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, updateFavorites] = useStoredIds("archive_favorites");
  const [recents, updateRecents] = useStoredIds("archive_recents");
  const [indexView, setIndexView] = useState<"contents" | "bookmarks">(
    "contents"
  );
  const [contentsOpen, setContentsOpen] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<ArchiveCategory[]>(
    []
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const archiveRef = useRef<HTMLDivElement>(null);
  const contentsButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterTurn = useRef(false);

  useSystemAppearance(archiveRef);

  const authenticated = Boolean(user);
  useEffect(() => {
    if (authenticated)
      updateRecents((previous) =>
        [activeId, ...previous.filter((id) => id !== activeId)].slice(0, 5)
      );
  }, [activeId, authenticated, updateRecents]);

  useEffect(() => {
    if (contentsOpen) searchRef.current?.focus();
  }, [contentsOpen]);

  useEffect(() => {
    if (!focusAfterTurn.current) return;
    focusAfterTurn.current = false;
    titleRef.current?.focus({ preventScroll: true });
    bookRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [activeId]);

  const activeIndex = Math.max(
    0,
    ARCHIVE_ENTRIES.findIndex((entry) => entry.id === activeId)
  );
  const activeEntry = ARCHIVE_ENTRIES[activeIndex];
  const chapterIndex = CHAPTERS.findIndex(
    (chapter) => chapter.name === activeEntry.categoryId
  );
  const chapter = CHAPTERS[chapterIndex];
  const ChapterIcon = chapter.icon;
  const chapterEntries = ARCHIVE_ENTRIES.filter(
    (entry) => entry.categoryId === chapter.name
  );
  const chapterEntryIndex = chapterEntries.findIndex(
    (entry) => entry.id === activeId
  );
  const isBookmarked = favorites.includes(activeId);
  const query = searchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(
    () =>
      ARCHIVE_ENTRIES.filter((entry) => {
        if (indexView === "bookmarks" && !favorites.includes(entry.id))
          return false;
        return (
          !query ||
          entry.title.toLowerCase().includes(query) ||
          entry.categoryId.toLowerCase().includes(query) ||
          entry.content.some((block) =>
            block.type === "list"
              ? block.items.some((item) => item.toLowerCase().includes(query))
              : block.text.toLowerCase().includes(query)
          )
        );
      }),
    [query, indexView, favorites]
  );

  const firstHeading = activeEntry.content.findIndex(
    (block) => block.type === "h3"
  );
  const splitAt =
    firstHeading > 0
      ? firstHeading
      : Math.max(1, Math.ceil(activeEntry.content.length / 2));
  const introduction = activeEntry.content.slice(0, splitAt);
  const notes = activeEntry.content.slice(splitAt);
  const wordCount = activeEntry.content.reduce(
    (count, block) =>
      count +
      (block.type === "list" ? block.items.join(" ") : block.text).split(/\s+/)
        .length,
    0
  );
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 180));
  const previousEntry = ARCHIVE_ENTRIES[activeIndex - 1];
  const nextEntry = ARCHIVE_ENTRIES[activeIndex + 1];

  function selectEntry(id: string) {
    const entry = ARCHIVE_ENTRIES.find((item) => item.id === id);
    if (!entry) return;
    setContentsOpen(false);
    setCollapsedChapters((previous) =>
      previous.filter((name) => name !== entry.categoryId)
    );
    if (id === activeId) {
      titleRef.current?.focus({ preventScroll: true });
      bookRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      return;
    }
    focusAfterTurn.current = true;
    setActiveId(id);
  }

  function toggleBookmark() {
    updateFavorites((previous) =>
      previous.includes(activeId)
        ? previous.filter((id) => id !== activeId)
        : [...previous, activeId]
    );
  }

  function closeContents() {
    setContentsOpen(false);
    contentsButtonRef.current?.focus();
  }

  return (
    <div className={styles.archive} ref={archiveRef}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.workspace}>
        <div className={styles.backLink}>
          <BackToSettings />
        </div>
        <header className={styles.masthead}>
          <div className={styles.brand}>
            <CodexSeal className={styles.brandSeal} />
            <div>
              <p className={styles.eyebrow}>System Hub / The Sylf Library</p>
              <h1>
                Sylf <span>Codex</span>
              </h1>
            </div>
          </div>
          <p className={styles.mastheadNote}>
            A field guide to your world.
            <span>
              {CHAPTERS.length} chapters <i aria-hidden="true">·</i>{" "}
              {ARCHIVE_ENTRIES.length} entries
            </span>
          </p>
        </header>

        {!user ? (
          <div className={styles.loading} role="status">
            <BookOpen size={28} aria-hidden="true" />
            <p>Opening the library…</p>
          </div>
        ) : (
          <div className={styles.library}>
            <aside
              className={`${styles.index} ${contentsOpen ? styles.indexOpen : ""}`}
              id="codex-contents"
              aria-label="Codex index"
              onKeyDown={(event) => {
                if (event.key === "Escape" && contentsOpen) {
                  event.preventDefault();
                  closeContents();
                }
              }}
            >
              <div className={styles.indexHeading}>
                <span>Library index</span>
                <button
                  type="button"
                  onClick={closeContents}
                  className={styles.closeIndex}
                  aria-label="Close contents"
                >
                  <X size={18} />
                </button>
              </div>
              <div className={styles.searchBox}>
                <Search size={16} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  aria-label="Search the codex"
                  placeholder="Search the codex…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div
                className={styles.indexViews}
                role="group"
                aria-label="Index view"
              >
                <button
                  type="button"
                  aria-pressed={indexView === "contents"}
                  onClick={() => setIndexView("contents")}
                >
                  Contents
                </button>
                <button
                  type="button"
                  aria-pressed={indexView === "bookmarks"}
                  onClick={() => setIndexView("bookmarks")}
                >
                  <Bookmark size={12} aria-hidden="true" />
                  Saved <span>{favorites.length}</span>
                </button>
              </div>
              <nav
                className={styles.indexNavigation}
                aria-label="Archive entries"
              >
                {query || indexView === "bookmarks" ? (
                  <div className={styles.filteredList}>
                    <p className={styles.resultCount} role="status">
                      {filteredEntries.length} {query ? "matching" : "saved"}{" "}
                      {filteredEntries.length === 1 ? "entry" : "entries"}
                    </p>
                    {filteredEntries.map((entry) => (
                      <IndexEntry
                        key={entry.id}
                        entry={entry}
                        active={activeId === entry.id}
                        bookmarked={favorites.includes(entry.id)}
                        onSelect={selectEntry}
                      />
                    ))}
                    {filteredEntries.length === 0 && (
                      <div className={styles.emptyIndex}>
                        <BookOpen size={25} aria-hidden="true" />
                        <p>
                          {query
                            ? "No entries found."
                            : "Keep a page for later."}
                        </p>
                        <span>
                          {query
                            ? "Try a different word or chapter."
                            : "Use the ribbon on any entry to save it here."}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  CHAPTERS.map((item) => {
                    const entries = ARCHIVE_ENTRIES.filter(
                      (entry) => entry.categoryId === item.name
                    );
                    const collapsed = collapsedChapters.includes(item.name);
                    return (
                      <section className={styles.indexChapter} key={item.name}>
                        <button
                          type="button"
                          className={styles.chapterHeading}
                          aria-expanded={!collapsed}
                          aria-controls={`chapter-${item.numeral}`}
                          onClick={() =>
                            setCollapsedChapters((previous) =>
                              collapsed
                                ? previous.filter((name) => name !== item.name)
                                : [...previous, item.name]
                            )
                          }
                        >
                          <span
                            className={styles.chapterNumeral}
                            aria-hidden="true"
                          >
                            {item.numeral}
                          </span>
                          <span>{item.name}</span>
                          <ChevronDown
                            size={13}
                            className={collapsed ? styles.chevronClosed : ""}
                            aria-hidden="true"
                          />
                        </button>
                        <div id={`chapter-${item.numeral}`} hidden={collapsed}>
                          {entries.map((entry) => (
                            <IndexEntry
                              key={entry.id}
                              entry={entry}
                              active={activeId === entry.id}
                              bookmarked={favorites.includes(entry.id)}
                              onSelect={selectEntry}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })
                )}
              </nav>
              {!query &&
                indexView === "contents" &&
                recents.some((id) => id !== activeId) && (
                  <div className={styles.recentEntries}>
                    <p>Recently read</p>
                    {recents
                      .filter((id) => id !== activeId)
                      .slice(0, 2)
                      .map((id) => (
                        <button
                          type="button"
                          key={id}
                          onClick={() => selectEntry(id)}
                        >
                          {
                            ARCHIVE_ENTRIES.find((entry) => entry.id === id)
                              ?.title
                          }
                          <ArrowRight size={12} aria-hidden="true" />
                        </button>
                      ))}
                  </div>
                )}
              <div className={styles.indexColophon}>
                <Feather size={15} aria-hidden="true" />
                <span>For the curious scholar.</span>
              </div>
            </aside>

            <section className={styles.readingDesk} aria-label="Codex reader">
              <div className={styles.readerToolbar}>
                <button
                  type="button"
                  ref={contentsButtonRef}
                  className={styles.contentsToggle}
                  aria-expanded={contentsOpen}
                  aria-controls="codex-contents"
                  onClick={() =>
                    contentsOpen ? closeContents() : setContentsOpen(true)
                  }
                >
                  <BookOpen size={16} aria-hidden="true" />
                  <span>Contents</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                <div className={styles.breadcrumb}>
                  <span>Chapter {chapter.numeral}</span>
                  <span aria-hidden="true">/</span>
                  <span>{chapter.name}</span>
                </div>
                <span className={styles.readingTime}>
                  {readingMinutes} min read
                </span>
              </div>

              <div className={styles.bookFrame} ref={bookRef}>
                <nav
                  className={styles.chapterTabs}
                  aria-label="Jump to chapter"
                >
                  {CHAPTERS.map((item) => (
                    <button
                      type="button"
                      key={item.name}
                      aria-label={`Chapter ${item.numeral}: ${item.name}`}
                      aria-current={
                        chapter.name === item.name ? "true" : undefined
                      }
                      title={item.name}
                      onClick={() =>
                        selectEntry(
                          ARCHIVE_ENTRIES.find(
                            (entry) => entry.categoryId === item.name
                          )!.id
                        )
                      }
                    >
                      {item.numeral}
                    </button>
                  ))}
                </nav>
                <article
                  className={styles.book}
                  aria-labelledby="codex-entry-title"
                >
                  <div className={styles.spread} key={activeId}>
                    <section
                      className={`${styles.paperPage} ${styles.titlePage}`}
                      aria-label="Introduction"
                    >
                      <span className={styles.cornerTop} aria-hidden="true" />
                      <span
                        className={styles.cornerBottom}
                        aria-hidden="true"
                      />
                      <div className={styles.runningHead}>
                        <span>Sylf</span>
                        <span>
                          Archive / {String(activeIndex + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className={styles.titleBlock}>
                        <div className={styles.chapterMark}>
                          <ChapterIcon
                            size={25}
                            strokeWidth={1.2}
                            aria-hidden="true"
                          />
                        </div>
                        <p className={styles.chapterLabel}>
                          Chapter {chapter.numeral}{" "}
                          <span aria-hidden="true">·</span> {chapter.name}
                        </p>
                        <h2 id="codex-entry-title" ref={titleRef} tabIndex={-1}>
                          {activeEntry.title}
                        </h2>
                        <Ornament />
                      </div>
                      <div className={`${styles.prose} ${styles.introduction}`}>
                        <ContentBlocks blocks={introduction} />
                      </div>
                      <div className={styles.chapterNote}>
                        <Feather
                          size={19}
                          strokeWidth={1.2}
                          aria-hidden="true"
                        />
                        <p>{chapter.note}</p>
                      </div>
                      <Folio number={activeIndex * 2 + 1} />
                    </section>
                    <section
                      className={`${styles.paperPage} ${styles.notesPage}`}
                      aria-label="Guide notes"
                    >
                      <span className={styles.cornerTop} aria-hidden="true" />
                      <span
                        className={styles.cornerBottom}
                        aria-hidden="true"
                      />
                      <div className={styles.runningHead}>
                        <span>{chapter.name}</span>
                        <span>Field notes</span>
                      </div>
                      <button
                        type="button"
                        className={`${styles.bookmarkRibbon} ${isBookmarked ? styles.ribbonSaved : ""}`}
                        aria-label={
                          isBookmarked
                            ? "Remove bookmark"
                            : "Bookmark this entry"
                        }
                        aria-pressed={isBookmarked}
                        title={
                          isBookmarked
                            ? "Remove bookmark"
                            : "Bookmark this entry"
                        }
                        onClick={toggleBookmark}
                      >
                        <Bookmark
                          size={17}
                          fill={isBookmarked ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      </button>
                      <div className={`${styles.prose} ${styles.notes}`}>
                        <ContentBlocks blocks={notes} />
                      </div>
                      {activeEntry.related.length > 0 && (
                        <div className={styles.relatedReading}>
                          <h3>
                            <BookOpen size={15} aria-hidden="true" />
                            Further reading
                          </h3>
                          {activeEntry.related.map((id) => {
                            const entry = ARCHIVE_ENTRIES.find(
                              (item) => item.id === id
                            );
                            return entry ? (
                              <button
                                type="button"
                                key={id}
                                onClick={() => selectEntry(id)}
                              >
                                <span>{entry.title}</span>
                                <span className={styles.relatedPage}>
                                  p. {ARCHIVE_ENTRIES.indexOf(entry) * 2 + 1}
                                  <ArrowRight size={12} aria-hidden="true" />
                                </span>
                              </button>
                            ) : null;
                          })}
                        </div>
                      )}
                      <div className={styles.entryEnd}>
                        <span aria-hidden="true">✦</span>
                        <span>
                          Entry {chapterEntryIndex + 1} of{" "}
                          {chapterEntries.length} in this chapter
                        </span>
                        {isBookmarked && (
                          <span className={styles.savedNote}>
                            <Check size={12} aria-hidden="true" />
                            Saved
                          </span>
                        )}
                      </div>
                      <Folio number={activeIndex * 2 + 2} />
                    </section>
                  </div>
                  <footer className={styles.pageTurns}>
                    <button
                      type="button"
                      disabled={!previousEntry}
                      aria-label={
                        previousEntry
                          ? `Previous entry: ${previousEntry.title}`
                          : "Previous entry"
                      }
                      onClick={() =>
                        previousEntry && selectEntry(previousEntry.id)
                      }
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      <span>
                        <small>Previous entry</small>
                        <span>
                          {previousEntry?.title || "Beginning of the codex"}
                        </span>
                      </span>
                    </button>
                    <span className={styles.position}>
                      {String(activeIndex + 1).padStart(2, "0")}{" "}
                      <i aria-hidden="true">/</i> {ARCHIVE_ENTRIES.length}
                    </span>
                    <button
                      type="button"
                      disabled={!nextEntry}
                      aria-label={
                        nextEntry
                          ? `Next entry: ${nextEntry.title}`
                          : "Next entry"
                      }
                      onClick={() => nextEntry && selectEntry(nextEntry.id)}
                    >
                      <span>
                        <small>Next entry</small>
                        <span>{nextEntry?.title || "End of the codex"}</span>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </footer>
                </article>
              </div>
              <p className={styles.deskColophon}>
                <span aria-hidden="true">✦</span> A little knowledge for the
                journey ahead <span aria-hidden="true">✦</span>
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function IndexEntry({
  entry,
  active,
  bookmarked,
  onSelect,
}: {
  entry: ArchiveEntry;
  active: boolean;
  bookmarked: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.indexEntry} ${active ? styles.activeEntry : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(entry.id)}
    >
      <span className={styles.entryNumber} aria-hidden="true">
        {String(ARCHIVE_ENTRIES.indexOf(entry) + 1).padStart(2, "0")}
      </span>
      <span>{entry.title}</span>
      {bookmarked && (
        <Bookmark size={11} fill="currentColor" aria-label="Bookmarked" />
      )}
    </button>
  );
}

function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "h3") return <h3 key={index}>{block.text}</h3>;
        if (block.type === "p") return <p key={index}>{block.text}</p>;
        return (
          <ul key={index}>
            {block.items.map((item, itemIndex) => {
              const colon = item.indexOf(":");
              return (
                <li key={itemIndex}>
                  {colon > 0 && colon < 50 ? (
                    <>
                      <strong>{item.slice(0, colon)}</strong>
                      {item.slice(colon)}
                    </>
                  ) : (
                    item
                  )}
                </li>
              );
            })}
          </ul>
        );
      })}
    </>
  );
}

function Ornament() {
  return (
    <div className={styles.ornament} aria-hidden="true">
      <span />✦<span />
    </div>
  );
}
function Folio({ number }: { number: number }) {
  return (
    <div className={styles.folio} aria-label={`Page ${number}`}>
      <span aria-hidden="true" />
      {String(number).padStart(2, "0")}
      <span aria-hidden="true" />
    </div>
  );
}
function CodexSeal({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="40"
        cy="40"
        r="29"
        stroke="currentColor"
        strokeWidth=".6"
        opacity=".35"
      />
      <circle
        cx="40"
        cy="40"
        r="23"
        stroke="currentColor"
        strokeWidth=".6"
        opacity=".2"
      />
      <path
        d="m40 3 6 28 22-19-19 22 28 6-28 6 19 22-22-19-6 28-6-28-22 19 19-22-28-6 28-6-19-22 22 19Z"
        fill="currentColor"
        opacity=".14"
        stroke="currentColor"
        strokeWidth=".9"
      />
      <path
        d="m40 12 4 24 24 4-24 4-4 24-4-24-24-4 24-4Z"
        fill="currentColor"
      />
      <circle cx="40" cy="40" r="3" fill="var(--archive-canvas)" />
    </svg>
  );
}

export default ArchiveSettingsScreen;
