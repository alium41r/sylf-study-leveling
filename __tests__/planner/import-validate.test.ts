// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateSyllabusUpload } from "@/lib/planner/import/validate";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

const file = (type: string) => ({ name: "syllabus.pdf", type, size: 0 });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe("validateSyllabusUpload", () => {
  it("accepts a PDF by magic bytes", () => {
    expect(validateSyllabusUpload(file("application/pdf"), Buffer.from("%PDF-1.7\n", "latin1"))).toEqual({
      ok: true,
      kind: "PDF",
      mime: "application/pdf",
    });
  });

  it("accepts a PDF even when the declared MIME is advisory or empty", () => {
    expect(validateSyllabusUpload(file(""), Buffer.from("%PDF-1.4", "latin1"))).toMatchObject({
      ok: true,
      kind: "PDF",
    });
    expect(
      validateSyllabusUpload(file("application/octet-stream"), Buffer.from("%PDF-1.4", "latin1"))
    ).toMatchObject({ ok: true, kind: "PDF" });
  });

  it("rejects a declared MIME that contradicts the sniffed type", () => {
    // Declared image, actually a PDF.
    expect(validateSyllabusUpload(file("image/png"), Buffer.from("%PDF-1.7", "latin1"))).toMatchObject({
      ok: false,
      code: "IMPORT_UNSUPPORTED",
    });
    // Declared PDF, actually an image.
    expect(validateSyllabusUpload(file("application/pdf"), PNG)).toMatchObject({
      ok: false,
      code: "IMPORT_UNSUPPORTED",
    });
    // Declared PNG, actually a JPEG.
    expect(validateSyllabusUpload(file("image/png"), JPEG)).toMatchObject({
      ok: false,
      code: "IMPORT_UNSUPPORTED",
    });
  });

  it("rejects an oversized file as IMPORT_TOO_LARGE", () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    big.write("%PDF-1.7", 0, "latin1");
    expect(validateSyllabusUpload(file("application/pdf"), big)).toMatchObject({
      ok: false,
      code: "IMPORT_TOO_LARGE",
    });
  });

  it("rejects a ZIP, an executable and a DOCX as unsupported", () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK"
    const executable = Buffer.from("MZ\x90\x00\x03", "latin1"); // "MZ"
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]); // DOCX is a ZIP
    for (const buffer of [zip, executable, docx]) {
      expect(validateSyllabusUpload(file(""), buffer)).toMatchObject({
        ok: false,
        code: "IMPORT_UNSUPPORTED",
      });
    }
  });

  it("accepts an image through the existing chat upload gate", () => {
    expect(validateSyllabusUpload(file("image/png"), PNG)).toEqual({
      ok: true,
      kind: "IMAGE",
      mime: "image/png",
    });
  });

  it("accepts a PDF whose header is preceded by up to eight bytes of junk", () => {
    const eight = "        %PDF-1.7"; // exactly eight spaces of leading junk
    expect(validateSyllabusUpload(file("application/pdf"), Buffer.from(eight, "latin1"))).toMatchObject({
      ok: true,
      kind: "PDF",
    });
  });
});
