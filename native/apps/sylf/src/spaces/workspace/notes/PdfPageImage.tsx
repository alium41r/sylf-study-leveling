// Tests and type checks only: a blank page. The app resolves the .web or .native renderer.
import { View } from "react-native";
import type { NotesLibrary } from "@sylf/notes";

export interface PdfPageImageProps { library: NotesLibrary; hash: string; index: number; width: number; height: number }
export default function PdfPageImage({ width, height }: PdfPageImageProps) {
  return <View style={{ position: "absolute", left: 0, top: 0, width, height, backgroundColor: "#ffffff" }} />;
}
