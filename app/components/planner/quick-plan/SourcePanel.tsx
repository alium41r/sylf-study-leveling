"use client";
import { useMemo } from "react";
import type { ResearchSource, SourceType } from "@/lib/planner/research/contracts";
import { rankSources, sourceTypeLabel, sourceTypeMeaning } from "@/lib/planner/research/sources";
import { SOURCE_TYPES } from "@/lib/planner/research/contracts";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * Source / provenance panel — the "what Sylf read" list.
 *
 * The honesty rule here is that the distinction between an official and a
 * secondary source is carried by *words*, never colour: every row leads with a
 * plain-text type label ("Official", "Official PDF", "Institutional",
 * "Secondary", "Your upload"), and that label is the whole marker. A user upload
 * is the student's own material, so it is rendered as text with no link — there is
 * no public URL to open, and a link would imply one exists.
 *
 * A legend explains the types actually present, once. Labels alone were not enough:
 * "Institutional" reads as a promotion unless the student is told that it means a
 * credible institution which is *not* the verified authority for this target.
 */

export interface SourcePanelProps {
  sources: ResearchSource[];
  /** Shown when there are no sources at all — the honest "nothing to cite" case. */
  emptyMessage?: string;
  /** Highlight these sources (used when a row's source marker is clicked). */
  highlighted?: string[];
  /** Heading for the disclosure; the comparison panel uses its own wording. */
  heading?: string;
}

const EMPTY_MESSAGE = "No public source was used for this scope.";

/** The date Sylf retrieved the source, in a locale-free form. Falls back to the
 *  stored string when it is not a parseable timestamp, so a bad value is shown
 *  as-is rather than silently dropped. */
function retrievedDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

export default function SourcePanel({
  sources,
  emptyMessage,
  highlighted,
  heading,
}: SourcePanelProps) {
  const ordered = useMemo(() => rankSources(sources), [sources]);
  const highlightSet = useMemo(() => new Set(highlighted ?? []), [highlighted]);
  /** The types present, in the vocabulary's own order, each explained once. */
  const legend = useMemo(() => {
    const present = new Set(ordered.map((source) => source.sourceType));
    return SOURCE_TYPES.filter((type) => present.has(type)) as SourceType[];
  }, [ordered]);

  if (ordered.length === 0) {
    return <p className={base.muted}>{emptyMessage ?? EMPTY_MESSAGE}</p>;
  }

  return (
    <details open={ordered.length <= 3}>
      <summary>
        <strong>
          {heading ? `${heading}: ` : ""}
          {ordered.length} {ordered.length === 1 ? "source" : "sources"}
        </strong>
      </summary>
      <ul className={s.sourceList}>
        {ordered.map((source) => {
          const label = sourceTypeLabel(source.sourceType);
          const title = source.title ?? source.publisherOrDomain ?? source.url;
          const domain = source.publisherOrDomain ?? "";
          const isUpload = source.sourceType === "USER_UPLOAD";
          const isHighlighted = highlightSet.has(source.sourceId);
          const linkName = `${label} source: ${title}${domain ? ` — ${domain}` : ""}`;
          const meta = [domain, `Retrieved ${retrievedDate(source.retrievedAt)}`, source.documentDate ?? null]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={source.sourceId}
              className={isHighlighted ? s.highlighted : undefined}
              aria-current={isHighlighted ? "true" : undefined}
            >
              <span className={s.sourceType}>{label}</span>
              <span className={s.sourceTitle}>
                {isUpload ? (
                  title
                ) : (
                  <a href={source.url} target="_blank" rel="noreferrer noopener" aria-label={linkName}>
                    {title}
                  </a>
                )}
              </span>
              <span className={s.sourceMeta}>{meta}</span>
            </li>
          );
        })}
      </ul>
      <dl className={s.sourceLegend}>
        {legend.map((type) => (
          <div key={type} className={s.sourceLegendRow}>
            <dt>{sourceTypeLabel(type)}</dt>
            <dd>{sourceTypeMeaning(type)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
