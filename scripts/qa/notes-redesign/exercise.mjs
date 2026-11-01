export default async function exercise(page, { evidence }) {
  const target = page
    .context()
    .browser()
    .contexts()
    .flatMap((c) => c.pages())
    .filter((p) => p.url().includes("document="))
    .at(-1);
  const results = [];
  const check = (v, msg) => {
    if (!v) throw new Error(msg);
  };
  const inspect = () =>
    target.evaluate(async () => {
      const l = window.qa.library;
      await l.flushEditors();
      const id = new URLSearchParams(location.hash.split("?")[1]).get(
        "document"
      );
      const v = await l.repository.document(id);
      const p = v.descriptor.pages.find((p) => !p.extensions.archived);
      const source = await l.open(id, p.pageId, "ink");
      const m = new window.qa.InkModel(source.stream.doc);
      const strokes = m.strokes().length;
      m.close();
      source.release();
      return {
        id,
        strokes,
        pages: v.descriptor.pages.length,
        streams: v.descriptor.streams.length,
        origin: p.extensions.textOrigin,
      };
    });
  await target.reload();
  await target.locator(".bn-editor[contenteditable=true]").waitFor();
  check(
    (await target.locator(".bn-editor").innerText()).includes(
      "electromotive force"
    ),
    "Reload lost text"
  );
  check((await inspect()).strokes === 1, "Reload lost ink");
  results.push("Mixed text/ink survives reload");
  for (let i = 0; i < 15; i++)
    await target.getByRole("button", { name: "Zoom out", exact: true }).click();
  check(
    (
      await target
        .getByRole("button", { name: "Fit paper width", exact: true })
        .innerText()
    ).includes("60%"),
    "Desktop zoom minimum"
  );
  for (let i = 0; i < 20; i++)
    await target.getByRole("button", { name: "Zoom in", exact: true }).click();
  check(
    (
      await target
        .getByRole("button", { name: "Fit paper width", exact: true })
        .innerText()
    ).includes("400%"),
    "Zoom maximum"
  );
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  results.push("Bounded 60–400% desktop zoom and fit width");
  await target.getByRole("button", { name: "Text mode", exact: true }).click();
  await target
    .getByRole("button", { name: "Position text on page", exact: true })
    .click();
  await target
    .getByRole("region", { name: "Handwriting paper" })
    .click({ position: { x: 300, y: 320 } });
  await target.waitForFunction(() =>
    window.qa.library
      .snapshot()
      .notes.some((n) =>
        n.view.descriptor.pages.some((p) => p.extensions.textOrigin?.y > 100)
      )
  );
  const positioned = await inspect();
  check(positioned.origin?.y > 100, "Text placement not saved");
  results.push("Positioned rich text on the same ink page");
  await target
    .getByRole("button", { name: "Show notebook pages", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Duplicate paper page", exact: true })
    .click();
  await target.waitForFunction(() =>
    window.qa.library
      .snapshot()
      .notes.some((n) => n.view.descriptor.pages.length === 2)
  );
  check(
    (await target.locator(".bn-editor").innerText()).includes(
      "electromotive force"
    ),
    "Page copy lost text"
  );
  const duplicated = await target.evaluate(async () => {
    const l = window.qa.library;
    await l.flushEditors();
    const n = l.snapshot().notes[0];
    const ids = n.view.descriptor.pages.map((p) => p.extensions.textStreamId);
    return new Set(ids).size === 2;
  });
  check(duplicated, "Page copies share text stream");
  results.push("Independent mixed-layer page duplication");
  await target
    .getByRole("button", { name: "Focus writing", exact: true })
    .click();
  check(
    !(await target
      .getByRole("textbox", { name: "Document title", exact: true })
      .isVisible()),
    "Focus header remains visible"
  );
  await target.keyboard.press("Escape");
  await target
    .getByRole("textbox", { name: "Document title", exact: true })
    .waitFor();
  await target
    .getByRole("button", { name: "Move toolbar", exact: true })
    .click();
  await target.screenshot({
    path: evidence + "editor-desktop-bottom-toolbar.png",
  });
  results.push("Focus mode and bottom toolbar");
  await target
    .getByRole("button", { name: "Move toolbar", exact: true })
    .click();
  await target.setViewportSize({ width: 834, height: 1112 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "light",
      accent: "#28766b",
      background: "#eee8da",
    })
  );
  await target.screenshot({ path: evidence + "editor-tablet-light.png" });
  await target.setViewportSize({ width: 390, height: 844 });
  await target.evaluate(() =>
    window.qa.applyAppearance({
      mode: "dark",
      accent: "#f1b87c",
      background: "#172c30",
    })
  );
  await target
    .getByRole("button", { name: "Fit paper width", exact: true })
    .click();
  await target.screenshot({ path: evidence + "editor-phone-custom-dark.png" });
  check(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    "Phone document overflows viewport"
  );
  await target
    .getByRole("button", { name: "Handwriting mode", exact: true })
    .click();
  await target.getByLabel("Ink color and thickness", { exact: true }).click();
  await target.screenshot({ path: evidence + "ink-options-phone.png" });
  await target
    .getByRole("button", { name: "Close ink options", exact: true })
    .click();
  await target
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await target.getByRole("button", { name: "New note", exact: true }).waitFor();
  await target.screenshot({ path: evidence + "library-phone-custom-dark.png" });
  results.push(
    "Tablet and phone layout, custom appearance, ink options, library return"
  );
  return { results, positioned };
}
