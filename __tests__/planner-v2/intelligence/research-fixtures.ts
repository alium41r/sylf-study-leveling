import { sourceAuthority,extractedClaims,type ReadSource } from "@/lib/planner/v2/intelligence/research-verification";
import type { ResearchExtraction,ResearchReview } from "@/lib/planner/v2/intelligence/schemas/research-model";
export function pdfFixture(count=75) {
  const kids=Array.from({length:count},(_,i)=>`${3+i*2} 0 R`).join(" ");let pdf=`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${count} >> endobj\n`;
  for(let i=0;i<count;i++) {const text=i===0?"Contents":i===69?"Engineering weights: Mathematics 40 percent":`Unrelated page ${i+1}`;pdf+=`${3+i*2} 0 obj << /Type /Page /Parent 2 0 R /Contents ${4+i*2} 0 R >> endobj\n${4+i*2} 0 obj << /Length ${text.length+14} >> stream\nBT (${text}) Tj ET\nendstream endobj\n`;}
  pdf+=`900 0 obj << /Title (Engineering weights) /Dest [141 0 R /Fit] >> endobj\n901 0 obj << /Title (Next section) /Dest [145 0 R /Fit] >> endobj\n%%EOF`;return Buffer.from(pdf);
}
export function scannedPdfFixture() {
  return Buffer.from(pdfFixture(8).toString().replace(/BT \([^)]*\) Tj ET/g,"q 0 g 0 0 100 100 re f Q").replace("/Dest [141 0 R","/Dest [3 0 R"));
}
export const assessment={institution:"CAIE",qualification:"A-Level",syllabusCode:"9702",component:"Paper 2",examinationCycle:"2026",selectedSubset:"Electricity"};
export const text="CAIE A-Level Physics 9702 Paper 2 in the examination cycle 2026. Selected assessed subset: Electricity. Explain circuit laws and calculate potential difference.";
export function researchFixture(url="https://cambridgeinternational.org/9702.pdf") {
  const read:ReadSource={source:{sourceId:"source_1",title:"Physics specification",location:{kind:"PUBLIC_URL",finalUrl:url},...sourceAuthority(url,assessment),retrievedAt:"2026-10-04T00:00:00Z",contentHash:"a".repeat(64),applicability:{},extraction:{status:"COMPLETE_RELEVANT_SECTIONS",selectedPages:[70],ocrPages:[],gaps:[]}},sections:[{page:70,section:"Electricity",text}]};
  const extraction:ResearchExtraction={identities:[{sourceId:"source_1",fields:Object.entries(assessment).map(([field,value])=>({field:field as keyof typeof assessment,value,excerpt:text,anchor:{page:70}}))}],claims:[{sourceId:"source_1",kind:"ASSESSED_SCOPE",statement:"Explain circuit laws",excerpt:"Explain circuit laws and calculate potential difference.",anchor:{page:70}}],completeSourceIds:["source_1"],gaps:[],answer:"Review circuit laws"};
  const claims=extractedClaims([read],extraction);
  const review:ResearchReview={scopeBindings:[],followUpClaims:[],followUpIdentities:[],claims:claims.map(c=>({claimId:c.claimId,support:"SUPPORTED",applicability:"MATCHED",reason:"The quotation supports the specified outcome"})),identities:[{sourceId:"source_1",fields:Object.keys(assessment).map(field=>({field:field as keyof typeof assessment,supported:true}))}],completeSourceIds:["source_1"],conflicts:[],answer:"Verified circuit laws apply to this assessment"};
  return {read,extraction,review};
}
