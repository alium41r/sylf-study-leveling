import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import StudyIslandScene from "@/app/components/auth/StudyIslandScene";

const { login, push, params } = vi.hoisted(() => ({
  login: vi.fn(),
  push: vi.fn(),
  params: { current: new URLSearchParams() },
}));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ login }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params.current,
}));

beforeEach(() => {
  params.current = new URLSearchParams();
  vi.clearAllMocks();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fillRegistration(username = "stargazer") {
  fireEvent.change(screen.getByLabelText("Display Name"), {
    target: { value: "Aster" },
  });
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText("Email Address"), {
    target: { value: "aster@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "QuietOrbit42!" },
  });
}

describe("Authentication experience", () => {
  it("keeps decoded OAuth feedback readable, including literal percent characters", () => {
    params.current = new URLSearchParams({
      error: "A 100% literal error. Please retry.",
    });
    render(<LoginPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("100% literal error");
  });

  it("exposes verification feedback and an accessible password reveal control", () => {
    params.current = new URLSearchParams({ verified: "true" });
    render(<LoginPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "email has been verified"
    );
    const reveal = screen.getByRole("button", { name: "Show password" });
    expect(reveal.tabIndex).toBe(0);
    fireEvent.click(reveal);
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
      "type",
      "text"
    );
    expect(
      screen.getByRole("button", { name: "Hide password" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves login payload, cookie credentials, loading state, and retryable errors", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as Promise<Response>
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email or Username"), {
      target: { value: "aster" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with Google" })
    ).toBeDisabled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ identifier: "aster", password: "password" }),
      })
    );
    await act(async () =>
      resolve({
        ok: false,
        json: async () => ({ error: "Please check your credentials." }),
      } as Response)
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please check your credentials."
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(login).not.toHaveBeenCalled();
  });

  it("ignores a late availability response for a previous username", async () => {
    let resolveOld!: (value: Response) => void;
    let oldSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes("username=oldname")) {
        oldSignal = init?.signal as AbortSignal;
        return new Promise((resolve) => {
          resolveOld = resolve;
        }) as Promise<Response>;
      }
      return { json: async () => ({ available: true }) } as Response;
    });
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "oldname" },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "New-Name!" },
    });
    expect(screen.getByLabelText("Username")).toHaveValue("newname");
    expect(oldSignal?.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Username is available"
      )
    );
    await act(async () =>
      resolveOld({
        json: async () => ({ available: false, error: "Old name taken" }),
      } as Response)
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Username is available"
    );
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "false"
    );
  });

  it("preserves registration settlement and onboarding navigation", async () => {
    const user = { id: 42, name: "Aster", hasCompletedOnboarding: false };
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        ({
          ok: true,
          json: async () =>
            String(url).includes("check-username")
              ? { available: true }
              : { user },
        }) as Response
    );
    render(<RegisterPage />);
    fillRegistration();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Username is available"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(login).toHaveBeenCalledWith(user);
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Aster",
          username: "stargazer",
          email: "aster@example.test",
          password: "QuietOrbit42!",
        }),
      })
    );
  });

  it("blocks a taken username and exposes the reason to assistive technology", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        available: false,
        error: "This username is already taken.",
      }),
    } as Response);
    render(<RegisterPage />);
    fillRegistration();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("already taken")
    );
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already taken");
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([url]) => String(url).includes("check-username"))
    ).toBe(true);
  });

  it("uses the companion’s existing eye states for form focus and password privacy", () => {
    const { container } = render(<LoginPage />);
    const currentEyes = () =>
      container
        .querySelector("[data-eye-expression]")
        ?.getAttribute("data-eye-expression");
    expect(currentEyes()).toBe("FOCUSED");
    fireEvent.focus(screen.getByLabelText("Email or Username"));
    expect(currentEyes()).toBe("CURIOUS");
    fireEvent.focus(screen.getByLabelText("Password", { exact: true }));
    expect(currentEyes()).toBe("SLEEPY");
    fireEvent.focus(screen.getByRole("button", { name: "Show password" }));
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(currentEyes()).toBe("SLEEPY");
    fireEvent.blur(screen.getByRole("button", { name: "Hide password" }), {
      relatedTarget: screen.getByRole("button", { name: "Say hello to Sylf" }),
    });
    expect(currentEyes()).toBe("FOCUSED");
  });

  it("greets through the canonical reaction system, then returns to reading", async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<StudyIslandScene />);
      fireEvent.click(
        screen.getByRole("button", { name: "Say hello to Sylf" })
      );
      expect(container.querySelector("[data-sylf-companion]")).toHaveAttribute(
        "data-action",
        "HELLO"
      );
      await act(async () => vi.advanceTimersByTime(2500));
      expect(container.querySelector("[data-sylf-companion]")).toHaveAttribute(
        "data-action",
        "READING"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers keyboard-operable ambience controls and instance-safe SVG definitions", () => {
    const { container } = render(
      <>
        <StudyIslandScene />
        <StudyIslandScene />
      </>
    );
    const lamp = screen.getAllByRole("button", { name: "Lantern light" })[0];
    fireEvent.click(lamp);
    expect(lamp).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("complementary")[0]).toHaveAttribute(
      "data-lit",
      "false"
    );
    const pause = screen.getAllByRole("button", {
      name: "Pause scene animation",
    })[0];
    fireEvent.click(pause);
    expect(screen.getAllByRole("complementary")[0]).toHaveAttribute(
      "data-paused",
      "true"
    );
    const ids = [...container.querySelectorAll("svg [id]")].map(
      (element) => element.id
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      container.querySelector("[data-island-scenery] image, svg foreignObject")
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-sylf-companion="original"]')
    ).toHaveLength(2);
    // The canonical painted rig is intentionally reused; surrounding scenery is native SVG.
    expect(
      [...container.querySelectorAll("svg image")].every(
        (image) =>
          image.getAttribute("href") === "/landing/companion/original-rig.webp"
      )
    ).toBe(true);
  });
});
