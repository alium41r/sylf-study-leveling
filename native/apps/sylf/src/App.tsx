// Phase 5: the app opens into the Spaces shell. The Design System Showcase stays behind a development-only entry.
// The foundation report stays: automated checks read SYLF_FOUNDATION and SYLF_WINDOW on every runtime.
import { Suspense, lazy, useEffect, useMemo } from "react";
import { AppState, Dimensions, Linking, useColorScheme, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppearanceProvider, NoticeHost, OverlayHost, createAppearanceStore, useAppearanceStore } from "@sylf/design-system";
import { createAdapters, detectCapabilities, windowSizeClass } from "@sylf/platform";
import { runParitySuite } from "@sylf/shared/parity";
import { availableSpaces, createHomeNavigation, createSpacesStore, createStudySessionModel, createWorkspaceModel, createWorldController } from "@sylf/spaces";
import { HomeNavigationProvider, SpacesProvider, StudySessionProvider, WorkspaceModelProvider, WorldControllerProvider } from "./shell/context";
import { connectBackend, currentBackend, noteForeground, prepareBackend, useBackend, useBackendPhase } from "./shell/backend";
import { DEV_TOOLS, closeShowcase, openProbe, openShowcase, setWorldHostScenario, useDevSurface, worldHostScenario } from "./shell/dev-surface";
import { parseAppLink } from "./shell/links";
import { enableWebDebugging } from "@sylf/native-platform";
import { onForegroundChange } from "./shell/focus/alerts";
import { AccountAccessStatus } from "./shell/account/AccountAccessStatus";
import { flushNotes } from "./shell/notes/library";

const Showcase = lazy(() => import("./showcase/Showcase"));
const AccountGate = lazy(() => import("./shell/account/AccountGate"));
const R15Probe = lazy(() => import("./r15/R15Probe"));

const startedAt = Date.now();
const adapters = createAdapters();
prepareBackend(detectCapabilities());
// Created outside React: it must survive OS-driven root remounts, and the first frame needs the saved theme.
const appearanceStore = createAppearanceStore(adapters.preferences);
const spacesStore = createSpacesStore(adapters.preferences, detectCapabilities().formFactor);
const homeNavigation = createHomeNavigation(spacesStore);
const workspaceModel = createWorkspaceModel(spacesStore);
// The one study session. It is a shell service: it outlives every Space, and every surface that shows it is a view of this object.
const studySession = createStudySessionModel(adapters.preferences, {
  createKey: () => adapters.crypto.randomUUID(),
  ownerId: () => currentBackend()?.auth.getSnapshot().userId ?? null,
  log: (event, detail) => console.log(`SYLF_SESSION ${event} ${JSON.stringify(detail)}`),
});
// Holds no host until someone enters World. The host's code is its own chunk, imported at that moment and at no other.
const worldController = createWorldController(spacesStore, {
  loadHost: () => import("./spaces/world/host/preview").then(({ createPreviewHost }) => createPreviewHost(worldHostScenario() ?? "normal")),
  window: () => Dimensions.get("window"),
  entryAllowed: () => studySession.status() !== "running",
  log: (event, detail) => console.log(`SYLF_WORLD ${event}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`),
});

// Backgrounding is the last reliable moment before the OS may end the process.
AppState.addEventListener("change", (state) => {
  worldController.setForeground(state === "active");
  studySession.setForeground(state === "active");
  void onForegroundChange(state === "active", studySession);
  noteForeground(state === "active");
  if (state === "active") currentBackend()?.wake();
  if (state !== "active") { currentBackend()?.sleep(); homeNavigation.flush(); workspaceModel.flush(); spacesStore.flush(); appearanceStore.flush(); void flushNotes(); }
});
spacesStore.subscribe(() => {
  const { state, world } = spacesStore.getSnapshot();
  // Workspace's snapshot can be large and it changes with every drop, so the log carries a summary of it.
  const windows = (state.snapshots.workspace as { windows?: unknown[] } | undefined)?.windows?.length;
  console.log("SYLF_SPACES " + JSON.stringify({ active: state.activeSpace, returnSpace: state.returnSpace, world, snapshots: { ...state.snapshots, workspace: windows === undefined ? undefined : { windows } } }));
});

function useFoundationReport() {
  const scheme = useColorScheme();
  const { width, height, fontScale } = useWindowDimensions();
  const capabilities = useMemo(() => detectCapabilities(), []);
  useEffect(() => {
    adapters.crypto.sha256Hex(new TextEncoder().encode("sylf")).then((sha256) => {
      const parity = runParitySuite();
      console.log("SYLF_FOUNDATION " + JSON.stringify({
        readyMs: Date.now() - startedAt,
        capabilities,
        scheme,
        spaces: availableSpaces(capabilities.formFactor),
        parity: { passed: parity.every((p) => p.ok), results: parity },
        crypto: { sha256 },
        adapters: { storage: adapters.storage.backend, pdf: adapters.pdf.renderer, session: adapters.session.backgroundSession, secureSession: adapters.secureSession.holder },
      }));
    });
  }, [capabilities]);
  useEffect(() => {
    console.log(`SYLF_WINDOW ${Math.round(width)}x${Math.round(height)} class=${windowSizeClass(width)} fontScale=${fontScale}`);
  }, [width, height, fontScale]);
  return capabilities.formFactor === "desktop" ? "pointer" as const : "touch" as const;
}

/** Joins the backend once the first frame is on screen. A build with none configured sends nothing and loads none of this code. */
function useBackendConnection() {
  useEffect(() => {
    void connectBackend(adapters, detectCapabilities(), studySession);
    const sub = Linking.addEventListener("url", (event) => { currentBackend()?.receiveLink(event.url); });
    return () => sub.remove();
  }, []);
}

function useDevLinks() {
  const appearance = useAppearanceStore();
  useEffect(() => {
    if (!DEV_TOOLS) return;
    enableWebDebugging();
    const apply = (url: string | null | undefined) => {
      const link = parseAppLink(url);
      if (!link) return;
      if (link.theme) appearance.selectTheme(link.theme);
      if (link.mode) appearance.setMode(link.mode);
      if (link.textScale) appearance.setAccess({ textScale: link.textScale });
      if (Object.keys(link.colors).length) appearance.tweak(link.colors);
      if (link.space) spacesStore.select(link.space);
      if (link.home) homeNavigation.select(link.home);
      if (link.worldHost) setWorldHostScenario(link.worldHost);
      if (link.session) studySession.end();
      if (link.sessionLength !== undefined) studySession.setLength(link.sessionLength);
      if (link.session === "running" || link.session === "paused") studySession.start();
      if (link.session === "paused") studySession.pause();
      if (link.worldSky) worldController.updateSnapshot({ sky: link.worldSky });
      if (link.worldSection) worldController.updateSnapshot({ section: link.worldSection });
      if (link.workspaceClear) workspaceModel.clear();
      if (link.workspaceZoom) workspaceModel.zoomTo(link.workspaceZoom);
      link.workspaceOpen.forEach((tool) => workspaceModel.open(tool));
      if (link.workspaceLayout) workspaceModel.setLayout(link.workspaceLayout);
      if (link.probe) openProbe();
      if (link.surface === "showcase") openShowcase(link.chapter);
      if (link.surface === "spaces") closeShowcase();
    };
    void Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener("url", (event) => apply(event.url));
    return () => sub.remove();
  }, [appearance]);
}

function Root() {
  const { showcase, chapter, request, probe } = useDevSurface();
  useDevLinks();
  if (probe) return <Suspense fallback={null}><R15Probe /></Suspense>;
  // The Showcase replaces the Spaces instead of covering them, so the two never hold memory at the same time.
  return showcase ? <Suspense fallback={null}><Showcase chapter={chapter} request={request} onExit={closeShowcase} /></Suspense> : <Connected />;
}

/** A configured backend and a restored account are required before the study Spaces can mount. */
function Connected() {
  const backend = useBackend();
  const phase = useBackendPhase();
  if (!backend) return <AccountAccessStatus waiting={phase === "pending"} />;
  return <Suspense fallback={<AccountAccessStatus waiting />}><AccountGate backend={backend} workspace={workspaceModel} home={homeNavigation} /></Suspense>;
}

export default function App() {
  const inputFormat = useFoundationReport();
  useBackendConnection();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider store={appearanceStore} inputFormat={inputFormat}>
          <NoticeHost>
            <OverlayHost>
              <SpacesProvider value={spacesStore}>
                <HomeNavigationProvider value={homeNavigation}>
                  <WorkspaceModelProvider value={workspaceModel}>
                    <WorldControllerProvider value={worldController}>
                      <StudySessionProvider value={studySession}>
                        <Root />
                      </StudySessionProvider>
                    </WorldControllerProvider>
                  </WorkspaceModelProvider>
                </HomeNavigationProvider>
              </SpacesProvider>
            </OverlayHost>
          </NoticeHost>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
