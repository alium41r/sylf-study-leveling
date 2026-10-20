/** Isolated QA entry: real shared UI, repository and transport; synthetic HTTP is supplied by Playwright. Never imported by production. */
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { NavigationProvider } from "@/mobile/src/adapters/navigation/NavigationContext";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/app/components/AuthProvider";
import {
  GlobalSystemWrapper,
  applyAppearance,
} from "@/app/components/GlobalSystemWrapper";
import { SylfAppShell } from "@/app/components/SylfAppShell";
import DangerZone from "@/app/settings/account/DangerZone";
import { usePathname } from "@/mobile/src/adapters/navigation/next-navigation";
import NotesScreen from "@/app/notes/components/NotesScreen";
import { NotesLibrary } from "@/lib/notes/library";
import { exportNotes, importNotes } from "@/lib/notes/portable";
import { initialRichTextUpdate } from "@/lib/notes/blocknote-adapter";
import { retainedNotesRecovery } from "@/lib/notes/engine";
import { InkModel } from "@/lib/notes/ink";
import { InkRenderer } from "@/lib/notes/ink-renderer";
import * as Y from "yjs";
import "@/app/globals.css";
const qa = window as unknown as { qa: Record<string, unknown> };
qa.qa = {
  InkModel,
  InkRenderer,
  Y,
  exportNotes,
  importNotes,
  retainedNotesRecovery,
  initialRichTextUpdate,
  applyAppearance,
};
const unlock = NotesLibrary.unlock;
NotesLibrary.unlock = async (...args) => {
  const lib = await unlock(...args);
  qa.qa.library = lib;
  return lib;
};
const put = IDBObjectStore.prototype.put,
  add = IDBObjectStore.prototype.add;
IDBObjectStore.prototype.put = function (...args) {
  if (qa.qa.quota && this.name === "journal")
    throw new DOMException("QA quota fault", "QuotaExceededError");
  return put.apply(this, args);
};
IDBObjectStore.prototype.add = function (...args) {
  if (qa.qa.quota && this.name === "journal")
    throw new DOMException("QA quota fault", "QuotaExceededError");
  return add.apply(this, args);
};
function Access() {
  const auth = useAuth(),
    path = usePathname();
  useEffect(() => {
    qa.qa.auth = auth;
  }, [auth]);
  return path === "/settings/account-danger" ? <DangerZone /> : <NotesScreen />;
}
createRoot(document.getElementById("root")!).render(
  <NavigationProvider initialPath="/notes">
    <ThemeProvider>
      <AuthProvider>
        <GlobalSystemWrapper>
          <SylfAppShell>
            <Access />
          </SylfAppShell>
        </GlobalSystemWrapper>
      </AuthProvider>
    </ThemeProvider>
  </NavigationProvider>
);
