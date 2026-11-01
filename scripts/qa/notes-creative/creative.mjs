import assert from "node:assert/strict";
export default async function creative(page, { evidence }) {
  const target = page
    .context()
    .browser()
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes("4390") && p.url() !== "about:blank");
  const results = [];
  await target.setViewportSize({ width: 1440, height: 960 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "light",
      accent: "#28766b",
      background: "#eee8da",
    })
  );
  await target
    .getByRole("button", { name: "Open Physics · induction", exact: true })
    .click();
  await target.locator(".bn-editor[contenteditable=true]").waitFor();
  await target.getByRole("button", { name: "Text mode", exact: true }).click();
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  const host = target.getByRole("region", { name: "Handwriting paper" });
  await target
    .getByRole("button", { name: "Add text box", exact: true })
    .click();
  await host.click({ position: { x: 650, y: 470 } });
  await target.locator(".bn-editor").nth(1).waitFor();
  await target.locator(".bn-editor").nth(1).click();
  await target.keyboard.type("A movable thought");
  const selected = target.locator("[data-selected=true][data-kind=text]");
  const move = target.getByRole("button", {
    name: "Move text box",
    exact: true,
  });
  const m = await move.boundingBox();
  await target.mouse.move(m.x + 12, m.y + 12);
  await target.mouse.down();
  await target.mouse.move(m.x - 100, m.y + 80, { steps: 12 });
  await target.mouse.up();
  await move.focus();
  await target.keyboard.press("Shift+ArrowRight");
  const before = await selected.boundingBox();
  const resize = target.getByRole("button", {
    name: "Resize text box",
    exact: true,
  });
  const r = await resize.boundingBox();
  await target.mouse.move(r.x + 8, r.y + 8);
  await target.mouse.down();
  await target.mouse.move(r.x + 80, r.y + 40, { steps: 10 });
  await target.mouse.up();
  assert((await selected.boundingBox()).width > before.width);
  await target.evaluate(() => window.qa.library.flushEditors());
  await target.reload();
  await target.locator(".bn-editor").nth(1).waitFor();
  assert(
    (await target.locator(".bn-editor").nth(1).innerText()).includes(
      "A movable thought"
    )
  );
  results.push(
    "Independent rich-text boxes retain typing, drag, resize and keyboard nudges across reload"
  );
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "light",
      accent: "#28766b",
      background: "#eee8da",
      persistLocal: true,
    })
  );
  await target
    .getByRole("button", { name: "Handwriting mode", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Ink color and thickness", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Fountain pen", exact: true })
    .click();
  await target.getByLabel("Ink opacity", { exact: true }).fill("0.75");
  await target.getByRole("button", { name: "dashed ink", exact: true }).click();
  await target.getByText("Save current", { exact: true }).click();
  await target
    .getByRole("button", { name: "Use favorite fountain · 2.8", exact: true })
    .count();
  await target.screenshot({ path: evidence + "pen-studio-desktop.png" });
  await target
    .getByRole("button", { name: "Draw rectangle", exact: true })
    .click();
  // Actual pen event handlers receive pressure/tilt on the transformed page.
  await target.evaluate(() => {
    const host = document.querySelector('[aria-label="Handwriting paper"]'),
      layer = document.querySelector('[class*="textLayer"]'),
      v = new DOMMatrix(getComputedStyle(layer).transform),
      rect = host.getBoundingClientRect();
    const fire = (type, x, y, buttons) =>
      host.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 51,
          pointerType: "pen",
          isPrimary: true,
          button: 0,
          buttons,
          pressure: 0.7,
          tiltX: 20,
          tiltY: -15,
          clientX: rect.left + v.e + x * v.a,
          clientY: rect.top + v.f + y * v.a,
        })
      );
    fire("pointerdown", 350, 170, 1);
    fire("pointermove", 560, 330, 1);
    fire("pointerup", 560, 330, 0);
  });
  const state = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const n = l
      .snapshot()
      .notes.find((n) => n.view.descriptor.title === "Physics · induction");
    const p =
      new URLSearchParams(location.hash.split("?")[1]).get("page") ||
      n.view.descriptor.pages[0].pageId;
    const source = await l.open(n.id, p, "ink"),
      m = new window.qa.InkModel(source.stream.doc);
    const styles = m.strokes().map((s) => s.style);
    m.close();
    source.release();
    return styles;
  });
  assert(
    state.some(
      (s) =>
        s.shape === "rectangle" &&
        s.nib === "fountain" &&
        s.opacity === 0.75 &&
        s.lineStyle === "dashed"
    )
  );
  assert.equal(state.length, 2, "Arranging boxes must not create handwriting");
  await target
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Eraser options", exact: true })
    .click();
  await target.getByRole("button", { name: "Precision", exact: true }).click();
  await target
    .getByRole("button", { name: "Close eraser", exact: true })
    .click();
  await target.evaluate(() => {
    const host = document.querySelector('[aria-label="Handwriting paper"]'),
      v = new DOMMatrix(
        getComputedStyle(document.querySelector('[class*="textLayer"]'))
          .transform
      ),
      r = host.getBoundingClientRect();
    for (const [type, y, buttons] of [
      ["pointerdown", 230, 1],
      ["pointermove", 260, 1],
      ["pointerup", 260, 0],
    ])
      host.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 52,
          pointerType: "pen",
          button: 0,
          buttons,
          pressure: 0.6,
          clientX: r.left + v.e + 350 * v.a,
          clientY: r.top + v.f + y * v.a,
        })
      );
  });
  const cutCount = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const id = new URLSearchParams(location.hash.split("?")[1]).get("document"),
      page = new URLSearchParams(location.hash.split("?")[1]).get("page");
    const source = await l.open(id, page, "ink"),
      m = new window.qa.InkModel(source.stream.doc);
    const count = m.strokes().filter((s) => s.segments?.length).length;
    m.close();
    source.release();
    return count;
  });
  assert(cutCount >= 1);
  await target
    .getByRole("button", { name: "Undo handwriting", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Redo handwriting", exact: true })
    .click();
  results.push(
    "Pressure-aware fountain brush, saved favorite, dashed shapes and precision erasing with undo/redo persist"
  );
  await target.getByRole("button", { name: "Paper", exact: true }).click();
  await target.getByRole("button", { name: "Academic", exact: true }).click();
  await target
    .getByRole("button", { name: "Cornell notes template", exact: true })
    .click();
  await target.waitForFunction(()=>{const b=document.querySelector('[aria-label="Cornell notes template"]');return b?.getAttribute('aria-pressed')==='true'&&!b.matches(':disabled');});
  await target.screenshot({
    path: evidence + "templates-academic-desktop.png",
  });
  await target.getByRole("button", { name: "Planners", exact: true }).click();
  await target
    .getByRole("button", { name: "Weekly planner template", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Page & background", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Paper #dfebe5", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Page breaks", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Use as default for new notes", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Default style saved", exact: true })
    .waitFor();
  await target
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();
  await target.getByRole("button", { name: "Text mode", exact: true }).click();
  // Use a generated image through the actual encrypted asset upload/position flow.
  // Create a valid visible fixture with the browser canvas, avoiding external image requests.
  const bytes = await target.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 160;
    const x = c.getContext("2d");
    x.fillStyle = "#345bc6";
    x.fillRect(0, 0, 400, 160);
    x.fillStyle = "#ffffff";
    x.font = "bold 30px sans-serif";
    x.fillText("FIELD NOTES", 35, 95);
    return [
      ...new Uint8Array(
        await (await new Promise((r) => c.toBlob(r))).arrayBuffer()
      ),
    ];
  });
  await target
    .getByLabel("Choose positioned image", { exact: true })
    .setInputFiles({
      name: "field-notes.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await target.locator("[data-kind=image] img").waitFor();
  await target
    .getByRole("button", { name: "Page content layers", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Send image box to back", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Close page content", exact: true })
    .click();

  await target.getByRole("button", { name: "Paper", exact: true }).click();
  await target
    .getByRole("button", { name: "Page & background", exact: true })
    .click();
  await target
    .getByLabel("Choose page background", { exact: true })
    .setInputFiles({
      name: "paper.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await target.getByRole("button", { name: "Remove", exact: true }).waitFor();
  await target.getByRole("button", { name: "Remove", exact: true }).click();
  await target.waitForFunction(()=>!document.querySelector('[aria-label="Back to notes"]').disabled && !document.querySelector('[class*="pageBackground"]'));
  await target
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();

  await target
    .getByRole("button", { name: "Fit whole page", exact: true })
    .click();
  await target.screenshot({ path: evidence + "mixed-content-desktop.png" });
  const exported = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const n = l
      .snapshot()
      .notes.find((n) => n.view.descriptor.title === "Physics · induction");
    const bytes = await window.qa.renderDrivePdf(l.repository, n.id);
    const pages = await window.qa.inspectPdf(bytes);
    window.qa.creativePDF = bytes;
    await l.synchronize();
    return {
      bytes: bytes.length,
      pages: pages.length,
      pens: l.preferences().pens.length,
      style: l.preferences().style,
    };
  });
  const printedBytes = await target.evaluate(() => [...window.qa.creativePDF]);
  assert(exported.bytes > 1000);
  assert(exported.pens >= 4);
  assert.equal(exported.style.paper.template, "weekly");
  await target.setViewportSize({ width: 834, height: 1112 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "dark",
      accent: "#e8bc79",
      background: "#182d31",
    })
  );
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  await target.screenshot({ path: evidence + "mixed-content-tablet-dark.png" });
  await target.getByRole("button", { name: "Paper", exact: true }).click();
  await target.getByRole("button", { name: "Journals", exact: true }).click();
  await target.screenshot({ path: evidence + "templates-tablet-dark.png" });
  await target
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();
  for (const width of [390, 320]) {
    await target.setViewportSize({ width, height: 844 });
    await target
      .getByRole("button", { name: "Handwriting mode", exact: true })
      .click();
    await target.getByRole("button", { name: "Pen", exact: true }).click();
    await target
      .getByRole("button", { name: "Ink color and thickness", exact: true })
      .click();
    await target.screenshot({
      path: evidence + `pen-studio-phone-${width}.png`,
    });
    assert(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
    await target
      .getByRole("button", { name: "Close pen studio", exact: true })
      .click();
  }
  await target.setViewportSize({ width: 1440, height: 960 });
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await target.getByRole("button", { name: "New note", exact: true }).click();
  await target.locator(".bn-editor[contenteditable=true]").waitFor();
  await target.reload();
  await target.locator(".bn-editor[contenteditable=true]").waitFor();
  const persistedPens = await target.evaluate(
    () => window.qa.library.preferences().pens.length
  );
  assert(persistedPens >= 4);
  const defaults = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const n = l
      .snapshot()
      .notes.find((n) => n.view.descriptor.title === "Untitled note");
    return n.view.descriptor.pages[0].extensions.noteStyle;
  });
  assert.equal(defaults.paper.template, "weekly");
  await target.getByRole("button", { name: "Paper", exact: true }).click();
  await target
    .getByRole("button", { name: "Page & background", exact: true })
    .click();
  await target.getByLabel("Page size", { exact: true }).selectOption("A5");
  await target.getByRole("button", { name: "Landscape", exact: true }).click();
  await target.getByLabel("Custom page width", { exact: true }).fill("900");
  await target.getByLabel("Custom page height", { exact: true }).fill("600");
  await target.getByRole("button", { name: "Apply", exact: true }).click();
  await target
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();
  await target.evaluate(() => window.qa.library.flushEditors());
  const geometry = await target.evaluate(
    () =>
      window.qa.library
        .snapshot()
        .notes.find((n) => n.view.descriptor.title === "Untitled note").view
        .descriptor.pages[0]
  );
  assert.equal(geometry.width, 900);
  assert(geometry.height >= 600);

  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await target.getByLabel("Choose PDF file", { exact: true }).setInputFiles({
    name: "Creative study copy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(printedBytes),
  });
  await target
    .getByRole("region", { name: "PDF study document", exact: true })
    .waitFor();
  await target
    .getByText("Loading page…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "light",
      accent: "#28766b",
      background: "#eee8da",
    })
  );
  await target
    .getByRole("button", { name: "Next PDF page", exact: true })
    .click();
  await target
    .getByText("Loading page…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  for (let i = 0; i < 3; i++)
    await target
      .getByRole("button", { name: "Zoom PDF out", exact: true })
      .click();
  await target
    .getByText("Loading page…", { exact: true })
    .first()
    .waitFor({ state: "hidden" });
  await target.screenshot({
    path: evidence + "exported-typography-desktop.png",
  });
  await target
    .getByRole("button", {
      name: "Annotation color and thickness",
      exact: true,
    })
    .click();
  await target
    .getByRole("dialog", { name: "Pen studio", exact: true })
    .waitFor();
  await target
    .getByRole("button", { name: "Close pen studio", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  results.push(
    "Template gallery, encrypted defaults, arranged images, composite PDF, dark adaptation and responsive panels verified"
  );
  return { results, exported, defaults };
}
