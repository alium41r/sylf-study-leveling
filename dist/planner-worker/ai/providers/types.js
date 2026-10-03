"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMProviderError = void 0;
class LLMProviderError extends Error {
    provider;
    originalError;
    code;
    constructor(provider, message, originalError, code) {
        super(message);
        this.name = "LLMProviderError";
        this.provider = provider;
        this.originalError = originalError;
        this.code = code;
    }
}
exports.LLMProviderError = LLMProviderError;
