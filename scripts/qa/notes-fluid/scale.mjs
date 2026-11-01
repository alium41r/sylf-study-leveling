import assert from "node:assert/strict";
export default async function scale(_page, { evidence }) {
  const page = _page
    .context()
    .browser()
    .contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  await page.setViewportSize({ width: 1440, height: 960 });
  const state = await page.evaluate(async () => {
    const l = window.qa.library,
      Y = window.qa.Y,
      n = l.snapshot().notes[0];
    await l.flushEditors();
    const initial = await window.qa.initialRichTextUpdate(
      "Virtual page content"
    );
    const blank = new Y.Doc(),
      ink = new window.qa.InkModel(blank);
    ink.setPaper({
      template: "grid",
      color: "#fffdf7",
      rule: "#d9dfea",
      spacing: 28,
    });
    const inkBytes = Y.encodeStateAsUpdate(blank);
    ink.close();
    blank.destroy();
    const updates = [],
      pages = [];
    for (let i = 0; i < 295; i++) {
      const text = crypto.randomUUID(),
        ink = crypto.randomUUID(),
        pageId = crypto.randomUUID();
      pages.push({
        pageId,
        streamId: text,
        width: 800,
        height: 1100,
        extensions: { textStreamId: text, inkStreamId: ink },
      });
      updates.push(
        { streamId: text, epoch: 1, bytes: initial },
        { streamId: ink, epoch: 1, bytes: inkBytes }
      );
    }
    const started = performance.now();
    await l.mutate(
      n.id,
      (d) => {
        for (const p of pages) {
          d.pages.push(p);
          d.streams.push(
            {
              streamId: p.streamId,
              epoch: 1,
              adapter: "blocknote/0.56.0",
              codec: "yjs13-update-v1",
              schemaVersion: 1,
              projection: { root: "body", type: "xml" },
            },
            {
              streamId: p.extensions.inkStreamId,
              epoch: 1,
              adapter: "sylf-ink/1",
              codec: "yjs13-update-v1",
              schemaVersion: 1,
              projection: { root: "ink", type: "map" },
            }
          );
        }
      },
      "edit",
      updates
    );
    return { id: n.id, pages: 300, setupMs: performance.now() - started };
  });
  const measurements = [];
  for (const ratio of [0.1, 0.5, 0.9, 0.25, 0.75, 0.99]) {
    const start = Date.now();
    await page
      .locator('[aria-label="Notebook scroll area"]')
      .evaluate((node, ratio) => {
        node.scrollTop = (node.scrollHeight - node.clientHeight) * ratio;
      }, ratio);
    await page
      .locator("[data-notebook-active=true] .bn-editor")
      .first()
      .waitFor();
    await page.waitForFunction(() => {
      const active = document.querySelector("[data-notebook-active=true]");
      if (!active || !active.querySelector(".bn-editor")) return false;
      const r = active.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 110;
    });
    await page.waitForTimeout(100);
    const metric = await page.evaluate(() => ({
      pages: document.querySelectorAll("[data-notebook-page]").length,
      canvases: document.querySelectorAll("[data-notebook-page] canvas").length,
      canvasPixels: [
        ...document.querySelectorAll("[data-notebook-page] canvas"),
      ].reduce((n, c) => n + c.width * c.height, 0),
      dom: document.querySelectorAll("*").length,
    }));
    assert(metric.pages <= 4, "Virtualization must bound mounted pages");
    assert(
      metric.canvasPixels < 16_000_000,
      "Viewport canvas allocation must remain bounded"
    );
    measurements.push({ ratio, settleMs: Date.now() - start, ...metric });
  }
  await page.screenshot({ path: evidence + "300-page-notebook.png" });
  const scrollFrames = await page.evaluate(async () => {
    const node = document.querySelector('[aria-label="Notebook scroll area"]');
    node.scrollTop = node.scrollHeight * 0.4;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const gaps = [];
    let previous;
    for (let i = 0; i < 90; i++) {
      const now = await new Promise((resolve) =>
        requestAnimationFrame(resolve)
      );
      if (previous !== undefined) gaps.push(now - previous);
      previous = now;
      node.scrollTop += 32;
    }
    gaps.sort((a, b) => a - b);
    return {
      p95Ms: gaps[Math.floor(gaps.length * 0.95)],
      maxMs: gaps.at(-1),
      frames: gaps.length,
      over33ms: gaps.filter((n) => n > 33.5).length,
    };
  });
  assert(
    scrollFrames.p95Ms < 34,
    "Steady scrolling must stay within two 60 Hz frame intervals in the synthetic profile"
  );
  // A very long logical page must print in bounded tiles with its final text searchable.
  const long = await page.evaluate(async ({ id }) => {
    const l = window.qa.library,
      Y = window.qa.Y;
    const p = l.snapshot().notes.find((n) => n.id === id).view.descriptor
      .pages[0];
    const source = await l.open(id, p.pageId, "text");
    const boxId = "box-" + crypto.randomUUID();
    const bytes = await window.qa.initialRichTextUpdate(
      "Final sheet searchable marker Ω",
      undefined,
      boxId
    );
    const boxes = new window.qa.PageBoxes(source.stream.doc, p, () => true);
    source.stream.doc.transact(() => {
      Y.applyUpdate(source.stream.doc, bytes);
      boxes.add(80, 45000, undefined, boxId);
    });
    await source.stream.flush();
    boxes.close();
    source.release();
    await l.mutate(id, (d) => {
      d.pages[0].height = 50000;
      for (const item of d.pages.slice(1)) item.extensions.archived = true;
    });
    const height = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "height"
    );
    let pixels = 0;
    Object.defineProperty(HTMLCanvasElement.prototype, "height", {
      ...height,
      set(value) {
        height.set.call(this, value);
        pixels = Math.max(pixels, this.width * this.height);
      },
    });
    const start = performance.now();
    let pdf;
    try {
      pdf = await window.qa.renderDrivePdf(l.repository, id);
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, "height", height);
    }
    const elapsed = performance.now() - start;
    const opened = await window.qa.openPdf(pdf);
    const text = [];
    try {
      for (let i = 1; i <= opened.doc.numPages; i++) {
        const p = await opened.doc.getPage(i);
        text.push(
          (await p.getTextContent()).items.map((i) => i.str || "").join("")
        );
        p.cleanup();
      }
    } finally {
      await opened.close();
    }
    return {
      elapsedMs: elapsed,
      bytes: pdf.length,
      pages: text.length,
      maxCanvasPixels: pixels,
      markerCount: text.filter((t) =>
        t.includes("Final sheet searchable marker Ω")
      ).length,
    };
  }, state);
  assert.equal(long.pages, 46);
  assert.equal(long.markerCount, 1);
  assert(long.maxCanvasPixels <= 8_000_000);
  return { state, measurements, scrollFrames, long };
}
