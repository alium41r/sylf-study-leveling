"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchResultCacheKey = researchResultCacheKey;
exports.boundedResearchCache = boundedResearchCache;
exports.cachedPublicSource = cachedPublicSource;
const redis_1 = require("../../../redis");
const documents_1 = require("../server/documents");
const database_1 = require("../server/database");
function researchResultCacheKey(ownerId, intents, sources, extraction) {
    return `planner:v2:research:owner:${ownerId}:${(0, database_1.hash)("research-cache-v1", { intents, extraction, sources: sources.map(s => ({ location: s.source.location, contentHash: s.source.contentHash, sectionsDigest: (0, database_1.hash)("selected-source-text", s.sections), extraction: s.source.extraction })) })}`;
}
/** Keep individual values bounded even in the existing in-process fallback. */
async function boundedResearchCache(key, ttl, load) {
    let computed;
    let large = false;
    try {
        return await (0, redis_1.cachedWithRedis)(key, ttl, async () => { computed = await load(); if (Buffer.byteLength(JSON.stringify(computed)) > 256 * 1024) {
            large = true;
            throw new Error("RESEARCH_VALUE_NOT_CACHED");
        } return computed; });
    }
    catch (error) {
        if (large)
            return computed;
        throw error;
    }
}
async function cachedPublicSource(url, load) {
    const key = `planner:v2:source:${(0, database_1.hash)("public-source-url", url)}`;
    const loader = async () => { const fetched = await load(); if (!fetched.rawBytes)
        throw new Error("SOURCE_BYTES_REQUIRED"); return { fetched: { ...fetched, rawBytes: undefined }, base64: Buffer.from(fetched.rawBytes).toString("base64"), contentHash: (0, documents_1.documentContentHash)(fetched.rawBytes), retrievedAt: new Date().toISOString() }; };
    let receipt = await boundedResearchCache(key, 900, loader);
    const valid = () => receipt && typeof receipt.base64 === "string" && receipt.base64.length <= 4 * 1024 * 1024 && (0, documents_1.documentContentHash)(Buffer.from(receipt.base64, "base64")) === receipt.contentHash && Number.isFinite(Date.parse(receipt.retrievedAt)) && Date.now() - Date.parse(receipt.retrievedAt) <= 900000;
    if (!valid()) {
        await (0, redis_1.invalidateRedisKeys)(key);
        receipt = await loader();
    }
    return { ...receipt.fetched, rawBytes: new Uint8Array(Buffer.from(receipt.base64, "base64")), retrievedAt: receipt.retrievedAt };
}
