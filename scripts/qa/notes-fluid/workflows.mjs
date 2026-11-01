export default async function workflows(page, { root, evidence }) {
  const target = page
    .context()
    .browser()
    .contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  const results = [];
  const check = (v, msg) => {
    if (!v) throw new Error(msg);
  };
  await target.setViewportSize({ width: 1440, height: 960 });
  await target.evaluate(async () => {
    window.qa.applyAppearance({
      mode: "light",
      accent: "#28766b",
      background: "#eee8da",
    });
    const l = window.qa.library;
    const root = await l.folder("Physics", null);
    await l.folder("Electricity & fields", root);
    await l.folder("Mathematics", null);
    await l.folder("Ideas & journals", null);
    const seed = [
      ["Complex numbers", "The Argand plane connects algebra and geometry."],
      [
        "Morning reflections",
        "A small idea, written down, becomes a place to begin.",
      ],
      [
        "Lecture 04 · wave motion",
        "Superposition • interference • diffraction",
      ],
      [
        "Study plan",
        "Review concepts. Work through the examples. Ask better questions.",
      ],
    ];
    for (const [title, text] of seed) {
      await l.create(title, "notebook", null, "typed", text);
    }
    await l.indexSearch();
    await l.refresh();
  });
  await target.getByRole("button", { name: "Grid view", exact: true }).click();
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "library-desktop-light.png" });
  await target.getByRole("button", { name: "List view", exact: true }).click();
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "library-list-desktop.png" });
  await target.getByRole("button", { name: "Grid view", exact: true }).click();
  await target
    .getByRole("button", { name: "Physics 0 notes", exact: true })
    .click();
  check(
    await target
      .getByRole("button", {
        name: "Electricity & fields 0 notes",
        exact: true,
      })
      .isVisible(),
    "Nested folder not shown"
  );
  await target
    .getByRole("button", { name: "Collapse Physics", exact: true })
    .click();
  check(
    !(await target
      .getByRole("button", { name: "Electricity & fields", exact: true })
      .count()),
    "Collapsed folder still visible"
  );
  await target
    .getByRole("button", { name: "All notes", exact: false })
    .first()
    .click();
  results.push(
    "Nested folders, folder cards, grid/list and actual text previews"
  );
  await target
    .getByLabel("Choose image to import", { exact: true })
    .setInputFiles(root + "public/icons/icon-192.png");
  await target.locator("[data-notebook-active=true] .bn-editor img").waitFor();
  await target.reload();
  await target.locator("[data-notebook-active=true] .bn-editor img").waitFor();
  const imageState = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const n = l
      .snapshot()
      .notes.find((n) => n.view.descriptor.title === "icon-192");
    return {
      assets: n.view.descriptor.assets.length,
      streams: n.view.descriptor.streams.length,
    };
  });
  check(
    imageState.assets === 1 && imageState.streams === 2,
    "Image import not retained in unified note"
  );
  await target
    .getByRole("button", { name: "Handwriting mode", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  await target.getByLabel("Ink color and thickness", { exact: true }).click();
  await target
    .getByRole("button", { name: "Ink #b83349", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Close pen studio", exact: true })
    .click();
  const imageBox = await target
    .locator("[data-notebook-active=true] .bn-editor img")
    .boundingBox();
  await target.mouse.move(imageBox.x + 20, imageBox.y + 25);
  await target.mouse.down();
  await target.mouse.move(imageBox.x + 120, imageBox.y + 90, { steps: 14 });
  await target.mouse.up();
  await target.evaluate(async () => await window.qa.library.flushEditors());
  imageState.strokes = await target.evaluate(async () => {
    const l = window.qa.library;
    const id = new URLSearchParams(location.hash.split("?")[1]).get("document");
    const n = await l.repository.document(id);
    const source = await l.open(id, n.descriptor.pages[0].pageId, "ink");
    const ink = new window.qa.InkModel(source.stream.doc);
    const count = ink.strokes().length;
    ink.close();
    source.release();
    return count;
  });
  check(imageState.strokes === 1, "Ink over imported image was not retained");
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "image-note-desktop.png" });
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  results.push("Image import through original encrypted attachment pipeline");
  await target
    .getByLabel("Choose PDF file", { exact: true })
    .setInputFiles(root + "scripts/qa/notes-pdf/fixtures/lecture.pdf");
  await target
    .getByRole("region", { name: "PDF study document", exact: true })
    .waitFor();
  await target
    .locator('[data-selectable="true"] span')
    .filter({ hasText: "Vector fields" })
    .waitFor();
  await target.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  await target
    .getByText("Loading page…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "pdf-desktop.png" });
  await target.setViewportSize({ width: 390, height: 844 });
  await target.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  await target
    .getByText("Loading page…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "pdf-phone-light.png" });
  check(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "PDF phone overflow"
  );
  const annotated = await target.evaluate(async () => {
    const l = window.qa.library;
    const id = new URLSearchParams(location.hash.split("?")[1]).get("document");
    const view = await l.repository.document(id),
      p = view.descriptor.pages[0];
    const source = await l.open(id, p.pageId),
      markup = new window.qa.PdfMarkup(source.stream.doc);
    markup.put({
      kind: "text",
      rects: [{ x: 40, y: 80, width: 360, height: 120 }],
      text: "Annotation Unicode Ω 東京 😀",
      color: "#273340",
      size: 16,
    });
    await source.stream.flush();
    markup.close();
    source.release();
    const bytes = await window.qa.exportAnnotatedPdf(l, id),
      opened = await window.qa.openPdf(bytes);
    try {
      const page = await opened.doc.getPage(1),
        text = (await page.getTextContent()).items
          .map((i) => i.str || "")
          .join(" ");
      return {
        bytes: bytes.length,
        originalSelectable: text.includes("Vector fields"),
        annotationSelectable: text
          .replace(/\s+/gu, " ")
          .includes("Annotation Unicode Ω 東京 😀"),
        text,
      };
    } finally {
      await opened.close();
    }
  });
  check(
    annotated.originalSelectable && annotated.annotationSelectable,
    "PDF source or typed annotation text lost selection: " +
      JSON.stringify(annotated)
  );
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  results.push(
    "Real PDF import, local worker rendering, selectable source text and Unicode typed annotation exports"
  );
  await target.setViewportSize({ width: 834, height: 1112 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "dark",
      accent: "#f1b87c",
      background: "#172c30",
    })
  );
  await target
    .getByRole("button", { name: "Open Physics · induction", exact: true })
    .click();
  await target
    .locator("[data-notebook-active=true] .bn-editor")
    .first()
    .waitFor();
  const exported = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const id = new URLSearchParams(location.hash.split("?")[1]).get("document");
    const bytes = await window.qa.renderDrivePdf(l.repository, id);
    const pages = await window.qa.inspectPdf(bytes, l.session.signal);
    for (let attempt = 0; attempt < 5; attempt++) {
      await l.synchronize();
      await l.refresh();
      if (l.snapshot().pending <= l.snapshot().localDrafts) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      bytes: bytes.length,
      pages: pages.length,
      pending: l.snapshot().pending,
      localDrafts: l.snapshot().localDrafts,
    };
  });
  check(
    exported.pages === 2 && exported.bytes > 1000,
    "Composite PDF missing pages"
  );
  check(
    exported.pending <= exported.localDrafts,
    "Synthetic cloud queue did not drain"
  );
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  await target.waitForTimeout(160);
  await target.screenshot({ path: evidence + "editor-tablet-custom-dark.png" });
  await target.getByRole("button", { name: "Text mode", exact: true }).click();
  const previousPage = target.getByRole("button", {
    name: "Previous paper page",
    exact: true,
  });
  if (await previousPage.isEnabled()) await previousPage.click();
  const editor = target
    .locator("[data-notebook-active=true] .bn-editor[contenteditable=true]")
    .first();
  await editor.click();
  // Put the caret at the actual document end; browser document-end shortcuts differ by platform.
  await editor.evaluate((element) => {
    element.focus();
    const last = [...element.querySelectorAll(".bn-inline-content")].at(-1);
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await target.keyboard.press("ArrowRight");
  for (let i = 0; i < 48; i++) {
    await target.keyboard.press("Enter");
    await target.keyboard.type("Continuing the same note, line " + i);
  }
  check(
    (await editor.innerText()).includes("electromotive force"),
    "Continued typing replaced the original text"
  );
  const caret = await target.evaluate(() => {
    const s = getSelection();
    const r = s.getRangeAt(0).getBoundingClientRect();
    const host = document
      .querySelector(
        '[data-notebook-active=true] [aria-label="Handwriting paper"]'
      )
      .getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      hostBottom: host.bottom,
      viewportTop: document
        .querySelector('[aria-label="Notebook scroll area"]')
        .getBoundingClientRect().top,
    };
  });
  check(
    caret.bottom < caret.hostBottom && caret.top > caret.viewportTop,
    "Typing caret disappeared below the workspace"
  );
  await target.evaluate(async () => await window.qa.library.flushEditors());
  results.push(
    "Composite text/ink Drive PDF, synthetic sync and sustained typing with caret navigation"
  );
  const legacyExport = await target.evaluate(async () => {
    const l = window.qa.library;
    const id = await l.create("Legacy ink pages", "notebook", null, "ink");
    const second = await l.addPage(id);
    await l.ensurePageLayers(id);
    const before = await window.qa.renderDrivePdf(l.repository, id);
    const source = await l.open(id, second),
      ink = new window.qa.InkModel(source.stream.doc);
    ink.begin({
      tool: "pen",
      color: "#345bc6",
      width: 3,
      input: "pen",
      brush: "perfect-freehand/1.2.3:sylf-1",
    });
    ink.append([
      [80, 150, 0.5, 0, 0, 0, 0, 0],
      [180, 240, 0.7, 10, 0, 0, 0, 0],
    ]);
    ink.finish();
    await source.stream.flush();
    ink.close();
    source.release();
    const after = await window.qa.renderDrivePdf(l.repository, id);
    const pages = await window.qa.inspectPdf(after, l.session.signal);
    return {
      changed:
        before.length !== after.length || before.some((n, i) => n !== after[i]),
      pages: pages.length,
    };
  });
  check(
    legacyExport.changed && legacyExport.pages === 2,
    "Export omitted an unprepared original ink page"
  );
  results.push(
    "Readable copies preserve unopened original ink pages alongside new text layers"
  );
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await target.getByRole("button", { name: "New note", exact: true }).waitFor();
  await target.setViewportSize({ width: 320, height: 740 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "light",
      accent: "#e6b568",
      background: "#152638",
    })
  );
  await target.waitForTimeout(160);
  await target.screenshot({
    path: evidence + "library-phone-inverted-custom.png",
  });
  check(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "320px library overflow"
  );
  return { results, imageState, exported, annotated, legacyExport, caret };
}
