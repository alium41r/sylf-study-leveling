// @vitest-environment node
import { it,expect } from "vitest";
import { indexPdf,selectPdfPages,extractSelectedPdfPages } from "@/lib/planner/import/pdf-runtime";
import { pdfFixture } from "./research-fixtures";

it("reads a late relevant section instead of the first forty pages",()=>{const bytes=pdfFixture();const index=indexPdf(bytes);const selection=selectPdfPages(index,["Engineering weights"]);expect(selection.selected).toContain(70);expect(selection.selected).not.toContain(40);const result=extractSelectedPdfPages(bytes,selection.selected,72000);expect(result.pages.find(p=>p.page===70)?.text).toContain("Mathematics 40 percent");});
it("discloses required pages omitted by the shared ceiling",()=>{const index=indexPdf(pdfFixture());const selection=selectPdfPages(index,["Engineering weights"],[],2);expect(selection.omitted).toContain(70);expect(selection.selected).toEqual([1,2]);});
it("discloses unreadable, truncated and unindexed sources",()=>{const result=extractSelectedPdfPages(pdfFixture(2),[1,2],5);expect(result.gaps.some(g=>g.includes("character ceiling"))).toBe(true);expect(()=>indexPdf(Buffer.from("%PDF-1.7 /Encrypt 2 0 R"))).toThrow();expect(()=>selectPdfPages(indexPdf(pdfFixture()),[],[100])).toThrow();});
