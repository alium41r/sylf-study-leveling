// Replaces lib0's react-native entry (which needs the unmaintained isomorphic-webcrypto). Yjs needs only getRandomValues.
import * as ExpoCrypto from "expo-crypto";
export const subtle = undefined;
export const getRandomValues = (array) => ExpoCrypto.getRandomValues(array);
