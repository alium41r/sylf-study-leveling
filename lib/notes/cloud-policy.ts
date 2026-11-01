import { textFragments } from "./text-boxes";
import type { DocumentView } from "./contracts";
import type { NotesRepository } from "./repository";

export const CLOUD_QUIET_MS = 30_000;
export const CLOUD_POLL_MS = 120_000;

/** Native source is inspected conservatively. Unrecognized content is published,
 * never discarded as an empty draft. Previously published notes stay published. */
export async function isLocalDraft(
  repository: NotesRepository,
  view: DocumentView
) {
  const d = view.descriptor;
  if (
    view.state !== "active" ||
    d.extensions.sylfTitleSet ||
    !["", "Untitled note", "Untitled notebook"].includes(d.title.trim()) ||
    d.assets.length ||
    d.kind === "pdf"
  )
    return false;
  for (const stream of d.streams) {
    const loaded = await repository.loadStream(
      d.documentId,
      stream.streamId,
      stream.epoch,
      view.heads
    );
    try {
      if (stream.adapter === "blocknote/0.56.0") {
        const xml = textFragments(loaded.doc).map(fragment => loaded.doc.getXmlFragment(fragment).toString()).join(" ");
        if (
          xml.replace(/<[^>]*>/g, "").trim() ||
          /<(?:image|video|audio|file|table|codeBlock|checkListItem|bulletListItem|numberedListItem)\b/i.test(
            xml
          )
        )
          return false;
      } else if (stream.adapter === "sylf-ink/1") {
        if (
          [...loaded.doc.getMap("ink").values()].some(
            (v) =>
              !v ||
              typeof v !== "object" ||
              (v as { kind?: string }).kind !== "paper"
          )
        )
          return false;
      } else return false;
    } finally {
      loaded.doc.destroy();
    }
  }
  return true;
}

/** Sync readiness has no effect on local transactional acknowledgement. */
export function automaticSyncDue(
  now: number,
  lastEdit: number,
  lastCloud: number,
  pending: boolean
) {
  return (
    now - lastEdit >= CLOUD_QUIET_MS &&
    now - lastCloud >= CLOUD_QUIET_MS &&
    (pending || now - lastCloud >= CLOUD_POLL_MS)
  );
}
