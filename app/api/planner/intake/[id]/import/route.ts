import { plannerRoute } from "@/lib/planner/server/http";
import { storeScopeCandidate } from "@/lib/planner/server/intake";
import { extractOutlineFromImage } from "@/lib/planner/import/vision";
import { extractPdfText } from "@/lib/planner/import/pdf";
import { importErrorFor } from "@/lib/planner/import/service";
import { validateSyllabusUpload } from "@/lib/planner/import/validate";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import a syllabus from a document.
 *
 * Kept as its own route rather than a typed action because a file is not JSON: the body
 * is multipart, and the transport, the size cap and the MIME decision are the security
 * surface of this feature. Everything after validation goes through the same intake
 * session, versioning and telemetry as any other mutation, so an import cannot become a
 * second, unversioned way to change a brief.
 *
 * The file itself is never sent to the Planner model, and its text is never logged.
 */

const MetaSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  actionKey: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  sessionId: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
});

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const form = await req.formData().catch(() => null);
    if (!form) return errorResponse(400, "IMPORT_FAILED", "The upload could not be read.");

    const meta = MetaSchema.safeParse({
      schemaVersion: Number(form.get("schemaVersion")),
      expectedVersion: Number(form.get("expectedVersion")),
      actionKey: String(form.get("actionKey") ?? ""),
      sessionId: id,
    });
    if (!meta.success)
      return errorResponse(400, "IMPORT_FAILED", "The upload was missing required fields.");

    const file = form.get("file");
    if (!(file instanceof File))
      return errorResponse(400, "IMPORT_UNSUPPORTED", "Choose a PDF or an image of the syllabus.");

    // Bounded before anything is read into memory.
    if (file.size > MAX_UPLOAD_BYTES)
      return errorResponse(413, "IMPORT_TOO_LARGE", "That file is larger than 5 MB.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = validateSyllabusUpload(
      { name: file.name, type: file.type, size: file.size },
      buffer
    );
    if (!validated.ok) return errorResponse(validated.code === "IMPORT_TOO_LARGE" ? 413 : 400, validated.code, validated.message);

    const extraction =
      validated.kind === "PDF"
        ? await extractPdfText(buffer)
        : await extractOutlineFromImage({ buffer, mime: validated.mime });

    // A scan has no text layer: say so and offer the photograph path rather than
    // pretending an empty list is a syllabus.
    if (!extraction.text.trim())
      return Response.json(
        {
          error: {
            code: importErrorFor(extraction.partialReason) ?? "IMPORT_EMPTY",
            message:
              extraction.partialReason === "VISION_UNAVAILABLE"
                ? "Reading images is not available right now. You can paste the outline instead."
                : "I could not read any text from that file. If it is a scan or a photo, try a clearer image, or paste the outline.",
          },
        },
        { status: 422, headers: { "Cache-Control": "private, no-store" } }
      );

    const stored = await storeScopeCandidate(userId, id, {
      schemaVersion: 1,
      expectedVersion: meta.data.expectedVersion,
      actionKey: meta.data.actionKey,
      extraction,
      sourceTitle: safeTitle(file.name),
    });

    return Response.json(
      {
        ...stored,
        // The extraction's own honesty travels with the candidate: which pages were
        // read, and whether anything was missed.
        import: {
          pages: extraction.pages,
          partial: extraction.partial,
          partialReason: extraction.partialReason,
          method: extraction.method,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  });
}

/** A bounded, inert echo of the student's own file name for display only. */
const safeTitle = (name: string): string =>
  name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 200) || "Your upload";

const errorResponse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
