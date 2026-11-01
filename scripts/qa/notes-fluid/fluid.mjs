import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
export default async function fluid(_page, { evidence }) {
  const browser = _page.context().browser();
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .at(-1);
  const libState = await page.evaluate(async () => {
    const l = window.qa.library,
      n = l.snapshot().notes[0];
    await l.flushEditors();
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push(await l.addPage(n.id));
    await l.refresh();
    return {
      id: n.id,
      pages: l.snapshot().notes[0].view.descriptor.pages.map((p) => p.pageId),
    };
  });
  await page.getByRole("button", { name: "Text mode", exact: true }).click();
  const scroller = page.getByRole("region", { name: "Notebook scroll area" });
  const scroll = page.locator('[aria-label="Notebook scroll area"]');
  await scroll.evaluate((e) => {
    e.scrollTop = 1100;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: evidence + "continuous-desktop.png" });
  const rendered = await page.locator("[data-notebook-page]").count();
  assert(rendered <= 4);
  const second = page.locator(`[data-notebook-page="${libState.pages[1]}"]`);
  await second.locator('.bn-editor[contenteditable="true"]').first().click();
  await page.keyboard.type("Second page searchable αβγ – 東京 😀");
  await page
    .getByRole("button", { name: "Page content layers", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("button", { name: "Select page content", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Destination page", exact: true })
    .selectOption(libState.pages[2]);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByText("Moved to page 3.", { exact: true }).waitFor();
  await page.screenshot({ path: evidence + "cross-page-arrangement.png" });
  await page
    .getByRole("button", { name: "Close arrange content", exact: true })
    .click();
  const moved = await page.evaluate(async ({ id, pages }) => {
    const l = window.qa.library;
    const source = await l.open(id, pages[1], "text"),
      target = await l.open(id, pages[2], "text");
    const p = l.snapshot().notes[0].view.descriptor.pages[2];
    const b = new window.qa.PageBoxes(target.stream.doc, p, () => false);
    const extra = b.boxes().find((box) => box.id !== "body");
    const value = {
      source: source.stream.doc.getXmlFragment("body").toString(),
      target: extra && target.stream.doc.getXmlFragment(extra.id).toString(),
      boxes: b.boxes().length,
    };
    b.close();
    source.release();
    target.release();
    return value;
  }, libState);
  assert(moved.target.includes("Second page searchable"));
  assert(!moved.source.includes("Second page searchable"));
  await page
    .getByRole("button", { name: "Page content layers", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Selection page", exact: true })
    .selectOption(libState.pages[0]);
  await page.getByText("Ink 1", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select page content", exact: true })
    .click();
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page
    .getByText("Grouped. Select a member to arrange the group.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("spinbutton", { name: "Selection X", exact: true })
    .fill("40");
  await page
    .getByRole("spinbutton", { name: "Selection Y", exact: true })
    .fill("50");
  await page.getByRole("button", { name: "Set position", exact: true }).click();
  await page.getByText("Position updated.", { exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Selection page", exact: true })
    .selectOption(libState.pages[2]);
  await page.getByText("Text box 2", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Select page content", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Destination page", exact: true })
    .selectOption(libState.pages[3]);
  await page.screenshot({ path: evidence + "mixed-cross-page-selection.png" });
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByText("Copied to page 4.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close arrange content", exact: true })
    .click();
  const third = page.locator(`[data-notebook-page="${libState.pages[2]}"]`);
  await page
    .getByRole("button", { name: "Next paper page", exact: true })
    .click();
  await third.locator('.bn-editor[contenteditable="true"]').nth(1).click();
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.keyboard.type(" Contextual formatting stays here.");
  const contextOwnership = await page.evaluate(async ({ id, pages }) => {
    const l = window.qa.library;
    await l.flushEditors();
    const source = await l.open(id, pages[2], "text"),
      p = l.snapshot().notes[0].view.descriptor.pages[2];
    const boxes = new window.qa.PageBoxes(source.stream.doc, p, () => false);
    const extra = boxes.boxes().find((b) => b.id !== "body");
    const value = {
      extra: source.stream.doc.getXmlFragment(extra.id).toString(),
      body: source.stream.doc.getXmlFragment("body").toString(),
    };
    boxes.close();
    source.release();
    return value;
  }, libState);
  assert(contextOwnership.extra.includes("Contextual formatting stays here."));
  assert(!contextOwnership.body.includes("Contextual formatting stays here."));
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Template name", exact: true })
    .fill("Lecture paper");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lecture paper saved template", exact: true })
    .waitFor();
  await page.screenshot({ path: evidence + "saved-paper-template.png" });
  await page
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();
  await page.evaluate(async () => {
    await window.qa.library.flushEditors();
    await window.qa.library.refresh();
  });
  const exported = await page.evaluate(async ({ id }) => {
    const bytes = await window.qa.renderDrivePdf(
      window.qa.library.repository,
      id
    );
    const pdf = await window.qa.inspectPdf(bytes);
    const opened = await window.qa.openPdf(bytes),
      texts = [];
    try {
      for (let i = 1; i <= opened.doc.numPages; i++) {
        const p = await opened.doc.getPage(i);
        texts.push(
          (await p.getTextContent()).items
            .map((item) => item.str || "")
            .join("")
        );
        p.cleanup();
      }
    } finally {
      await opened.close();
    }
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { bytes: bytes.length, pdf, texts, base64: btoa(binary) };
  }, libState);
  writeFileSync(
    evidence + "searchable-copy.pdf",
    Buffer.from(exported.base64, "base64")
  );
  delete exported.base64;
  assert.equal(exported.pdf[0].width, 600);
  assert.equal(exported.pdf[0].height, 825);
  assert(
    exported.texts.join(" ").includes("Second page searchable αβγ – 東京 😀")
  );
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.waitForTimeout(500);
  await page
    .locator("[data-notebook-active=true] .bn-editor")
    .first()
    .waitFor();
  await page.screenshot({ path: evidence + "continuous-tablet.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page
    .locator("[data-notebook-active=true] .bn-editor")
    .first()
    .waitFor();
  await page.screenshot({ path: evidence + "continuous-phone.png" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(500);
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Text mode", exact: true }).click();
  const editor = page
    .locator("[data-notebook-active=true] .bn-editor[contenteditable=true]")
    .last();
  await editor.click();
  const written = await editor.evaluate((element) => ({
    pageId: element.closest("[data-notebook-page]").dataset.notebookPage,
    fragment: element.closest("[data-notes-box]").dataset.notesBox,
  }));
  await page.keyboard.type("Offline local writing survives reconnect.");
  await page.evaluate(() => window.qa.library.flushEditors());
  await page.context().setOffline(false);
  const saved = await page.evaluate(async () => {
    const l = window.qa.library;
    await l.retrySync();
    for (let i = 0; i < 4; i++) {
      await l.synchronize();
      await l.refresh();
      if (l.snapshot().pending <= (l.snapshot().localDrafts || 0)) break;
    }
    return {
      pending: l.snapshot().pending,
      localDrafts: l.snapshot().localDrafts || 0,
    };
  });
  assert(saved.pending <= saved.localDrafts);
  await page.reload();
  await page
    .locator("[data-notebook-active=true] .bn-editor")
    .first()
    .waitFor();
  const recovered = await page.evaluate(
    async ({ id, written }) => {
      const l = window.qa.library,
        source = await l.open(id, written.pageId, "text");
      const value = {
        text: source.stream.doc.getXmlFragment(written.fragment).toString(),
        resumePage: l.snapshot().notes.find((n) => n.id === id).resume?.pageId,
      };
      source.release();
      return value;
    },
    { id: libState.id, written }
  );
  assert(recovered.text.includes("Offline local writing"));
  assert.equal(recovered.resumePage, written.pageId);
  assert(
    (
      await page
        .locator(
          `[data-notebook-page="${written.pageId}"] [data-notes-content="${written.fragment}"] .bn-editor`
        )
        .innerText()
    ).includes("Offline local writing")
  );
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await page
    .getByRole("button", { name: "Lecture paper saved template", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Close page studio", exact: true })
    .click();
  return {
    rendered,
    moved,
    exported,
    offlineReconnect: saved,
    groupedCrossPageCopy: true,
    contextualToolbarOwnership: true,
  };
}
