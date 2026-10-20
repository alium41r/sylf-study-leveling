import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
const mocks = vi.hoisted(() => ({ logout: vi.fn(), push: vi.fn() }));
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, logout: mocks.logout }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/components/BackToSettings", () => ({ default: () => null }));
import DangerZone from "@/app/settings/account/DangerZone";
import LogoutSettingsPage from "@/app/settings/logout/page";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps the logout settings page available when durable Notes preparation rejects", async () => {
  mocks.logout.mockRejectedValue(new Error("Notes quota fault"));
  render(<LogoutSettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
  await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeEnabled()
  );
  expect(mocks.push).not.toHaveBeenCalled();
});

it("the account danger-zone logout uses the canonical save guard and stays put on rejection", async () => {
  mocks.logout.mockRejectedValue(new Error("Notes quota fault"));
  render(<DangerZone />);
  fireEvent.click(screen.getByRole("button", { name: /^Log Out$/ }));
  fireEvent.click(screen.getAllByRole("button", { name: /^Log Out$/ })[1]);
  await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Notes quota fault")
  );
  expect(mocks.push).not.toHaveBeenCalled();
});
