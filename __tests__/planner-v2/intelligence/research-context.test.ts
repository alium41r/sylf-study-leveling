import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readUnderstanding } from '@/lib/planner/v2/server/understanding';
import { understandingInstructions,understandingVerificationPacket } from '@/lib/planner/v2/intelligence/schemas/understanding';
import { extractedClaims,verifyResearch } from '@/lib/planner/v2/intelligence/research-verification';
import { canonicalJson } from '@/lib/planner/v2/server/database';
import { researchFixture } from './research-fixtures';
const folder='documentation/planner/reports/2026-10-28-phase-c-c01-live/evidence/live';
const historical=JSON.parse(readFileSync(`${folder}/journey.json`,'utf8'));
const old=()=>readUnderstanding(historical.attempts[0].payload.understanding);
const trace=(name:string)=>JSON.parse(readFileSync(`${folder}/calls/${name}.json`,'utf8'));
function packet(version?:2){const run=old();if(version)run.input.verificationVersion=version;const batch=run.pending!.action==='COMPLETE'?run.pending!.batches[0]:null;if(!batch)throw new Error('Original COMPLETE not retained');const plan=run.input.plans.find(p=>p.planRef===batch.planRef)!;const sources=run.sources.filter(s=>batch.sourceRefs.includes(s.source.sourceId));return {run,batch,plan,sources,candidates:extractedClaims(sources,batch.extraction)};}
describe('versioned Research context and school mock provenance',()=>{
 it('reads the actual old checkpoint and preserves exact logical-call prompt and packet bytes',()=>{
  const p=packet(),instructions=understandingInstructions(p.run);expect(p.run.input.verificationVersion).toBeUndefined();
  expect(instructions.research).toBe(trace('001-RESEARCH').systemInstruction);expect(instructions.verification).toBe(trace('002-VERIFICATION').systemInstruction);expect(instructions.synthesis).toBe(trace('004-SYNTHESIS').systemInstruction);
  expect(canonicalJson(understandingVerificationPacket(p.run,p.plan,p.batch,p.candidates,p.sources))).toBe(trace('002-VERIFICATION').messages[0].content);
 });
 it('supplies complete exact accepted identity, history, answers and matching selected-document provenance for new verification',()=>{
  const p=packet(2),result=understandingVerificationPacket(p.run,p.plan,p.batch,p.candidates,p.sources);if(!('verificationContext'in result))throw new Error('Expected v2');
  expect(result.verificationContext.acceptedInput).toEqual(p.run.input);expect(JSON.stringify(result.verificationContext.acceptedInput.acceptedRequest)).toContain('Amina');expect(result.verificationContext.sourceAttributions).toHaveLength(3);
  expect(result.verificationContext.sourceAttributions.map(a=>a.contentHash)).toEqual(p.sources.map(s=>s.source.contentHash));expect(result.verificationContext.answers).toEqual(p.run.answers);
  const instructions=understandingInstructions(p.run);expect(instructions.verification).toContain('Keep source-derived claim statements identity-neutral');expect(instructions.verification).toContain('judge literal semantic support separately from authority');expect(instructions.synthesis).toContain('COURSE_OUTCOME');
 });
 it('cannot confer selected-document attribution to a changed hash, foreign ID or public source',()=>{
  const p=packet(2);for(const source of p.sources)source.source.contentHash='f'.repeat(64);
  const result=understandingVerificationPacket(p.run,p.plan,p.batch,p.candidates,p.sources);expect('verificationContext'in result&&result.verificationContext.sourceAttributions).toEqual([]);
 });
 it('keeps local course support separate from private official certification and rejects fabricated excerpts',()=>{
  const {read,extraction,review}=researchFixture();read.source.location={kind:'OWNED_DOCUMENT',ownerId:1,documentId:'00000001-0000-4000-8000-000000000000'};read.source.authority='UNKNOWN';delete read.source.authorityBasis;
  const official=verifyResearch([read],{},extraction,review,undefined,'GENERAL');expect(official.evidence.claims[0].status).toBe('CANDIDATE');expect(official.evidence.completeAssessedScope).toBe(false);
  extraction.identities=[];extraction.claims[0].kind='COURSE_OUTCOME';review.identities=[];review.claims=extractedClaims([read],extraction).map(c=>({claimId:c.claimId,support:'SUPPORTED',applicability:'MATCHED',reason:'The local course explicitly teaches circuit laws'}));
  const local=verifyResearch([read],{},extraction,review,undefined,'GENERAL');expect(local.evidence.claims[0].status).toBe('ADOPTED');expect(local.evidence.sources[0].authority).toBe('UNKNOWN');expect(local.evidence.completeAssessedScope).toBe(false);expect(local.decision).toBeNull();
  expect(verifyResearch([read],{},extraction,review,undefined,'EXAM').decision).toContain('institution');
  extraction.claims[0].excerpt='Invented quotation';review.claims[0].claimId=extractedClaims([read],extraction)[0].claimId;expect(verifyResearch([read],{},extraction,review,undefined,'GENERAL').evidence.claims[0].status).toBe('REJECTED');
 });
});
