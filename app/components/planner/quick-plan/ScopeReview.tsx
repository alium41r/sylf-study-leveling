"use client";
import { useMemo, useState, type ReactNode } from "react";
import type {
  CandidateCoverage,
  CandidateEvidence,
  ResearchSource,
} from "@/lib/planner/research/contracts";
import ResearchStatusPanel from "./ResearchStatusPanel";
import { sourceTypeIsOfficial, sourceTypeLabel } from "@/lib/planner/research/sources";
import type { ScopeNode } from "@/lib/planner/intake/scope-node";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * Scope review — the hierarchy Sylf found, shown back to the student before it
 * is allowed anywhere near the plan.
 *
 * The one property this surface must never give up is honesty. Every rule below
 * exists so the student is told, in words, what a change will do or did do:
 *
 * - unchecking a container unchecks its descendants, and the checkbox's name
 *   says so *before* the click ("Deselect X and its 3 selected child topics");
 * - a removed row is simply not selected on confirm, never silently deleted;
 * - a rename is carried to the caller as an explicit `renames` map, because a
 *   changed label is a changed unit and the caller maps it into the brief;
 * - provenance is text ("Official source", "2 sources"), never colour alone;
 * - `WEAK` says it was not confirmed against an official source, and
 *   `UNAVAILABLE` renders no tree and nothing clickable that implies a scope
 *   exists.
 */

export interface ScopeConfirmResult {
  /** Every checked (and not removed) node id — containers and topics alike. */
  nodeIds: string[];
  /** Existing nodes whose label the student edited, keeping their identity. */
  renames: { nodeId: string; label: string }[];
  /**
   * Units the student added while reviewing.
   *
   * Separate from `nodeIds` because the server must be able to tell a unit the source
   * listed from one a person typed: the first may cite a source, the second may not,
   * and an id the candidate never contained is refused rather than silently confirmed.
   */
  additions: ScopeNode[];
}

export interface ScopeReviewProps {
  /** The candidate hierarchy, exactly as stored. Never mutated by this component. */
  nodes: ScopeNode[];
  sources: ResearchSource[];
  /** Honest one-line summary from the candidate. */
  summary: string;
  /** Bounded open questions, shown as caveats. */
  openQuestions: string[];
  /** True when the source extraction was partial: show what was and was not read. */
  partial?: boolean;
  partialReason?: string | null;
  /** Pages read, when the candidate came from a document. */
  pages?: { from: number; to: number }[];
  status: "OK" | "WEAK" | "UNAVAILABLE";
  /** Objective coverage, when the run computed any. Absent for a paste or an upload. */
  coverage?: CandidateCoverage;
  /** Verified evidence, when the run produced any. */
  evidence?: CandidateEvidence;
  busy?: boolean;
  /** The student's decisions, sent to confirmScope. */
  onConfirm: (result: ScopeConfirmResult) => void;
  /** Discard the candidate and keep whatever scope they had. */
  onDiscard: () => void;
  /** When provided, the marker hands the source ids to the caller instead of
   *  revealing the supporting rows inline. */
  onShowSources?: (sourceIds: string[]) => void;
}

/** A row in the working tree: the stored node plus purely local UI state. */
interface Row {
  nodeId: string;
  label: string;
  kind: ScopeNode["kind"];
  parentId: string | null;
  selected: boolean;
  sourceIds: string[];
  /** True for rows the student added with "Add a topic". */
  local: boolean;
  /** The label as stored, so a rename can be detected against it. */
  originalLabel: string;
  /** Removed rows are unselected and hidden, never shown as a separate pile. */
  hidden: boolean;
}

const toRow = (node: ScopeNode): Row => ({
  nodeId: node.nodeId,
  label: node.label,
  kind: node.kind,
  parentId: node.parentId,
  selected: node.selected,
  sourceIds: node.sourceIds ?? [],
  local: false,
  originalLabel: node.label,
  hidden: false,
});

/**
 * Reason codes a partial import can carry, in words. Kept local on purpose: the
 * import module is still being written, so the full closed list is not settled;
 * the caller can swap this for the shared one later without touching rendering.
 */
const PARTIAL_REASON_PHRASES: Record<string, string> = {
  NO_TEXT_LAYER: "This file has no readable text layer (it may be a scan).",
  SCANNED_PAGES: "Some pages were scanned images and could not be read as text.",
  UNSUPPORTED_OBJECTS: "Some pages held objects Sylf could not read.",
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** All descendants of `rootId`, in depth-first order, for the cascade rule. */
function descendantIdsOf(rows: readonly Row[], rootId: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const row of rows) {
      if (row.parentId === parentId) {
        out.push(row.nodeId);
        walk(row.nodeId);
      }
    }
  };
  walk(rootId);
  return out;
}

/** Selected descendant topics — the units the student is about to lose. */
function selectedDescendantTopics(rows: readonly Row[], rootId: string): number {
  const ids = new Set(descendantIdsOf(rows, rootId));
  return rows.filter((row) => ids.has(row.nodeId) && row.kind === "TOPIC" && row.selected).length;
}

/** The word a container's children are (section → chapters, chapter → topics). */
function childNoun(row: Row): string {
  if (row.kind === "SECTION") return "chapter";
  if (row.kind === "CHAPTER") return "topic";
  return "item";
}

export default function ScopeReview({
  nodes,
  sources,
  summary,
  openQuestions,
  partial = false,
  partialReason = null,
  pages,
  status,
  busy = false,
  onConfirm,
  onDiscard,
  onShowSources,
  coverage,
  evidence,
}: ScopeReviewProps) {
  const [working, setWorking] = useState<Row[]>(() => nodes.map(toRow));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [newTopic, setNewTopic] = useState("");

  const byId = useMemo(() => new Map(working.map((row) => [row.nodeId, row])), [working]);

  const toggle = (nodeId: string) => {
    setWorking((prev) => {
      const node = prev.find((row) => row.nodeId === nodeId);
      if (!node) return prev;
      const nextSelected = !node.selected;
      // Checking a container selects only it; unchecking cascades down, because
      // leaving selected topics under an unselected chapter would plan units the
      // student just removed — and the row's name already warned them.
      const affected = nextSelected ? new Set([nodeId]) : new Set(descendantIdsOf(prev, nodeId).concat(nodeId));
      return prev.map((row) => (affected.has(row.nodeId) ? { ...row, selected: nextSelected } : row));
    });
  };

  const remove = (nodeId: string) => {
    // "Remove" means "do not plan this", not "delete from the candidate": the row
    // is hidden and unselected, so it is simply absent from the confirm payload.
    setWorking((prev) => prev.map((row) => (row.nodeId === nodeId ? { ...row, selected: false, hidden: true } : row)));
  };

  const rename = (nodeId: string, label: string) => {
    setWorking((prev) => prev.map((row) => (row.nodeId === nodeId ? { ...row, label } : row)));
  };

  const slug = (label: string): string =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "topic";

  const addTopic = () => {
    const label = newTopic.trim();
    if (!label) return;
    // Deterministic, locally scoped id; the caller maps it into the brief. Claim
    // it once so a duplicate slug can never produce a duplicate node id.
    const base = `local-${slug(label)}`;
    let candidate = base;
    let bump = 2;
    const claimed = new Set(working.map((row) => row.nodeId));
    while (claimed.has(candidate)) {
      candidate = `${base}-${bump}`;
      bump += 1;
    }
    setWorking((prev) => [
      ...prev,
      {
        nodeId: candidate,
        label,
        kind: "TOPIC",
        parentId: null,
        selected: true,
        sourceIds: [],
        local: true,
        originalLabel: label,
        hidden: false,
      },
    ]);
    setNewTopic("");
  };

  const confirm = () => {
    const chosen = working.filter((row) => row.selected && !row.hidden);
    onConfirm({
      nodeIds: chosen.filter((row) => !row.local).map((row) => row.nodeId),
      renames: chosen
        .filter((row) => !row.local && row.originalLabel !== row.label)
        .map((row) => ({ nodeId: row.nodeId, label: row.label })),
      additions: chosen
        .filter((row) => row.local)
        .map((row) => ({
          nodeId: row.nodeId,
          label: row.label,
          kind: row.kind,
          parentId: row.parentId,
          selected: true,
        })),
    });
  };

  // ── Counts (topics are the units the engine plans; sections are reported
  //     separately, never folded into the topic number) ──────────────────────
  const topics = working.filter((row) => row.kind === "TOPIC" && !row.hidden);
  const sections = working.filter((row) => row.kind === "SECTION" && !row.hidden);
  const selectedTopics = topics.filter((row) => row.selected).length;
  const selectedSections = sections.filter((row) => row.selected).length;

  // ── Search/filter: a row is visible when it matches, or when it is an
  //     ancestor of a match — a topic with no visible parent is confusing. ──
  const showFilter = nodes.length > 20;
  const q = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    const vis = new Set<string>();
    if (!q) {
      for (const row of working) vis.add(row.nodeId);
      return vis;
    }
    for (const row of working) {
      if (row.hidden) continue;
      if (row.label.toLowerCase().includes(q)) {
        vis.add(row.nodeId);
        let parentId = row.parentId;
        while (parentId) {
          vis.add(parentId);
          parentId = byId.get(parentId)?.parentId ?? null;
        }
      }
    }
    return vis;
  }, [q, working, byId]);
  const matchingTopics = topics.filter((row) => visibleIds.has(row.nodeId) && row.label.toLowerCase().includes(q)).length;

  const statusText = [
    `${selectedTopics} of ${topics.length} ${topics.length === 1 ? "topic" : "topics"} selected`,
    sections.length > 0 ? `${selectedSections} of ${sections.length} ${sections.length === 1 ? "section" : "sections"}` : null,
    q ? `${matchingTopics} ${matchingTopics === 1 ? "topic" : "topics"} match your search` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const sourcesFor = (row: Row): ResearchSource[] =>
    row.sourceIds.map((id) => sources.find((src) => src.sourceId === id)).filter((src): src is ResearchSource => src != null);

  const checkName = (row: Row): string => {
    const action = row.selected ? "Deselect" : "Select";
    if (row.kind !== "TOPIC" && row.selected) {
      const lost = selectedDescendantTopics(working, row.nodeId);
      if (lost > 0) return `${action} ${row.label} and its ${plural(lost, "selected child topic")}`;
    }
    return `${action} ${row.label}`;
  };

  const toggleSources = (row: Row) => {
    if (onShowSources) {
      onShowSources(row.sourceIds);
      return;
    }
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(row.nodeId)) next.delete(row.nodeId);
      else next.add(row.nodeId);
      return next;
    });
  };

  const renderNode = (row: Row): ReactNode => {
    const children = working.filter(
      (child) => child.parentId === row.nodeId && !child.hidden && visibleIds.has(child.nodeId)
    );
    const hasChildren = children.length > 0;
    const srcs = sourcesFor(row);
    const showMarker = row.kind !== "TOPIC" && srcs.length > 0;
    const markerText =
      srcs.length === 1 && srcs.some((src) => sourceTypeIsOfficial(src.sourceType))
        ? "Official source"
        : plural(srcs.length, "source");
    // The disclosure's accessible name. Stated explicitly on the <details> (as
    // well as in the <summary>) because jsdom does not derive a <details> name
    // from its <summary>, and the surface must be reachable by name in a test.
    const disclosureName = hasChildren
      ? `${children.length} ${childNoun(row)}${children.length === 1 ? "" : "s"} under ${row.label}`
      : "";

    return (
      <li key={row.nodeId} className={s.scopeNode}>
        <div className={s.scopeRow}>
          <label className={`${base.check} ${s.scopeCheck}`}>
            <input type="checkbox" checked={row.selected} disabled={busy} onChange={() => toggle(row.nodeId)} aria-label={checkName(row)} />
            <span className={s.nodeLabel}>{row.label}</span>
          </label>
          <span className={s.scopeActions}>
            {showMarker && (
              <button
                type="button"
                className={s.sourceMarker}
                disabled={busy}
                aria-expanded={expandedSources.has(row.nodeId)}
                onClick={() => toggleSources(row)}
              >
                {markerText}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setRenaming(renaming === row.nodeId ? null : row.nodeId)}>
              Rename {row.label}
            </button>
            <button type="button" disabled={busy} onClick={() => remove(row.nodeId)}>
              Remove {row.label}
            </button>
          </span>
        </div>

        {renaming === row.nodeId && (
          <div className={s.renameRow}>
            <label>
              <span>Rename {row.originalLabel}</span>
              <input
                type="text"
                value={row.label}
                maxLength={200}
                disabled={busy}
                onChange={(event) => rename(row.nodeId, event.target.value)}
              />
            </label>
          </div>
        )}

        {expandedSources.has(row.nodeId) && srcs.length > 0 && (
          <ul className={s.inlineSources} aria-label={`Sources for ${row.label}`}>
            {srcs.map((src) => (
              <li key={src.sourceId} className={s.inlineSource}>
                {sourceTypeLabel(src.sourceType)}: {src.title ?? src.publisherOrDomain ?? src.url}
              </li>
            ))}
          </ul>
        )}

        {hasChildren && (
          <details className={s.disclosure} open aria-label={disclosureName}>
            <summary>{disclosureName}</summary>
            <ul className={s.scopeChildren}>{children.map(renderNode)}</ul>
          </details>
        )}
      </li>
    );
  };

  const visibleRoots = working.filter((row) => row.parentId === null && !row.hidden && visibleIds.has(row.nodeId));

  if (status === "UNAVAILABLE") {
    // No tree, and nothing clickable that implies a scope exists: the caller owns
    // the fallbacks. Only the honest summary and the open questions are shown.
    return (
      <div className={s.field}>
        <p>{summary}</p>
        {/*
          A candidate with no units still has a coverage story — usually "nothing was answered" —
          and that is exactly the case where a student most needs to see it rather than a bare
          summary sentence.
        */}
        {coverage && (
          // This branch only renders when the status is UNAVAILABLE, so the run answered nothing
          // useful by definition and the panel says so.
          <ResearchStatusPanel coverage={coverage} evidence={evidence} sources={sources} weak />
        )}
        {openQuestions.length > 0 && (
          <ul className={s.openQuestions} aria-label="Open questions">
            {openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className={s.hint}>{summary}</p>

      {/*
        Coverage sits directly under the summary because it is the same kind of statement — what
        happened — told with the precision the pipeline actually has. It is placed before the tree
        so a student reads how complete the scope is before reading the scope.
      */}
      {coverage && (
        <ResearchStatusPanel
          coverage={coverage}
          evidence={evidence}
          sources={sources}
          weak={status !== "OK"}
        />
      )}

      {partial && (
        <div className={s.banner}>
          <p>
            {pages && pages.length > 0 ? (
              <>
                Pages read: {pages.map((range) => (range.from === range.to ? String(range.from) : `${range.from}–${range.to}`)).join(", ")}.{" "}
              </>
            ) : null}
            Some content may be missing.
          </p>
          {partialReason && <p>{PARTIAL_REASON_PHRASES[partialReason] ?? partialReason}</p>}
        </div>
      )}

      {status === "WEAK" && (
        <div className={`${s.banner} ${s.bannerWarn}`}>
          <p>This scope was not found on an official source, so Sylf cannot guarantee it is complete or current.</p>
        </div>
      )}

      {openQuestions.length > 0 && (
        <>
          <p className={s.hint}>A few things are still open — worth a look before you confirm.</p>
          <ul className={s.openQuestions} aria-label="Open questions">
            {openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      )}

      {showFilter && (
        <div className={s.filterRow}>
          <label htmlFor="scope-review-filter">
            <span>Filter scope</span>
            <input
              id="scope-review-filter"
              type="search"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      )}

      <ul className={s.scopeTree} aria-label="Scope review">
        {visibleRoots.map(renderNode)}
      </ul>

      <div className={s.addRow}>
        <label htmlFor="scope-review-add-topic">
          <span>Add a topic</span>
          <input
            id="scope-review-add-topic"
            type="text"
            value={newTopic}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setNewTopic(event.target.value)}
          />
        </label>
        <button type="button" disabled={busy || !newTopic.trim()} onClick={addTopic}>
          Add
        </button>
      </div>

      <p className={s.hint} role="status" aria-live="polite">
        {statusText}
      </p>

      <div className={base.actions}>
        <button
          type="button"
          className={base.primary}
          disabled={busy}
          onClick={confirm}
          aria-label="Use these units"
        >
          Use these units
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          aria-label="Add your own units instead"
        >
          Add your own units instead
        </button>
      </div>
    </div>
  );
}
