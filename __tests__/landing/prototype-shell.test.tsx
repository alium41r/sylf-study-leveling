import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SylfAppShell } from "@/app/components/SylfAppShell";

const route = vi.hoisted(() => ({ pathname: "/focus" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/app/components/SidebarWrapper", () => ({ default: () => null }));
afterEach(cleanup);

it("restores document scrolling when entering the companion journey from a locked app screen", () => {
  const view = render(<SylfAppShell>Journey</SylfAppShell>);
  expect(document.documentElement).toHaveClass("static-viewport");
  expect(document.body).toHaveClass("static-viewport");

  route.pathname = "/companion-prototype";
  view.rerender(<SylfAppShell>Journey</SylfAppShell>);
  expect(document.documentElement).not.toHaveClass("static-viewport");
  expect(document.body).not.toHaveClass("static-viewport");
  expect(screen.getByRole("main")).not.toHaveClass("overflow-hidden");

  route.pathname = "/";
  view.rerender(<SylfAppShell>Landing</SylfAppShell>);
  expect(document.documentElement).not.toHaveClass("static-viewport");
  expect(screen.getByRole("main")).not.toHaveClass("overflow-hidden");
});
