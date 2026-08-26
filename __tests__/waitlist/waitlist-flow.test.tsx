import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WaitlistSection from "@/app/components/landing/WaitlistSection";
import HeroSection from "@/app/components/landing/HeroSection";

// ─── fetch mock ────────────────────────────────────────────────
function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  try {
    localStorage.removeItem("sylf_waitlist_pass");
  } catch {
    /* noop */
  }
});

describe("WaitlistSection form flow", () => {
  it("submits and renders the confirmed Scholar Access Pass", async () => {
    const fetchMock = mockFetchOnce(200, {
      success: true,
      referralCode: "sylf-abcd1234",
      position: 24,
      referralCount: 0,
      targetExam: "MCAT",
      alreadyRegistered: false,
      message: "You've been added to the waitlist.",
    });

    render(<WaitlistSection />);

    fireEvent.change(screen.getByPlaceholderText("e.g. scholar@university.edu"), {
      target: { value: "scholar@university.edu" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Alex"), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. MCAT, CS, A-Levels"), {
      target: { value: "MCAT" },
    });
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));

    await waitFor(() => {
      expect(screen.getByText(/you are #24 on the waitlist/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/sylf-abcd1234/i)).toBeInTheDocument();
    expect(screen.getByText(/access pass initialized/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(body).toEqual({
      email: "scholar@university.edu",
      name: "Alex",
      targetExam: "MCAT",
    });
  });

  it("shows the API error message on failure", async () => {
    mockFetchOnce(400, { error: "Too many requests. Please wait a few minutes before trying again." });

    render(<WaitlistSection />);

    fireEvent.change(screen.getByPlaceholderText("e.g. scholar@university.edu"), {
      target: { value: "bad@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /get early access/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/access pass initialized/i)).not.toBeInTheDocument();
  });

  it("restores an existing pass from the ?pass= URL param", async () => {
    window.history.replaceState({}, "", "/?pass=sylf-restore99");
    const fetchMock = mockFetchOnce(200, {
      success: true,
      referralCode: "sylf-restore99",
      referralCount: 7,
      position: 12,
      targetExam: "A-Levels",
    });

    render(<WaitlistSection />);

    await waitFor(() => {
      expect(screen.getByText(/you are #12 on the waitlist/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/waitlist?code=sylf-restore99");
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it("restores a saved pass from localStorage on a returning visit", async () => {
    localStorage.setItem(
      "sylf_waitlist_pass",
      JSON.stringify({
        referralCode: "sylf-saved01",
        position: 33,
        referralCount: 2,
        targetExam: "USMLE",
        alreadyRegistered: true,
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<WaitlistSection />);

    await waitFor(() => {
      expect(screen.getByText(/you are #33 on the waitlist/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/sylf-saved01/i)).toBeInTheDocument();
    expect(screen.getByText(/goal: usmle/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    // A returning visitor is labelled "WELCOME BACK", not "initialized".
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it("renders a fresh hero handoff pass as ACCESS PASS INITIALIZED", async () => {
    render(
      <WaitlistSection
        initialPass={{
          referralCode: "sylf-fresh01",
          position: 9,
          referralCount: 0,
          targetExam: "MCAT",
          alreadyRegistered: false,
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/you are #9 on the waitlist/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/access pass initialized/i)).toBeInTheDocument();
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it("lets a scholar reset the pass and join with a different email", async () => {
    localStorage.setItem(
      "sylf_waitlist_pass",
      JSON.stringify({
        referralCode: "sylf-reset01",
        position: 5,
        referralCount: 0,
        targetExam: null,
        alreadyRegistered: true,
      })
    );
    vi.stubGlobal("fetch", vi.fn());

    render(<WaitlistSection />);
    await waitFor(() => {
      expect(screen.getByText(/you are #5 on the waitlist/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /join with a different email/i }));

    // Back to the form, and the stored pass is cleared.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /get early access/i })).toBeInTheDocument();
    });
    expect(localStorage.getItem("sylf_waitlist_pass")).toBeNull();
  });
});

describe("HeroSection waitlist flow", () => {
  it("submits, shows the referral code, and notifies the parent", async () => {
    mockFetchOnce(200, {
      success: true,
      referralCode: "sylf-hero1234",
      position: 7,
      referralCount: 0,
      alreadyRegistered: false,
    });
    const onSuccessSignup = vi.fn();

    render(<HeroSection onSuccessSignup={onSuccessSignup} />);

    fireEvent.change(screen.getByPlaceholderText("Enter your student email..."), {
      target: { value: "hero@university.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join waitlist/i }));

    await waitFor(() => {
      expect(screen.getByText(/access pass confirmed/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/sylf-hero1234/i)).toBeInTheDocument();
    expect(onSuccessSignup).toHaveBeenCalledWith({
      referralCode: "sylf-hero1234",
      position: 7,
      referralCount: 0,
      targetExam: null,
      alreadyRegistered: false,
    });
  });

  it("shows the error when the API rejects", async () => {
    mockFetchOnce(429, { error: "Too many requests. Please wait a few minutes before trying again." });

    render(<HeroSection />);

    fireEvent.change(screen.getByPlaceholderText("Enter your student email..."), {
      target: { value: "hero2@university.edu" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join waitlist/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    });
  });
});
