// Record what the JS engine provides natively, then add the minimum crypto surface shared Sylf code expects.
import * as ExpoCrypto from "expo-crypto";
const g = globalThis as any;
g.__nativeRuntime = { crypto: typeof g.crypto, subtle: typeof g.crypto?.subtle, randomUUID: typeof g.crypto?.randomUUID, getRandomValues: typeof g.crypto?.getRandomValues, TextEncoder: typeof g.TextEncoder, TextDecoder: typeof g.TextDecoder, structuredClone: typeof g.structuredClone, ReadableStream: typeof g.ReadableStream, atob: typeof g.atob };
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = (a: any) => ExpoCrypto.getRandomValues(a);
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => ExpoCrypto.randomUUID();
