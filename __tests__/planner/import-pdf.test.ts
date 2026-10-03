// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { extractPdfText } from "@/lib/planner/import/pdf";
import { RESEARCH_LIMITS } from "@/lib/planner/research/contracts";

const obj = (num: number, body: string): string => `${num} 0 obj\n${body}\nendobj\n`;

interface PageSpec {
  content: string;
  flate?: boolean;
}

/** A tiny, well-formed single-column PDF with one text content stream per page. */
function buildPdf(pages: PageSpec[], trailer = ""): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const pageCount = pages.length;
  const firstPage = 3;
  const firstStream = firstPage + pageCount;
  const kids = pages.map((_, index) => `${firstPage + index} 0 R`).join(" ");

  parts.push(Buffer.from(obj(1, "<< /Type /Catalog /Pages 2 0 R >>"), "latin1"));
  parts.push(
    Buffer.from(obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`), "latin1")
  );
  pages.forEach((_, index) => {
    parts.push(
      Buffer.from(
        obj(
          firstPage + index,
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${firstStream + index} 0 R >>`
        ),
        "latin1"
      )
    );
  });
  pages.forEach((page, index) => {
    const raw = Buffer.from(page.content, "latin1");
    if (page.flate) {
      const deflated = deflateSync(raw);
      parts.push(
        Buffer.from(
          `${firstStream + index} 0 obj\n<< /Length ${deflated.length} /Filter /FlateDecode >>\nstream\n`,
          "latin1"
        )
      );
      parts.push(deflated);
      parts.push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    } else {
      parts.push(
        Buffer.from(`${firstStream + index} 0 obj\n<< /Length ${raw.length} >>\nstream\n`, "latin1")
      );
      parts.push(raw);
      parts.push(Buffer.from("\nendstream\nendobj\n", "latin1"));
    }
  });
  if (trailer) parts.push(Buffer.from(trailer, "latin1"));
  return Buffer.concat(parts);
}

const show = (word: string): string => `BT /F1 12 Tf 72 720 Td (${word}) Tj ET`;

describe("extractPdfText", () => {
  it("extracts the text of a one-page PDF", async () => {
    const result = await extractPdfText(buildPdf([{ content: show("Cells") }]));
    expect(result.method).toBe("TEXT");
    expect(result.text).toBe("Cells");
    expect(result.pages).toEqual([{ from: 1, to: 1 }]);
    expect(result.partial).toBe(false);
    expect(result.partialReason).toBeNull();
  });

  it("reads both pages of a two-page PDF with correct ranges", async () => {
    const result = await extractPdfText(
      buildPdf([{ content: show("Cells") }, { content: show("Cell division") }])
    );
    expect(result.text).toContain("Cells");
    expect(result.text).toContain("Cell division");
    expect(result.pages).toEqual([{ from: 1, to: 2 }]);
    expect(result.partial).toBe(false);
  });

  it("extracts from a Flate-compressed stream", async () => {
    const result = await extractPdfText(buildPdf([{ content: show("Cells"), flate: true }]));
    expect(result.text).toBe("Cells");
    expect(result.partial).toBe(false);
  });

  it("returns NO_TEXT_LAYER for a PDF with no text instead of throwing", async () => {
    const result = await extractPdfText(
      buildPdf([{ content: "q 0 0 612 792 re W n /Im1 Do Q" }])
    );
    expect(result.text).toBe("");
    expect(result.partial).toBe(true);
    expect(result.partialReason).toBe("NO_TEXT_LAYER");
    expect(result.pages).toEqual([]);
  });

  it("reports an encrypted PDF as ENCRYPTED", async () => {
    const result = await extractPdfText(
      buildPdf(
        [{ content: show("Cells") }],
        "trailer\n<< /Size 8 /Root 1 0 R /Encrypt 7 0 R >>\nstartxref\n0\n%%EOF\n"
      )
    );
    expect(result.partial).toBe(true);
    expect(result.partialReason).toBe("ENCRYPTED");
    expect(result.text).toBe("");
  });

  it("returns UNPARSEABLE for a truncated or garbage buffer without throwing", async () => {
    const garbage = await extractPdfText(Buffer.from("this is definitely not a pdf", "latin1"));
    expect(garbage.partial).toBe(true);
    expect(["UNPARSEABLE", "NO_TEXT_LAYER"]).toContain(garbage.partialReason);

    const truncated = await extractPdfText(
      Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog", "latin1")
    );
    expect(truncated.partial).toBe(true);
    expect(["UNPARSEABLE", "NO_TEXT_LAYER"]).toContain(truncated.partialReason);
  });

  it("caps pages and reports PAGE_LIMIT", async () => {
    const result = await extractPdfText(
      buildPdf([{ content: show("One") }, { content: show("Two") }, { content: show("Three") }]),
      { maxPages: 2 }
    );
    expect(result.partial).toBe(true);
    expect(result.partialReason).toBe("PAGE_LIMIT");
    expect(result.pages).toEqual([{ from: 1, to: 2 }]);
    expect(result.text).toContain("One");
    expect(result.text).not.toContain("Three");
  });

  it("bounds extracted text and reports TEXT_LIMIT", async () => {
    const longWord = "A".repeat(RESEARCH_LIMITS.extractedChars + 100);
    const result = await extractPdfText(buildPdf([{ content: show(longWord) }]));
    expect(result.partial).toBe(true);
    expect(result.partialReason).toBe("TEXT_LIMIT");
    expect(result.text).toHaveLength(RESEARCH_LIMITS.extractedChars);
  });

  it("admits an unreadable middle page as PAGES_UNREADABLE with gap-free ranges", async () => {
    const result = await extractPdfText(
      buildPdf([{ content: show("One") }, { content: "q Q" }, { content: show("Three") }])
    );
    expect(result.partial).toBe(true);
    expect(result.partialReason).toBe("PAGES_UNREADABLE");
    expect(result.pages).toEqual([{ from: 1, to: 1 }, { from: 3, to: 3 }]);
  });
});
