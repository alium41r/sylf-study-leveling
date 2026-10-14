/**
 * ============================================================================
 * PIXEL ASSET — ATTACHMENT
 * ============================================================================
 * Places one asset relative to another, entirely in reference space.
 *
 * THE WHOLE MODEL
 *   A host declares named anchors. An attached asset declares a pivot. Placing
 *   the attachment is one subtraction:
 *
 *       offset = host.anchor − attachment.pivot
 *
 *   Both operands are reference coordinates belonging to their own assets, so
 *   nothing here knows about a display, a logical cell, a CSS size or a density.
 *   The caller applies the same reference → logical mapping it would apply to
 *   any asset, which is what keeps attachments density-independent for free.
 *
 * WHY NOT A SOCKET TAXONOMY
 *   The roadmap is explicit: only the anchors the reference assets need, and let
 *   later phases expand from evidence. A universal skeleton guessed now would be
 *   wrong in ways nobody could see until real assets arrived to disagree with it.
 * ============================================================================
 */

import type { PixelAnchor, PixelAsset } from "./types";
import { validateAsset } from "./validate";

/** Why an attachment could not be resolved. Empty means it resolved. */
export interface AttachmentProblem {
  readonly code:
    | "attachment-absent"
    | "host-anchor-unknown"
    | "pivot-unknown"
    | "host-kind-mismatch"
    | "asset-invalid"
    | "grid-larger-than-host";
  readonly message: string;
}

export interface ResolvedAttachment {
  /** Reference-space translation to apply to the attachment's own cells. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** The anchor used on the host, for review tooling to draw. */
  readonly hostAnchor: PixelAnchor;
  /** The pivot used on the attachment, for review tooling to draw. */
  readonly pivot: PixelAnchor;
}

export interface AttachmentResult {
  readonly resolved: ResolvedAttachment | null;
  readonly problems: readonly AttachmentProblem[];
}

/**
 * Resolves where `attachment` sits relative to `host`.
 *
 * Returns problems rather than throwing, because review tooling wants to *show*
 * a broken attachment — a pivot typo is far easier to fix while looking at the
 * two assets side by side than in a stack trace.
 */
export function resolveAttachment(
  host: PixelAsset,
  attachment: PixelAsset,
): AttachmentResult {
  const problems: AttachmentProblem[] = [];

  for (const asset of [host, attachment]) {
    if (validateAsset(asset).length > 0) {
      problems.push({
        code: "asset-invalid",
        message: `Asset ${asset.id} does not validate, so its anchors cannot be trusted.`,
      });
    }
  }

  const spec = attachment.attachment;
  if (!spec) {
    problems.push({
      code: "attachment-absent",
      message: `Asset ${attachment.id} declares no attachment, so there is nothing to place.`,
    });
    return { resolved: null, problems };
  }

  if (spec.hostKind !== undefined && spec.hostKind !== host.kind) {
    problems.push({
      code: "host-kind-mismatch",
      message: `Asset ${attachment.id} attaches to a ${spec.hostKind}, but ${host.id} is a ${host.kind}.`,
    });
  }

  const hostAnchor = (host.anchors ?? []).find(
    (anchor) => anchor.id === spec.hostAnchor,
  );
  if (!hostAnchor) {
    problems.push({
      code: "host-anchor-unknown",
      message: `Host ${host.id} has no anchor ${JSON.stringify(spec.hostAnchor)}. It declares: ${(host.anchors ?? []).map((a) => a.id).join(", ") || "none"}.`,
    });
  }

  const pivot = (attachment.anchors ?? []).find(
    (anchor) => anchor.id === spec.pivot,
  );
  if (!pivot) {
    problems.push({
      code: "pivot-unknown",
      message: `Asset ${attachment.id} has no pivot anchor ${JSON.stringify(spec.pivot)}. It declares: ${(attachment.anchors ?? []).map((a) => a.id).join(", ") || "none"}.`,
    });
  }

  /**
   * A composed asset is painted with the host's placement, so its coordinates
   * are read in the *host's* reference grid. An asset whose own grid is larger
   * than its host's is describing a space the host does not have, which is a
   * real authoring mistake rather than a style choice.
   */
  if (
    attachment.reference.width > host.reference.width ||
    attachment.reference.height > host.reference.height
  ) {
    problems.push({
      code: "grid-larger-than-host",
      message: `Asset ${attachment.id} has a ${attachment.reference.width} × ${attachment.reference.height} grid but host ${host.id} is ${host.reference.width} × ${host.reference.height}. A composed asset shares its host's grid.`,
    });
  }

  if (!hostAnchor || !pivot || problems.length > 0) {
    return { resolved: null, problems };
  }

  return {
    resolved: {
      offsetX: hostAnchor.x - pivot.x,
      offsetY: hostAnchor.y - pivot.y,
      hostAnchor,
      pivot,
    },
    problems,
  };
}
