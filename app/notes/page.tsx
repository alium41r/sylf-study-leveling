import { Suspense } from "react";
import NotesScreen from "./components/NotesScreen";
export default function NotesPage() {
  return (
    <Suspense fallback={<p role="status">Loading Notes…</p>}>
      <NotesScreen />
    </Suspense>
  );
}
