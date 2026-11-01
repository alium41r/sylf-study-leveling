/** Isolated qualification UI only. Never imported by the application. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { NotesLibrary } from "@/lib/notes/library";
import { NotesSession } from "@/lib/notes/session";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { createNotesVault } from "@/lib/notes/vault";
import { InkModel, type InkSample } from "@/lib/notes/ink";
import { exportNotes, importNotes } from "@/lib/notes/portable";
import { digest } from "@/lib/notes/bytes";
import { openPdf, inspectPdf } from "@/lib/notes/pdf-reader";
import "@/app/globals.css";
const pause = (n: number) => new Promise((r) => setTimeout(r, n));
function Qualification() {
  const [progress, setProgress] = useState("Ready"),
    [result, setResult] = useState(""),
    [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    const started = performance.now();
    let library: NotesLibrary | undefined;
    const repos: IndexedDbNotesRepository[] = [];
    let model: InkModel | undefined;
    try {
      const config = await (
        await fetch("/qa/reset", { method: "POST" })
      ).json();
      async function repository() {
        const session = new NotesSession("1", () => "1");
        const key = await createNotesVault(
          new Uint8Array(32).fill(71),
          JSON.stringify(["1", config.descriptor.libraryId]),
          session
        );
        const repo = new IndexedDbNotesRepository({
          session,
          libraryId: config.descriptor.libraryId,
          bindingGeneration: 1,
          databaseName: "phase7-qualification-" + crypto.randomUUID(),
          cipher: key,
        });
        repos.push(repo);
        await repo.registerLibrary(config.descriptor, config.binding);
        return repo;
      }
      const repo = await repository();
      library = await NotesLibrary.fromRepository(config, repo);
      const id = await library.create(
        "Sustained synthetic handwriting",
        "notebook",
        null,
        "ink"
      );
      const opened = await library.open(id);
      model = new InkModel(opened.stream.doc);
      const source = await PDFDocument.create(),
        font = await source.embedFont(StandardFonts.Helvetica);
      for (let i = 0; i < 30; i++) {
        const page = source.addPage([612, 792]);
        for (let line = 0; line < 30; line++)
          page.drawText(
            `Study fixture page ${i + 1}: Complex numbers and revision ${line + 1}`,
            { x: 40, y: 750 - line * 22, size: 11, font }
          );
      }
      const pdf = await source.save();
      const pdfId = await library.importPdf(
        pdf,
        await inspectPdf(pdf),
        "Synthetic study paper.pdf"
      );
      const pdfReader = await openPdf(pdf);
      const canvas = document.createElement("canvas");
      document.getElementById("canvas-host")!.replaceChildren(canvas);
      await fetch("/qa/offline", { method: "POST", body: "true" });
      const samples: number[] = [],
        renderTimes: number[] = [];
      const before = await (await fetch("/qa/metrics")).json();
      const count = 600,
        pacing = 1000,
        writingStart = performance.now();
      for (let i = 0; i < count; i++) {
        const at = performance.now();
        model.begin({
          tool: i % 5 ? "pen" : "highlighter",
          color: "#7552cc",
          width: i % 5 ? 2 : 14,
          input: "pen",
          brush: "perfect-freehand/1.2.3:sylf-1",
        });
        model.append(
          Array.from(
            { length: 33 },
            (_, n): InkSample => [
              40 + (i % 12) * 40 + n * 2,
              70 + (Math.floor(i / 12) % 20) * 28 + Math.sin(n / 4) * 8,
              0.3 + (n % 8) * 0.07,
              n * 4,
              15,
              -20,
              45,
              0,
            ]
          )
        );
        model.finish();
        const save = performance.now();
        await opened.stream.flush();
        samples.push(performance.now() - save);
        if (i % 60 === 0) {
          const at = performance.now(),
            page = await pdfReader.doc.getPage(i / 60 + 1),
            viewport = page.getViewport({ scale: 1 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          page.cleanup();
          renderTimes.push(performance.now() - at);
          setProgress(
            `Writing ${i + 1}/${count}; ${Math.round((performance.now() - writingStart) / 1000)} elapsed seconds`
          );
        }
        if (i === 299)
          await fetch("/qa/offline", { method: "POST", body: "false" });
        await pause(Math.max(0, pacing - (performance.now() - at)));
      }
      const writingMs = performance.now() - writingStart;
      await pdfReader.close();
      const after = await (await fetch("/qa/metrics")).json();
      if (after.uploads !== before.uploads)
        throw Error(
          "Automatic cloud uploads occurred during continuous writing"
        );
      const expectedHash = await digest(
          Y.encodeStateAsUpdate(opened.stream.doc)
        ),
        revisions = (await repo.listRevisions(id)).map((r) => r.id).sort();
      model.close();
      model = undefined;
      opened.release();
      setProgress("Cloud catch-up and independent reconstruction");
      const cloudStart = performance.now();
      for (let pass = 0; pass < 30; pass++) {
        await library.synchronize();
        if (!library.snapshot().pending) break;
      }
      if (library.snapshot().pending) throw Error("Pending cloud jobs remain");
      const cloudMs = performance.now() - cloudStart;
      const second = await repository(),
        restored = await NotesLibrary.fromRepository(config, second);
      for (let pass = 0; pass < 30; pass++) {
        await restored.synchronize();
        try {
          await second.document(id);
          break;
        } catch {}
      }
      const view = await second.document(id),
        stream = view.descriptor.streams[0];
      const loaded = await second.loadStream(
        id,
        stream.streamId,
        stream.epoch,
        view.heads
      );
      const recovered = new InkModel(loaded.doc);
      const hash = await digest(Y.encodeStateAsUpdate(loaded.doc));
      if (hash !== expectedHash || recovered.strokes().length !== count)
        throw Error("Independent provider reconstruction differs");
      recovered.close();
      loaded.doc.destroy();
      if (
        JSON.stringify(
          (await second.listRevisions(id)).map((r) => r.id).sort()
        ) !== JSON.stringify(revisions)
      )
        throw Error("History identity changed");
      const archive = await exportNotes(repo, [id, pdfId], {
          nativeOnly: true,
        }),
        third = await repository();
      await importNotes(third, archive.bytes);
      if (
        (await third.document(pdfId)).descriptor.assets[0].content.hash !==
        (await repo.document(pdfId)).descriptor.assets[0].content.hash
      )
        throw Error("PDF original changed");
      const p95 = samples.sort((a, b) => a - b)[
        Math.floor(samples.length * 0.95)
      ];
      const metrics = await (await fetch("/qa/metrics")).json();
      const output = {
        kind: "synthetic provider, real Chromium IndexedDB and PDF.js",
        writingMs,
        strokes: count,
        samples: count * 33,
        originalRevisions: revisions.length,
        localSaveP95Ms: p95,
        pdfPages: 30,
        pdfRenderMaxMs: Math.max(...renderTimes),
        uploadsDuringContinuousWriting: after.uploads - before.uploads,
        cloudCatchupMs: cloudMs,
        cloudPacks: metrics.uploads,
        portableBytes: archive.bytes.length,
        independentNativeHashMatches: true,
        allRevisionIdsPreserved: true,
        originalPdfHashPreserved: true,
        totalElapsedMs: performance.now() - started,
      };
      await fetch("/qa/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(output),
      });
      setResult(JSON.stringify(output, null, 2));
      setProgress("Passed");
      await restored.dispose();
    } catch (e) {
      setProgress("Failed");
      setResult(String(e instanceof Error ? e.stack : e));
    } finally {
      model?.close();
      await library?.dispose().catch(() => {});
      for (const repo of repos) {
        repo.session.close();
        repo.close();
      }
      setRunning(false);
    }
  }
  return (
    <main
      style={{
        padding: 24,
        color: "var(--text-primary)",
        background: "var(--background)",
        minHeight: "100vh",
      }}
    >
      <h1>Phase 7 isolated qualification</h1>
      <p>
        Real local persistence; synthetic provider and input. No personal
        accounts.
      </p>
      <button disabled={running} onClick={() => void run()}>
        Run ten-minute mixed study test
      </button>
      <p role="status">{progress}</p>
      <pre id="results" style={{ whiteSpace: "pre-wrap" }}>
        {result}
      </pre>
      <div id="canvas-host" />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Qualification />);
