import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  unlock: vi.fn(),
  cached: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
  user: { id: 1, isAdmin: true },
  flush: vi.fn(),
  unregisters: [] as (() => void)[],
}));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: mocks.user, isLoading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.params,
}));
vi.mock("@/lib/notes/drive-transport", () => ({ notesRequest: mocks.request }));
vi.mock("@/lib/notes/library", () => ({
  NotesLibrary: {
    bootstrap: async (
      owner: string,
      guard: () => boolean,
      repair: boolean,
      onAccess: (info: unknown) => boolean
    ) => {
      const info = await (
        await mocks.request("/api/notes/unlock?bootstrap=1")
      ).json();
      if (onAccess(info)) return mocks.unlock(owner, guard, repair);
    },
  },
}));
vi.mock("@/lib/client-data-cache", () => ({ fetchCachedJSON: mocks.cached }));
vi.mock("@/app/notes/components/NotebookWorkspace", async () => {
  const React = await import("react");
  return {
    default: function Editor(props: {
      registerLeave: (fn: () => Promise<void>) => () => void;
      onBack: () => void;
    }) {
      const { registerLeave } = props;
      React.useEffect(() => {
        const remove = registerLeave(() => mocks.flush());
        mocks.unregisters.push(remove);
        return remove;
      }, [registerLeave]);
      return <button onClick={props.onBack}>Back to notes</button>;
    },
  };
});
import NotesScreen from "@/app/notes/components/NotesScreen";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cached.mockResolvedValue([]);
  mocks.params = new URLSearchParams();
  mocks.flush.mockResolvedValue(undefined);
  mocks.unregisters = [];
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
describe("Notes connection screen on deployment aliases", () => {
  it("keeps a same-tab fallback only for untrusted or legacy deployments", async () => {
    mocks.request.mockResolvedValue(
      Response.json({
        configured: true,
        notesUrl: "https://sylf.test/notes",
        connection: { existing: true },
      })
    );
    const location = window.location.href;
    render(<NotesScreen />);
    const link = await screen.findByRole("link", {
      name: "Continue to Sylf",
    });
    expect(link).toHaveAttribute("href", "https://sylf.test/notes");
    expect(link).not.toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("button", { name: /Connect Google Drive/i })
    ).not.toBeInTheDocument();
    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(mocks.cached).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(location);
  });
  it("keeps the normal connect action on the advertised canonical origin", async () => {
    mocks.request.mockResolvedValue(
      Response.json({
        configured: true,
        notesUrl: window.location.origin + "/notes",
        connection: null,
      })
    );
    render(<NotesScreen />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Connect Google Drive",
        })
      ).toBeEnabled()
    );
    expect(
      screen.queryByRole("link", { name: "Continue to Sylf" })
    ).not.toBeInTheDocument();
  });
  it("fails closed on malformed advertised destinations without exposing a link or enabling connection", async () => {
    mocks.request.mockResolvedValue(
      Response.json({
        configured: true,
        notesUrl: "javascript:alert(1)",
        connection: null,
      })
    );
    render(<NotesScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not verify its Sylf address"
    );
    expect(
      screen.getByRole("button", { name: "Connect Google Drive" })
    ).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "Continue to Sylf" })
    ).not.toBeInTheDocument();
  });
});

function connectedLibrary(overrides = {}) {
  const snapshot = {
    notes: [],
    folders: [],
    ready: true,
    syncing: true,
    pending: 3,
    searchIndexed: 0,
    searchTotal: 0,
    ...overrides,
  };
  return {
    session: { ownerId: "1", signal: new AbortController().signal },
    repository: { libraryId: "00000000-0000-4000-8000-000000000001" },
    subscribe: () => () => {},
    snapshot: () => snapshot,
    dispose: vi.fn().mockResolvedValue(undefined),
    retrySync: vi.fn(),
    recoverySnapshots: () => [],
    recoveryUploads: () => [],
    requestCloudSync: vi.fn(),
  };
}
function setupConnected(overrides = {}) {
  const library = connectedLibrary(overrides);
  mocks.request.mockResolvedValue(
    Response.json({
      configured: true,
      localAccess: true,
      notesUrl: "https://sylf.test/notes",
      connection: { status: "ACTIVE" },
    })
  );
  mocks.unlock.mockResolvedValue(library);
  return library;
}
it("opens an existing authorized library on a trusted deployment without another button or consent", async () => {
  setupConnected();
  render(<NotesScreen />);
  expect(await screen.findByRole("button", { name: "New note" })).toBeEnabled();
  expect(mocks.unlock).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("link", { name: "Continue to Sylf" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Syncing|waiting to sync|Saved on this device/)
  ).not.toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("keeps transient outages quiet, but preserves actionable recovery and revoked-consent warnings", async () => {
  setupConnected({ error: "NETWORK", errorCode: "NETWORK" });
  const view = render(<NotesScreen />);
  await screen.findByRole("button", { name: "New note" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Reconnect" })
  ).not.toBeInTheDocument();
  view.unmount();
  setupConnected({ error: "AUTH", errorCode: "AUTH" });
  render(<NotesScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /Reconnect the original Google/
  );
  expect(screen.getByRole("button", { name: "Reconnect" })).toBeVisible();
});
it("shows a failed cold download immediately instead of leaving an unexplained recovery spinner", async () => {
  setupConnected({
    ready: false,
    localReady: false,
    restorePending: true,
    error: "NETWORK",
    errorCode: "NETWORK",
    syncing: false,
  });
  render(<NotesScreen />);
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("Library download paused")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry recovery" })).toBeEnabled();
  expect(screen.queryByText("Downloading your notes")).not.toBeInTheDocument();
});
it("does not hide an incomplete first download failure after some notes have arrived", async () => {
  setupConnected({
    ready: true,
    localReady: true,
    restorePending: true,
    error: "NETWORK",
    errorCode: "NETWORK",
    syncing: false,
    notes: syntheticNotes(),
  });
  render(<NotesScreen />);
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Open Synthetic 2" })
  ).toBeEnabled();
});
it("retains detailed statuses only when the admin explicitly enables developer diagnostics", async () => {
  setupConnected();
  mocks.params = new URLSearchParams("dev=true");
  render(<NotesScreen />);
  expect(await screen.findByRole("button", { name: "Syncing…" })).toBeVisible();
});
it("keeps card navigation responsive while synchronization is busy", async () => {
  const id = "00000000-0000-4000-8000-000000000002";
  setupConnected({
    notes: [
      {
        id,
        updatedAt: new Date().toISOString(),
        preview: "",
        searchText: "",
        view: {
          state: "active",
          descriptor: {
            title: "Synthetic study",
            kind: "flow",
            pages: [],
            streams: [],
            extensions: {},
          },
        },
      },
    ],
  });
  render(<NotesScreen />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Open Synthetic study" })
  );
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("document=" + id),
      { scroll: false }
    )
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("shows cached notes while organization replays and optional subjects remain pending", async () => {
  const notes = syntheticNotes();
  setupConnected({
    ready: false,
    localReady: true,
    catalogComplete: false,
    notes,
  });
  mocks.cached.mockReturnValue(new Promise(() => {}));
  render(<NotesScreen />);
  expect(
    await screen.findByRole("button", { name: "Open Synthetic 2" })
  ).toBeEnabled();
  expect(screen.queryByText("Opening your library…")).not.toBeInTheDocument();
  expect(screen.queryByText("Restoring your library")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New note" })).toBeDisabled();
});
it("does not misreport a deep-linked note as missing while the local catalog is still paging", async () => {
  setupConnected({ ready: false, localReady: true, catalogComplete: false });
  mocks.params = new URLSearchParams(
    "document=00000000-0000-4000-8000-000000000099"
  );
  render(<NotesScreen />);
  expect(await screen.findByText("Opening this note…")).toBeVisible();
  expect(screen.queryByText("Document unavailable")).not.toBeInTheDocument();
});

function syntheticNotes() {
  return [2, 3].map((i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    updatedAt: new Date().toISOString(),
    preview: "",
    searchText: "",
    view: {
      state: "active",
      descriptor: {
        title: "Synthetic " + i,
        kind: "flow",
        pages: [],
        streams: [],
        extensions: {},
      },
    },
  }));
}
it("ignores stale editor cleanup so the current editor still drains before navigation", async () => {
  const notes = syntheticNotes();
  setupConnected({ notes });
  mocks.params = new URLSearchParams("document=" + notes[0].id);
  const view = render(<NotesScreen />);
  await screen.findByRole("button", { name: "Back to notes" });
  const oldRemove = mocks.unregisters[0];
  mocks.params = new URLSearchParams("document=" + notes[1].id);
  view.rerender(<NotesScreen />);
  await waitFor(() => expect(mocks.unregisters).toHaveLength(2));
  oldRemove();
  fireEvent.click(screen.getByRole("button", { name: "Back to notes" }));
  await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(1));
});
it("coalesces rapid navigation while an editor drains and never dispatches an older intent afterwards", async () => {
  const notes = syntheticNotes();
  setupConnected({ notes });
  mocks.params = new URLSearchParams("document=" + notes[0].id);
  let finish!: () => void;
  const drain = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.flush.mockReturnValue(drain);
  render(<NotesScreen />);
  const back = await screen.findByRole("button", { name: "Back to notes" });
  fireEvent.click(back);
  fireEvent.click(back);
  expect(mocks.replace).not.toHaveBeenCalled();
  await act(async () => finish());
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
});
it("shows a single actionable warning for a prolonged failed backup without suggesting new consent", async () => {
  setupConnected({
    error: "NETWORK",
    errorCode: "NETWORK",
    cloudErrorSince: Date.now() - 6 * 60_000,
    backupDelayed: true,
  });
  render(<NotesScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "cloud backup has been unavailable"
  );
  expect(
    screen.queryByRole("button", { name: "Reconnect" })
  ).not.toBeInTheDocument();
});

it("consumes a one-time consent handoff so a return visit cannot restart Google consent", async () => {
  window.history.replaceState(null, "", "/?connect=drive");
  mocks.params = new URLSearchParams("connect=drive");
  mocks.request.mockImplementation(
    async (_path: string, init?: RequestInit) => {
      if (init?.method === "POST")
        throw Error("Synthetic stop before external consent");
      return Response.json({
        configured: true,
        notesUrl: window.location.origin + "/notes",
        connection: null,
      });
    }
  );
  const first = render(<NotesScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Synthetic stop before external consent"
  );
  expect(new URL(window.location.href).searchParams.has("connect")).toBe(false);
  first.unmount();
  mocks.params = new URLSearchParams(window.location.search);
  render(<NotesScreen />);
  await screen.findByRole("button", { name: "Connect Google Drive" });
  expect(
    mocks.request.mock.calls.filter(([, init]) => init?.method === "POST")
  ).toHaveLength(1);
});
