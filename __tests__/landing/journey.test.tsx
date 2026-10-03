import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import JourneyLanding from "@/app/components/landing/journey/JourneyLanding";
import WaitlistSignup from "@/app/components/landing/journey/WaitlistSignup";

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock("@/app/components/AuthProvider", () => ({ useAuth: useAuthMock }));
// Browser SVG measurements are covered by visual checks; keep these tests on controls.
vi.mock("@/app/components/landing/journey/JourneyPath", () => ({
  default: () => null,
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

const STORAGE_KEY = "sylf_waitlist_pass";
const confirmedPass = {
  referralCode: "sylf-new1234",
  position: 24,
  referralCount: 0,
  targetExam: null,
  alreadyRegistered: false,
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(response(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function submitEmail(email = "scholar@example.com") {
  fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("app_mode");
  document.documentElement.removeAttribute("data-mode");
  useAuthMock.mockReturnValue({ user: null, isLoading: false });
  vi.stubGlobal("fetch", vi.fn<typeof fetch>());
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      media,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Journey waitlist signup", () => {
  it("submits the email and incoming referral, then persists the confirmed pass", async () => {
    window.history.replaceState(null, "", "/?ref=sylf-friend42");
    const fetchMock = mockResponse({ success: true, ...confirmedPass });
    render(<WaitlistSignup />);

    submitEmail("  scholar@example.com  ");

    expect(
      await screen.findByText("Your next chapter is reserved.")
    ).toBeInTheDocument();
    expect(screen.getByText(/#24 on the waitlist/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "scholar@example.com",
        referredBy: "sylf-friend42",
      }),
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
      confirmedPass
    );
  });

  it("announces API errors and keeps the email ready for retry", async () => {
    mockResponse({ error: "Too many requests. Please try again later." }, 429);
    render(<WaitlistSignup />);
    submitEmail();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests"
    );
    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(email).toHaveValue("scholar@example.com");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute(
      "aria-describedby",
      screen.getByRole("alert").id
    );
    expect(
      screen.getByRole("button", { name: "Join the waitlist" })
    ).toBeEnabled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    null,
    { ...confirmedPass, referralCode: "<invalid>" },
    { ...confirmedPass, position: 0 },
    { ...confirmedPass, position: "24" },
  ])(
    "rejects a malformed successful result (%j) without saving it",
    async (body) => {
      mockResponse(body);
      render(<WaitlistSignup />);
      submitEmail();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /couldn’t confirm your pass/i
      );
      expect(
        screen.queryByText("Your next chapter is reserved.")
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    }
  );

  it("restores a URL pass and removes only that parameter when resetting", async () => {
    window.history.replaceState(
      null,
      "",
      "/?pass=sylf-restore42&ref=sylf-friend42#early-access"
    );
    const restored = {
      ...confirmedPass,
      referralCode: "sylf-restore42",
      position: 12,
    };
    const fetchMock = mockResponse({ success: true, ...restored });
    render(<WaitlistSignup />);

    expect(await screen.findByText("Your place is saved.")).toBeInTheDocument();
    expect(screen.getByText(/#12 on the waitlist/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist?code=sylf-restore42",
      {
        signal: expect.any(AbortSignal),
      }
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      referralCode: "sylf-restore42",
      alreadyRegistered: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Different email" }));
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue(
      ""
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe("?ref=sylf-friend42");
    expect(window.location.hash).toBe("#early-access");
  });

  it("restores a saved pass without submitting or fetching again", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmedPass));
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitlistSignup />);

    expect(screen.getByText("Your place is saved.")).toBeInTheDocument();
    expect(screen.getByText(confirmedPass.referralCode)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not restore an in-flight pass after the user resets", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmedPass));
    window.history.replaceState(null, "", "/?pass=sylf-later42");
    let resolveRestore!: (value: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WaitlistSignup />);
    fireEvent.click(screen.getByRole("button", { name: "Different email" }));

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await act(async () => {
      resolveRestore(
        response({
          success: true,
          ...confirmedPass,
          referralCode: "sylf-later42",
        })
      );
    });
    expect(
      screen.getByRole("button", { name: "Join the waitlist" })
    ).toBeEnabled();
    expect(screen.queryByText("Your place is saved.")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("provides a selectable referral link when clipboard permission is denied", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmedPass));
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<WaitlistSignup />);
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /select and copy your referral link/i
    );
    const expectedUrl = `${window.location.origin}/?ref=${confirmedPass.referralCode}`;
    expect(writeText).toHaveBeenCalledWith(expectedUrl);
    expect(
      screen.getByRole("textbox", { name: "Your referral link" })
    ).toHaveValue(expectedUrl);
    expect(
      screen.getByRole("textbox", { name: "Your referral link" })
    ).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("button", { name: "Copied!" })
    ).not.toBeInTheDocument();
  });
});

describe("Journey product previews", () => {
  it("shows real screenshots and switches between stats and collection", () => {
    render(<JourneyLanding />);
    const actualImages = screen.getAllByRole("img");
    expect(actualImages.length).toBe(6);
    for (const image of actualImages)
      expect(image.getAttribute("src")).toMatch(/^\/landing\/screenshots\//);
    expect(screen.getByRole("button", { name: "Stats" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Collection" }));
    expect(
      screen.getByRole("button", { name: "Collection" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", {
        name: /collection view showing owned items/i,
      })
    ).toHaveAttribute("src", "/landing/screenshots/collection view.webp");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("supports view selectors for focus timer, system AI, and focus party", () => {
    render(<JourneyLanding />);

    // Focus timer gallery
    expect(screen.getByRole("button", { name: "Timer page" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Focus timer" }));
    expect(screen.getByRole("button", { name: "Focus timer" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("img", { name: /active focus session/i })
    ).toHaveAttribute("src", "/landing/screenshots/focus timer view.webp");

    // System AI / Planner / Calendar gallery
    expect(screen.getByRole("button", { name: "AI chat" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    expect(screen.getByRole("button", { name: "Planner" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("img", { name: /study planner view/i })
    ).toHaveAttribute("src", "/landing/screenshots/planner view.webp");

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByRole("img", { name: /study calendar view/i })
    ).toHaveAttribute("src", "/landing/screenshots/calender view.webp");

    // Social / Focus party / Focus party timer gallery
    expect(screen.getByRole("button", { name: "Your circle" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Focus Party timer" }));
    expect(
      screen.getByRole("button", { name: "Focus Party timer" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("img", { name: /shared study room/i })
    ).toHaveAttribute(
      "src",
      "/landing/screenshots/focus party timer view.webp"
    );
  });

  it("lets the visitor pause and resume the companion", () => {
    render(<JourneyLanding />);
    fireEvent.click(screen.getByRole("button", { name: "Pause companion" }));
    expect(
      screen.getByRole("button", { name: "Resume companion" })
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Resume companion" }));
    expect(
      screen.getByRole("button", { name: "Pause companion" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps login access in the development landing header and footer", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<JourneyLanding />);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("link", { name: "Scholar Log In" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("links returning authenticated developers to their dashboard", () => {
    vi.stubEnv("NODE_ENV", "development");
    useAuthMock.mockReturnValue({ user: { name: "Alex" }, isLoading: false });
    render(<JourneyLanding />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it.each([
    { user: null, isLoading: true },
    { user: null, isLoading: false },
    { user: { name: "Alex" }, isLoading: false },
  ])("omits account access from production for auth state %j", (authState) => {
    vi.stubEnv("NODE_ENV", "production");
    useAuthMock.mockReturnValue(authState);
    render(<JourneyLanding />);

    expect(screen.queryByRole("link", { name: /log in|dashboard/i })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(
        /^\/(login|register|dashboard)(?:[/?#]|$)/
      );
    }
    expect(screen.getByRole("link", { name: "Get early access" })).toHaveAttribute(
      "href", "#early-access"
    );
    expect(screen.getByRole("link", { name: "Begin your journey" })).toHaveAttribute(
      "href", "#early-access"
    );
    expect(
      screen.getByRole("textbox", { name: "Email address" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join the waitlist" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Privacy Policy" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Terms of Access" })
    ).toBeInTheDocument();
  });

  it("still accepts waitlist signups from the production landing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = mockResponse({ success: true, ...confirmedPass });
    render(<JourneyLanding />);
    submitEmail();

    expect(
      await screen.findByText("Your next chapter is reserved.")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist", expect.objectContaining({ method: "POST" })
    );
  });
});
