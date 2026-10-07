import { z } from "zod";
import { plannerRoute } from "@/lib/planner/server/http";
import { durablePlanner,requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { reject } from "@/lib/planner/v2/server/database";
export const runtime="nodejs";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
  return plannerRoute(req,async owner=>{
    requireDurablePlannerAdmission();const maximum=3*1024*1024+64*1024;
    if(Number(req.headers.get("content-length")??0)>maximum || !req.body)reject("PAYLOAD_TOO_LARGE","The document upload exceeds its allowance.","RESEARCH");
    const reader=req.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
    try {while(true){req.signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>maximum){await reader.cancel();reject("PAYLOAD_TOO_LARGE","The document upload exceeds its allowance.","RESEARCH");}chunks.push(chunk.value);}} finally{reader.releaseLock();}
    const form=await new Response(Buffer.concat(chunks),{headers:{"content-type":req.headers.get("content-type")??""}}).formData();
    const metadata=z.strictObject({key:z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),title:z.string().trim().min(1).max(200)}).parse({key:form.get("key"),title:form.get("title")});
    const file=form.get("file");if(!file || typeof file==="string" || !["application/pdf","text/plain"].includes(file.type))reject("INVALID_OUTPUT","Choose a PDF or UTF-8 text document.","RESEARCH");
    const saved=await durablePlanner().documents.upload(owner,(await ctx.params).id,metadata.key,metadata.title,file.type as "application/pdf"|"text/plain",new Uint8Array(await file.arrayBuffer()));
    return {documentId:saved.documentId,title:saved.title,mimeType:saved.mimeType,bytes:saved.bytes,contentHash:saved.contentHash,verifiedAt:saved.verifiedAt};
  });
}
