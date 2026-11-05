// Tests and type checks only. The app resolves InkView.web (Pointer Events) or InkView.native (the native pen surface).
import { View } from "react-native";
import type { InkViewProps } from "./ink-types";

export default function InkView({ width, height }: InkViewProps) {
  return <View style={{ width, height }} />;
}
