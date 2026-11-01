// Replaces lib0's react-native entry (which imports the unmaintained isomorphic-webcrypto) on Android/iOS.
// Yjs only needs getRandomValues; Hermes has no global crypto (Phase 2 report §5.1).
import * as ExpoCrypto from "expo-crypto";

export const subtle = undefined;
export const getRandomValues = <T extends Uint8Array>(array: T): T => ExpoCrypto.getRandomValues(array);
