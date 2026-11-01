import { PDFName, PDFString, type PDFDocument, type PDFPage } from "pdf-lib";

export type SearchTextRun = {
  text: string;
  x: number;
  top: number;
  size: number;
  width: number;
};
const hex = (n: number) => n.toString(16).padStart(4, "0").toUpperCase();
const unicode = (text: string) =>
  Array.from({ length: text.length }, (_, i) => hex(text.charCodeAt(i))).join(
    ""
  );
/** Invisible Unicode text aligned with the browser's exact print runs. The visual
 * page stays faithful to browser shaping/fonts; ToUnicode supplies copy/search
 * without downloading fonts, substituting glyphs, or rewriting native content. */
export class PdfSearchText {
  private readonly codes = new Map<string, number>();
  private readonly cmap;
  private readonly font;
  constructor(private readonly output: PDFDocument) {
    const c = output.context;
    this.cmap = c.nextRef();
    const descriptor = c.register(
      c.obj({
        Type: "FontDescriptor",
        FontName: "SylfSearchText",
        Flags: 4,
        FontBBox: [0, -200, 1000, 900],
        ItalicAngle: 0,
        Ascent: 800,
        Descent: -200,
        CapHeight: 700,
        StemV: 80,
      })
    );
    const cid = c.register(
      c.obj({
        Type: "Font",
        Subtype: "CIDFontType2",
        BaseFont: "SylfSearchText",
        CIDSystemInfo: {
          Registry: PDFString.of("Adobe"),
          Ordering: PDFString.of("Identity"),
          Supplement: 0,
        },
        FontDescriptor: descriptor,
        DW: 1000,
        CIDToGIDMap: "Identity",
      })
    );
    this.font = c.register(
      c.obj({
        Type: "Font",
        Subtype: "Type0",
        BaseFont: "SylfSearchText",
        Encoding: "Identity-H",
        DescendantFonts: [cid],
        ToUnicode: this.cmap,
      })
    );
  }
  add(
    page: PDFPage,
    runs: SearchTextRun[],
    logicalWidth: number,
    logicalHeight: number,
    top = 0,
    matrix?: number[]
  ) {
    const font = page.node.newFontDictionary("SylfText", this.font);
    const sx = matrix ? 1 : page.getWidth() / logicalWidth,
      sy = matrix ? 1 : page.getHeight() / logicalHeight;
    const commands = [
      "q",
      ...(matrix ? [matrix.join(" ") + " cm"] : []),
      "BT",
      "3 Tr",
    ];
    for (const run of runs) {
      if (
        !run.text ||
        run.top + run.size * 0.8 < top ||
        run.top + run.size * 0.8 >= top + logicalHeight
      )
        continue;
      const chars = [...run.text];
      const encoded = chars
        .map((char) => {
          if (!this.codes.has(char)) this.codes.set(char, this.codes.size + 1);
          if (this.codes.size > 65534)
            throw new Error(
              "PDF text exceeds its unique-character budget. Originals are retained."
            );
          return hex(this.codes.get(char)!);
        })
        .join("");
      const horizontal = run.width / (chars.length * run.size);
      commands.push(
        `${font.toString()} ${run.size.toFixed(4)} Tf`,
        `${(horizontal * sx).toFixed(6)} 0 0 ${sy.toFixed(6)} ${(run.x * sx).toFixed(4)} ${((matrix ? 0 : page.getHeight()) - (run.top - top + run.size * 0.8) * sy).toFixed(4)} Tm`,
        `<${encoded}> Tj`
      );
    }
    commands.push("ET", "Q");
    page.node.addContentStream(
      this.output.context.register(
        this.output.context.flateStream(commands.join("\n"))
      )
    );
  }
  finish() {
    const entries = [...this.codes].map(
      ([char, cid]) => `<${hex(cid)}> <${unicode(char)}>`
    );
    const chunks: string[] = [];
    for (let i = 0; i < entries.length; i += 100) {
      const batch = entries.slice(i, i + 100);
      chunks.push(
        `${batch.length} beginbfchar\n${batch.join("\n")}\nendbfchar`
      );
    }
    const source = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SylfUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
    this.output.context.assign(
      this.cmap,
      this.output.context.flateStream(source, { Type: PDFName.of("CMap") })
    );
  }
}
