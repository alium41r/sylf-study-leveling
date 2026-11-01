import { indexPdf,selectPdfPages,extractSelectedPdfPages } from "../../import/pdf-runtime";
import { htmlToText } from "../../research/search/fetch-runtime";
import { documentContentHash } from "../server/documents";
import type { AssessmentProfileV2, ResearchEvidenceV2 } from "../contracts";
import { sourceAuthority, type ReadSource } from "./research-verification";

export async function readResearchSource(input:{sourceId:string;location:ResearchEvidenceV2["sources"][number]["location"];title:string;bytes:Uint8Array;mime:string;assessment:AssessmentProfileV2;
  selectionTerms?:string[];pages?:number[];characterWindow?:{start:number;end:number};remainingPages:number;remainingCharacters:number;retrievedAt:string;partial?:boolean;ocr?:(pages:number[])=>Promise<{page:number;text:string}[]>}) {
  const terms=["contents","assessment","syllabus","weights","scheme",...(input.selectionTerms??Object.values(input.assessment))].filter(Boolean);
  let sections:ReadSource["sections"]=[];const gaps:string[]=[];let selectedPages:number[]=[];const ocrPages:number[]=[];
  if(input.mime.includes("pdf") || Buffer.from(input.bytes).subarray(0,1024).toString("latin1").includes("%PDF-")) {
    const index=indexPdf(Buffer.from(input.bytes));
    if(input.remainingPages<Math.min(2,index.totalPages)) throw new Error("PDF_INDEX_PAGE_BUDGET");
    if(input.pages && (new Set(input.pages).size!==input.pages.length||input.pages.length>input.remainingPages||input.pages.some(p=>!Number.isInteger(p)||p<1||p>index.totalPages)))throw new Error("PDF_SELECTION_INVALID");
    const chosen=input.pages?{selected:input.pages,omitted:Array.from({length:index.totalPages},(_,i)=>i+1).filter(p=>!input.pages!.includes(p))}:selectPdfPages(index,terms,[],Math.min(40,input.remainingPages)); selectedPages=chosen.selected;
    if(chosen.omitted.length) gaps.push(`${chosen.omitted.length} relevant/index pages omitted by the root page ceiling; includes page ${chosen.omitted[0]}.`);
    const result=extractSelectedPdfPages(Buffer.from(input.bytes),selectedPages,input.remainingCharacters);
    gaps.push(...result.gaps);sections=result.pages.map(p=>({page:p.page,section:p.section.slice(0,200),text:p.text}));
    const unreadable=result.pages.filter(p=>p.unreadable).map(p=>p.page);
    if(unreadable.length && input.ocr) {
      gaps.push("OCR transcription is recorded with page provenance; complete source coverage remains unconfirmed.");
      const transcribed=await input.ocr(unreadable);
      let remaining=input.remainingCharacters-sections.reduce((n,s)=>n+s.text.length,0);
      for(const page of transcribed) {
        const section=sections.find(s=>s.page===page.page);if(!section || !unreadable.includes(page.page)) throw new Error("OCR_NOT_SELECTED");
        ocrPages.push(page.page);section.text=page.text.slice(0,Math.max(0,remaining));remaining-=section.text.length;
        if(section.text) {const at=gaps.indexOf(`Page ${page.page}: unreadable text layer`);if(at>=0)gaps.splice(at,1);}
        if(section.text.length<page.text.length) gaps.push(`Page ${page.page}: OCR character ceiling reached.`);
      }
    }
  } else {
    const decoded=new TextDecoder("utf-8",{fatal:true}).decode(input.bytes);const text=input.mime.includes("html")?htmlToText(decoded):decoded;
    // Select named headings across the document, including late tables. Whole
    // text is used when it fits; prefixes are never certified complete.
    if(input.characterWindow) {
      const {start,end}=input.characterWindow;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length||end-start>input.remainingCharacters)throw new Error("CHARACTER_SELECTION_INVALID");
      sections=[{section:`Characters ${start}-${end}`,text:text.slice(start,end)}];
      if(start>0||end<text.length)gaps.push(`Selected characters ${start}-${end} of ${text.length}; other characters remain unread in this receipt.`);
    } else if(text.length<=input.remainingCharacters) sections=[{section:"Document",text}];
    else {
      const blocks=text.split(/\n\s*\n/);const scored=blocks.map((text,i)=>({text,i,match:terms.some(t=>text.slice(0,300).toLowerCase().includes(t.toLowerCase()))}));
      let available=input.remainingCharacters;
      for(const block of scored.filter(b=>b.match || b.i===0)) {if(available<=0) break;const selected=block.text.slice(0,available);sections.push({section:`Block ${block.i+1}`,text:selected});available-=selected.length;if(sections.length>=40)break;}
      gaps.push(`The character ceiling required targeted blocks from ${text.length} characters; remaining document coverage is unverified.`);
    }
  }
  if(input.partial) gaps.push("The upstream document was truncated before targeted reading.");
  // PDF font decoding and UTF-16 character windows can expose NUL glyphs or
  // split surrogates. JSONB cannot store these. Preserve the original bytes'
  // hash and visible uncertainty instead of dropping/concatenating symbols.
  let replaced=false;
  const representable=(value:string)=>{const next=value.replace(/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"\uFFFD");if(next!==value)replaced=true;return next;};
  sections=sections.map(section=>({...section,section:representable(section.section),text:representable(section.text)}));
  const title=representable(input.title.slice(0,200));
  if(replaced)gaps.push("Extracted text contained NUL or unpaired UTF-16 glyphs, shown as U+FFFD replacement markers. Original source bytes/hash are retained; affected symbols and complete coverage remain unverified.");
  if(!sections.some(s=>s.text.trim())) gaps.push("No readable selected text was established.");
  const authority=input.location.kind==="PUBLIC_URL"?sourceAuthority(input.location.finalUrl,input.assessment):{authority:"UNKNOWN" as const,authorityBasis:"Private ownership and content were verified; issuer authority was not independently established."};
  const source:ReadSource["source"]={sourceId:input.sourceId,location:input.location,title,...authority,retrievedAt:input.retrievedAt,
    contentHash:documentContentHash(input.bytes),applicability:{},extraction:{status:gaps.length?"PARTIAL":"COMPLETE_RELEVANT_SECTIONS",selectedPages,ocrPages,gaps:[...new Set(gaps)].slice(0,20)}};
  return {source,sections};
}
