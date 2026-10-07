import { cachedWithRedis,invalidateRedisKeys } from "../../../redis";
import { documentContentHash } from "../server/documents";
import { hash } from "../server/database";
import type { fetchSource } from "../../research/search/fetch-runtime";
import type { ReadSource } from "./research-verification";

export function researchResultCacheKey(ownerId:number,intents:unknown,sources:readonly ReadSource[],extraction:unknown) {
  return `planner:v2:research:owner:${ownerId}:${hash("research-cache-v1",{intents,extraction,sources:sources.map(s=>({location:s.source.location,contentHash:s.source.contentHash,sectionsDigest:hash("selected-source-text",s.sections),extraction:s.source.extraction}))})}`;
}
/** Keep individual values bounded even in the existing in-process fallback. */
export async function boundedResearchCache<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<T> {
  let computed:T;let large=false;
  try {return await cachedWithRedis(key,ttl,async()=>{computed=await load();if(Buffer.byteLength(JSON.stringify(computed))>256*1024){large=true;throw new Error("RESEARCH_VALUE_NOT_CACHED");}return computed;});}
  catch(error){if(large)return computed!;throw error;}
}
export async function cachedPublicSource(url:string,load:()=>ReturnType<typeof fetchSource>) {
  const key=`planner:v2:source:${hash("public-source-url",url)}`;
  const loader=async()=>{const fetched=await load();if(!fetched.rawBytes)throw new Error("SOURCE_BYTES_REQUIRED");return {fetched:{...fetched,rawBytes:undefined},base64:Buffer.from(fetched.rawBytes).toString("base64"),contentHash:documentContentHash(fetched.rawBytes),retrievedAt:new Date().toISOString()};};
  let receipt=await boundedResearchCache(key,900,loader);
  const valid=()=>receipt && typeof receipt.base64==="string" && receipt.base64.length<=4*1024*1024 && documentContentHash(Buffer.from(receipt.base64,"base64"))===receipt.contentHash && Number.isFinite(Date.parse(receipt.retrievedAt)) && Date.now()-Date.parse(receipt.retrievedAt)<=900000;
  if(!valid()){await invalidateRedisKeys(key);receipt=await loader();}
  return {...receipt.fetched,rawBytes:new Uint8Array(Buffer.from(receipt.base64,"base64")),retrievedAt:receipt.retrievedAt};
}
