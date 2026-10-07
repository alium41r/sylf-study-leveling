import { z } from "zod";
import { ResearchEvidenceV2Schema, EvidenceSourceV2Schema, type AssessmentProfileV2, type ResearchEvidenceV2, type CanonicalIntentV2 } from "../contracts";
import { classifyHost, resolveAuthorities } from "../../research/authority";
import { verifyExcerpt } from "../../research/evidence-runtime";
import { hash, reject } from "../server/database";
import { assessmentFields, type ResearchExtraction, type ResearchReview } from "./schemas/research-model";

export const ReadSourceSchema = z.strictObject({ source:EvidenceSourceV2Schema,
  sections:z.array(z.strictObject({page:z.number().int().positive().optional(),section:z.string().min(1).max(200),text:z.string().max(72000)})).max(40),
});
export type ReadSource = z.infer<typeof ReadSourceSchema>;
export const assessmentEqual=(left:string,right:string)=>left.trim().replace(/\s+/g," ").toLowerCase()===right.trim().replace(/\s+/g," ").toLowerCase();
export function sourceAuthority(finalUrl:string, assessment:AssessmentProfileV2) {
  const target={goal:assessment.institution??"",board:assessment.institution,level:assessment.qualification};
  const official=classifyHost(new URL(finalUrl).hostname,target)==="OFFICIAL";
  return {authority:official?"VERIFIED_OFFICIAL" as const:"SECONDARY" as const,
    ...(official?{authorityBasis:`Final host matches the issuer-specific registry: ${resolveAuthorities(target).hosts.join(", ")}`}: {})};
}
export function anchoredExcerpt(source:ReadSource, anchor:{page?:number;section?:string}, excerpt:string) {
  const sections=source.sections.filter(s=>(anchor.page===undefined || s.page===anchor.page) && (anchor.section===undefined || s.section===anchor.section));
  if(sections.length!==1) return null;
  const checked=verifyExcerpt({sourceText:sections[0].text,excerpt});
  return checked.ok && checked.excerpt.length<=2000?checked.excerpt:null;
}
export function extractedClaims(read:readonly ReadSource[], extraction:ResearchExtraction) {
  const claims:ResearchEvidenceV2["claims"]=[];
  for(const proposed of extraction.claims) {
    const source=read.find(s=>s.source.sourceId===proposed.sourceId);
    if(!source) reject("INVALID_OUTPUT","Extraction referenced an unfetched source.","RESEARCH");
    const excerpt=anchoredExcerpt(source,proposed.anchor,proposed.excerpt);
    const claimId=`claim_${hash("research-claim",{sourceId:proposed.sourceId,statement:proposed.statement,excerpt:excerpt??proposed.excerpt,anchor:proposed.anchor,kind:proposed.kind}).slice(0,24)}`;
    if(claims.some(c=>c.claimId===claimId)) continue;
    claims.push({...proposed,claimId,excerpt:excerpt??proposed.excerpt,verification:{excerpt:excerpt?"VERIFIED":"UNVERIFIED",support:"UNCERTAIN",applicability:"UNCERTAIN"},status:"CANDIDATE"});
  }
  return claims;
}
/** Semantic support belongs to the independent AI review. Literal quotation,
 * selected-page provenance, accepted identity and issuer authority are server facts. */
export function verifyResearch(read:readonly ReadSource[], assessment:AssessmentProfileV2, extraction:ResearchExtraction, review:ResearchReview, scope?:CanonicalIntentV2["scope"],policy:CanonicalIntentV2["policy"]=assessment.qualification||assessment.syllabusCode?"EXAM":"GENERAL") {
  const candidates=extractedClaims(read,extraction);
  if(new Set(review.claims.map(c=>c.claimId)).size!==review.claims.length || review.claims.length!==candidates.length || review.claims.some(c=>!candidates.some(p=>p.claimId===c.claimId))) reject("INVALID_OUTPUT","Verification must account for every extracted claim exactly once.","RESEARCH");
  if(new Set(extraction.identities.map(i=>i.sourceId)).size!==extraction.identities.length || new Set(review.identities.map(i=>i.sourceId)).size!==review.identities.length || extraction.identities.some(i=>!read.some(s=>s.source.sourceId===i.sourceId)) || review.identities.some(i=>!extraction.identities.some(e=>e.sourceId===i.sourceId))) reject("INVALID_OUTPUT","Invalid source identity correspondence.","RESEARCH");
  const gaps=[...extraction.gaps,...review.conflicts]; const matches=new Map<string,"MATCHED"|"MISMATCHED"|"UNCERTAIN">();
  const missingSelectors=new Set<string>();
  const sources=read.map(({source,...data})=>{
    const identity=extraction.identities.find(i=>i.sourceId===source.sourceId); const verified=review.identities.find(i=>i.sourceId===source.sourceId);
    const applicable:AssessmentProfileV2={};
    if(identity && new Set(identity.fields.map(f=>f.field)).size!==identity.fields.length || verified && new Set(verified.fields.map(f=>f.field)).size!==verified.fields.length) reject("INVALID_OUTPUT","Duplicate applicability fields.","RESEARCH");
    for(const field of identity?.fields??[]) if(verified?.fields.some(v=>v.field===field.field && v.supported) && anchoredExcerpt({source,...data},field.anchor,field.excerpt)) applicable[field.field]=field.value;
    const known=assessmentFields.filter(f=>assessment[f]);
    const mismatched=known.some(f=>applicable[f] && !assessmentEqual(applicable[f]!,assessment[f]!));
    const selectors=policy==="EXAM"?(["component","examinationCycle","programme","variant","selectedSubset"] as const).filter(f=>applicable[f]&&!assessment[f]):[];
    selectors.forEach(f=>missingSelectors.add(f));
    const enough=selectors.length===0 && (policy!=="EXAM" || !!assessment.institution && !!(assessment.qualification||assessment.programme)) && known.every(f=>applicable[f] && assessmentEqual(applicable[f]!,assessment[f]!));
    matches.set(source.sourceId,mismatched?"MISMATCHED":enough?"MATCHED":"UNCERTAIN");
    return {...source,applicability:applicable};
  });
  const claims=candidates.map(candidate=>{
    const checked=review.claims.find(c=>c.claimId===candidate.claimId)!;const source=sources.find(s=>s.sourceId===candidate.sourceId)!;
    const deterministic=matches.get(candidate.sourceId)!;
    const applicability=deterministic==="MISMATCHED" || checked.applicability==="MISMATCHED"?"MISMATCHED" as const:deterministic==="MATCHED" && checked.applicability==="MATCHED"?"MATCHED" as const:"UNCERTAIN" as const;
    const verified=candidate.verification.excerpt==="VERIFIED" && checked.support==="SUPPORTED" && applicability==="MATCHED";
    // Recommendations never become certified assessed scope. Secondary documents
    // may support resources/outcomes; only the governing issuer certifies assessment facts.
    const officialRequired=["ASSESSED_SCOPE","ASSESSMENT_STRUCTURE","WEIGHTING"].includes(candidate.kind);
    const adopted=verified && (!officialRequired || !!assessment.institution&&!!(assessment.qualification||assessment.programme)) && candidate.kind!=="PREREQUISITE_RECOMMENDATION" && (!officialRequired || source.authority==="VERIFIED_OFFICIAL");
    return {...candidate,verification:{excerpt:candidate.verification.excerpt,support:checked.support,applicability},status:adopted?"ADOPTED" as const:checked.support==="UNSUPPORTED"||applicability==="MISMATCHED"||candidate.verification.excerpt==="UNVERIFIED"?"REJECTED" as const:"CANDIDATE" as const,...(!adopted?{uncertainty:checked.reason}: {})};
  });
  for(const source of sources) if(source.extraction.status==="PARTIAL") gaps.push(...source.extraction.gaps);
  if(!claims.some(c=>c.kind==="ASSESSED_SCOPE" && c.status==="ADOPTED")) gaps.push("No issuer-verified applicable assessed scope was established.");
  const unresolvedGaps=[...new Set(gaps)].slice(0,20);
  const completeSources=sources.filter(s=>s.authority==="VERIFIED_OFFICIAL" && s.extraction.status==="COMPLETE_RELEVANT_SECTIONS" && matches.get(s.sourceId)==="MATCHED" && extraction.completeSourceIds.includes(s.sourceId) && review.completeSourceIds.includes(s.sourceId));
  const completeAssessedScope=unresolvedGaps.length===0 && completeSources.some(s=>claims.some(c=>c.sourceId===s.sourceId && c.kind==="ASSESSED_SCOPE" && c.status==="ADOPTED")) && claims.filter(c=>c.kind==="ASSESSED_SCOPE").every(c=>c.status==="ADOPTED");
  const scopeBindings=review.scopeBindings??[];
  if(scope) {
    const applicable=claims.filter(c=>["ASSESSED_SCOPE","COURSE_OUTCOME"].includes(c.kind)&&c.status==="ADOPTED");
    if(new Set(scopeBindings.map(b=>b.claimId)).size!==scopeBindings.length || applicable.some(c=>!scopeBindings.some(b=>b.claimId===c.claimId)) || scopeBindings.some(b=>!claims.some(c=>c.claimId===b.claimId)||new Set(b.scopeRefs).size!==b.scopeRefs.length||b.scopeRefs.some(ref=>!scope.some(s=>s.modelRef===ref)))) reject("INVALID_OUTPUT","Review must map applicable assessed claims to accepted scope and exclusions.","RESEARCH");
    if(scopeBindings.some(b=>b.disposition==="ANNOTATE_SCOPE"&&!b.scopeRefs.length))reject("INVALID_OUTPUT","Scope annotations require accepted references.","RESEARCH");
  }
  const evidence=ResearchEvidenceV2Schema.parse({schemaVersion:2,assessment,sources,claims,completeAssessedScope,unresolvedGaps});
  const assessedClaims=new Set(claims.filter(c=>c.kind==="ASSESSED_SCOPE"&&c.status==="ADOPTED").map(c=>c.claimId));
  const coveredScope=new Set(scopeBindings.filter(b=>assessedClaims.has(b.claimId)&&["ANNOTATE_SCOPE","ADD_SCOPE"].includes(b.disposition)).flatMap(b=>b.scopeRefs));
  const uncoveredRequested=scope?.filter(s=>s.inclusion==="REQUESTED"&&!coveredScope.has(s.modelRef))??[];
  // Applicability is a server-verified fact. An empty model conflict list cannot
  // authorize planning around missing assessment support as learner homework.
  // Partial but applicable evidence may cover a selected subset; complete-source
  // certification and AI-suggested prerequisites are separate questions.
  const decision=review.conflicts.length?review.conflicts[0]:policy==="EXAM" && missingSelectors.size?`Which ${[...missingSelectors].join(", ")} applies? The retrieved specification constrains these fields and the student has not selected them.`:policy==="EXAM" && (!assessment.institution || !(assessment.qualification||assessment.programme))?"Which institution and qualification or programme does this assessment use? This determines which sources and scope apply.":policy==="EXAM"&&(!assessedClaims.size||uncoveredRequested.length)?`The read sources have not established issuer-verified applicable assessed scope${uncoveredRequested.length?` for ${uncoveredRequested.length} requested scope node(s)`:""}. Provide the governing assessment content or explicitly revise the accepted assessment/subset before planning.`:null;
  return {evidence,decision,answer:review.answer,scopeBindings};
}
