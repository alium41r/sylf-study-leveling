// Minimum global crypto surface shared Sylf code expects on Hermes (e.g. lib/notes/ink.ts uses crypto.randomUUID).
import * as ExpoCrypto from "expo-crypto";

const g = globalThis as { crypto?: Partial<Crypto> };
g.crypto ??= {};
g.crypto.getRandomValues ??= ((array: Uint8Array) => ExpoCrypto.getRandomValues(array)) as Crypto["getRandomValues"];
g.crypto.randomUUID ??= (() => ExpoCrypto.randomUUID()) as Crypto["randomUUID"];
