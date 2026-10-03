"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricedProviderUsage = pricedProviderUsage;
const config_1 = require("./config");
/** Unknown model pricing is unknown spend, never fabricated zero cost. */
function pricedProviderUsage(model, usage) {
    const { promptTokens, completionTokens, cacheHitTokens = 0 } = usage;
    if (![promptTokens, completionTokens, usage.totalTokens, cacheHitTokens].every(n => Number.isSafeInteger(n) && n >= 0) || cacheHitTokens > promptTokens)
        throw new Error("INVALID_PROVIDER_USAGE");
    const rate = config_1.AI_COST_USD_PER_1M[model];
    const known = rate && [rate.input, rate.output, rate.inputCached ?? rate.input].every(n => Number.isFinite(n) && n >= 0);
    return { inputTokens: promptTokens, outputTokens: completionTokens,
        costUsd: known ? ((promptTokens - cacheHitTokens) * rate.input + cacheHitTokens * (rate.inputCached ?? rate.input) + completionTokens * rate.output) / 1e6 : null };
}
