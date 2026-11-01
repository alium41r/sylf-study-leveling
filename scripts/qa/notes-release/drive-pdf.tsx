/** Explicit, synthetic browser qualification. Never imported by production. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { NotesLibrary } from "@/lib/notes/library";
import { NotesSession } from "@/lib/notes/session";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { createNotesVault } from "@/lib/notes/vault";
import { createNotesBlockNoteEditor } from "@/lib/notes/blocknote-adapter";
import { renderDrivePdf } from "@/lib/notes/drive-pdf";
import { InkModel, type InkSample } from "@/lib/notes/ink";
import { pdfPageMaps } from "@/lib/notes/pdf";
import { openPdf, inspectPdf } from "@/lib/notes/pdf-reader";
function Qualification() {
  const [status, setStatus] = useState("Ready"),
    [results, setResults] = useState("");
  async function run() {
    setStatus("Running");
    let library: NotesLibrary | undefined,
      repository: IndexedDbNotesRepository | undefined;
    const urls: string[] = [];
    try {
      const config = await (
        await fetch("/qa/reset", { method: "POST" })
      ).json();
      const session = new NotesSession("1", () => "1");
      repository = new IndexedDbNotesRepository({
        session,
        libraryId: config.descriptor.libraryId,
        bindingGeneration: 1,
        databaseName: "phase7-readable-pdf-" + crypto.randomUUID(),
        cipher: await createNotesVault(
          new Uint8Array(32).fill(71),
          JSON.stringify(["1", config.descriptor.libraryId]),
          session
        ),
      });
      await repository.registerLibrary(config.descriptor, config.binding);
      library = await NotesLibrary.fromRepository(config, repository);
      const rich = await library.create("Complex numbers — α, β and ∑", "flow"),
        opened = await library.open(rich);
      const editor = await createNotesBlockNoteEditor(opened.stream);
      const editingHost = document.createElement("div");
      document.body.append(editingHost);
      editor.editor.mount(editingHost);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = 360;
      imageCanvas.height = 120;
      const ctx = imageCanvas.getContext("2d")!;
      ctx.fillStyle = "#eee8ff";
      ctx.fillRect(0, 0, 360, 120);
      ctx.fillStyle = "#6041aa";
      ctx.font = "24px Arial";
      ctx.fillText("Local image attachment", 24, 65);
      const blob = await new Promise<Blob>((resolve) =>
        imageCanvas.toBlob((b) => resolve(b!), "image/png")
      );
      const assetUrl = await library.uploadImage(
        rich,
        new File([blob], "synthetic.png", { type: "image/png" })
      );
      editor.editor.replaceBlocks(editor.editor.document, [
        {
          type: "heading",
          props: { level: 2 },
          content: "Lecture 1: Complex numbers",
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Unicode and mathematics: α + β = ∑ x². ",
              styles: { bold: true },
            },
            {
              type: "text",
              text: "Your original editable document and full history remain separate.",
              styles: { italic: true },
            },
          ],
        },
        {
          type: "bulletListItem",
          content: "A readable PDF should retain every paragraph.",
        },
        {
          type: "checkListItem",
          props: { checked: true },
          content: "Preserve the original source and images.",
        },
        {
          type: "table",
          content: {
            type: "tableContent",
            rows: [
              {
                cells: [
                  [{ type: "text", text: "Symbol", styles: {} }],
                  [{ type: "text", text: "Meaning", styles: {} }],
                ],
              },
              {
                cells: [
                  [{ type: "text", text: "i²", styles: {} }],
                  [{ type: "text", text: "−1", styles: {} }],
                ],
              },
            ],
          },
        },
        {
          type: "image",
          props: {
            url: assetUrl,
            caption: "Embedded from the durable Notes repository.",
          },
        },
        ...Array.from({ length: 30 }, (_, i) => ({
          type: "paragraph" as const,
          content: `Revision paragraph ${i + 1}: i squared equals minus one. The PDF copy follows the note title and folder. A long line wraps without cutting off any words.`,
        })),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await opened.stream.flush();
      editor.close();
      editingHost.remove();
      opened.release();
      const titleOnly = await library.create("Named empty note", "flow");
      const inkId = await library.create(
          "Handwritten revision",
          "notebook",
          null,
          "ink"
        ),
        inkOpen = await library.open(inkId),
        ink = new InkModel(inkOpen.stream.doc);
      ink.begin({
        tool: "pen",
        color: "#6041aa",
        width: 4,
        input: "mouse",
        brush: "perfect-freehand/1.2.3:sylf-1",
      });
      ink.append(
        Array.from(
          { length: 60 },
          (_, n): InkSample => [
            60 + n * 9,
            150 + Math.sin(n / 4) * 35,
            0.5,
            n * 5,
            0,
            0,
            0,
            0,
          ]
        )
      );
      ink.finish();
      await inkOpen.stream.flush();
      ink.close();
      inkOpen.release();
      await library.addPage(inkId);
      const source = await PDFDocument.create(),
        font = await source.embedFont(StandardFonts.Helvetica);
      source
        .addPage([612, 792])
        .drawText("Original source retained: synthetic study paper", {
          x: 40,
          y: 700,
          size: 18,
          font,
        });
      const sourceBytes = await source.save(),
        pdfId = await library.importPdf(
          sourceBytes,
          await inspectPdf(sourceBytes),
          "Synthetic study paper.pdf"
        );
      const pdfOpen = await library.open(pdfId),
        pdfInk = new InkModel(
          pdfOpen.stream.doc,
          () => true,
          pdfPageMaps(pdfOpen.stream.doc).ink
        );
      pdfInk.begin({
        tool: "highlighter",
        color: "#eeb800",
        width: 18,
        input: "mouse",
        brush: "perfect-freehand/1.2.3:sylf-1",
      });
      pdfInk.append(
        Array.from(
          { length: 30 },
          (_, n): InkSample => [40 + n * 13, 98, 0.5, n * 4, 0, 0, 0, 0]
        )
      );
      pdfInk.finish();
      await pdfOpen.stream.flush();
      pdfInk.close();
      pdfOpen.release();
      const ids = [
        ["rich-text", rich],
        ["title-only", titleOnly],
        ["handwriting", inkId],
        ["annotated-pdf", pdfId],
      ];
      const output = [];
      const host = document.getElementById("previews")!;
      host.replaceChildren();
      for (const [kind, id] of ids) {
        const before = (await repository.listRevisions(id))
            .map((r) => r.id)
            .sort()
            .join(":"),
          at = performance.now();
        const bytes = await renderDrivePdf(repository, id),
          elapsedMs = performance.now() - at;
        if (
          before !==
          (await repository.listRevisions(id))
            .map((r) => r.id)
            .sort()
            .join(":")
        )
          throw Error("Rendering changed native history");
        const parsed = await PDFDocument.load(bytes),
          reader = await openPdf(bytes),
          page = await reader.doc.getPage(1),
          canvas = document.createElement("canvas"),
          viewport = page.getViewport({ scale: 0.8 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        const section = document.createElement("section"),
          label = document.createElement("h2");
        label.textContent = kind;
        section.append(label, canvas);
        host.append(section);
        await reader.close();
        await fetch("/qa/drive-pdf/file?kind=" + kind, {
          method: "POST",
          body: bytes.slice().buffer,
        });
        output.push({
          kind,
          pages: parsed.getPageCount(),
          bytes: bytes.length,
          elapsedMs,
          nativeRevisionIdsUnchanged: true,
        });
      }
      if (output[0].pages < 2 || output[2].pages !== 2 || output[3].pages !== 1)
        throw Error("Unexpected output pagination");
      const result = {
        passed: true,
        realChromiumIndexedDB: true,
        encryptedRepository: true,
        syntheticContentOnly: true,
        nativeHistoryUnchanged: true,
        copies: output,
        richTextRasterized: true,
      };
      await fetch("/qa/drive-pdf/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result, null, 2),
      });
      setResults(JSON.stringify(result, null, 2));
      setStatus("Passed");
    } catch (error) {
      setStatus("Failed");
      setResults(String(error instanceof Error ? error.stack : error));
    } finally {
      urls.forEach(URL.revokeObjectURL);
      await library?.dispose().catch(() => {});
      repository?.session.close();
      repository?.close();
    }
  }
  return (
    <main
      style={{
        padding: 24,
        fontFamily: "Arial",
        background: "#f6f4fa",
        color: "#17202a",
      }}
    >
      <h1>Sylf readable PDF qualification</h1>
      <p>Real encrypted local persistence; synthetic documents only.</p>
      <button disabled={status === "Running"} onClick={() => void run()}>
        Render synthetic Drive PDF copies
      </button>
      <p role="status">{status}</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{results}</pre>
      <div
        id="previews"
        style={{ display: "flex", gap: 24, flexWrap: "wrap" }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Qualification />);
