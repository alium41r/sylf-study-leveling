import { createRef, Profiler } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import JourneyCompanion, {
  type JourneyCompanionHandle,
} from "@/app/components/landing/companion/JourneyCompanion";
import { SECONDARY_MOTION_LIMITS } from "@/app/components/landing/companion/secondary-motion";

afterEach(cleanup);

it("animates local layers without per-frame React commits or replacing the artwork", () => {
  const ref = createRef<JourneyCompanionHandle>();
  const commits = vi.fn();
  const { container } = render(
    <Profiler id="journey" onRender={commits}>
      <JourneyCompanion ref={ref} />
    </Profiler>
  );
  const surface = container.firstElementChild as HTMLElement;
  const image = container.querySelector("image");
  const initialCommits = commits.mock.calls.length;
  act(() => {
    for (let i = 0; i < 60; i++)
      ref.current!.present("IDLE", true, { x: 450, y: 700 }, 1 / 60);
  });
  const cape = parseFloat(surface.style.getPropertyValue("--cape-lag"));
  // Driven hard enough to be seen, and never past its declared bound. The old
  // presentation scaled this by 0.42 on the way out, which is what made the
  // cape's travel response sub-pixel; the bound is now expressed directly.
  expect(Math.abs(cape)).toBeGreaterThan(SECONDARY_MOTION_LIMITS.capeTilt * 0.3);
  expect(Math.abs(cape)).toBeLessThanOrEqual(SECONDARY_MOTION_LIMITS.capeTilt);
  // The shear carries most of the cape's visible swing and must be present.
  expect(
    Math.abs(parseFloat(surface.style.getPropertyValue("--cape-skew")))
  ).toBeGreaterThan(1);
  expect(surface.style.getPropertyValue("--ribbon-left-lag")).not.toBe(
    surface.style.getPropertyValue("--ribbon-right-lag")
  );
  act(() => {
    ref.current!.present("IDLE", true, { x: -450, y: -700 }, 1 / 60);
  });
  expect(
    Math.sign(parseFloat(surface.style.getPropertyValue("--cape-lag")))
  ).toBe(Math.sign(cape));
  expect(container.querySelector("image")).toBe(image);
  expect(commits).toHaveBeenCalledTimes(initialCommits);
  let settling = true;
  act(() => {
    for (let i = 0; i < 240; i++)
      settling = ref.current!.present("IDLE", true, { x: 0, y: 0 }, 1 / 60);
  });
  expect(settling).toBe(false);
  expect(surface.style.getPropertyValue("--cape-lag")).toBe("0.00deg");
});

it("resets inertia while hidden or when the measured path rebases", () => {
  const ref = createRef<JourneyCompanionHandle>();
  const { container } = render(<JourneyCompanion ref={ref} />);
  const surface = container.firstElementChild as HTMLElement;
  act(() => {
    for (let i = 0; i < 45; i++)
      ref.current!.present("IDLE", true, { x: 500, y: 400 }, 1 / 60);
  });
  act(() => {
    expect(ref.current!.present("IDLE", false)).toBe(false);
  });
  expect(surface).toHaveAttribute("data-activity", "paused");
  expect(surface.style.getPropertyValue("--ribbon-left-lag")).toBe("0.00deg");
  act(() => {
    ref.current!.present("IDLE", true, { x: 500, y: 400 }, 1 / 60);
    ref.current!.present("IDLE", true);
  });
  expect(surface.style.getPropertyValue("--journey-lean")).toBe("0.00deg");
});
