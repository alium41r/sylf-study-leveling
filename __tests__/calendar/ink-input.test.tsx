import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InkSurface from "@/app/calendar/components/InkSurface";
import type { InkStroke } from "@/lib/calendar/ink";
function event(type: string, values: Record<string, unknown> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerId: 1,
    pointerType: "pen",
    pressure: 0.3,
    clientX: 100,
    clientY: 100,
    button: 0,
    buttons: 1,
    width: 1,
    height: 1,
    ...values,
  });
  return e;
}
beforeEach(() => {
  window.scrollBy = vi.fn();
  SVGSVGElement.prototype.setPointerCapture = vi.fn();
  vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 500,
    bottom: 700,
    width: 500,
    height: 700,
    toJSON() {},
  });
});
describe("writing input", () => {
  it("records pressure/coalesced samples and commits a cancelled pointer exactly once", () => {
    const change = vi.fn();
    render(
      <InkSurface
        strokes={[]}
        tool="pen"
        color="INK"
        thickness={3}
        finger={false}
        onChange={change}
      />
    );
    const surface = screen.getByRole("img");
    fireEvent(surface, event("pointerdown"));
    fireEvent(
      surface,
      event("pointermove", {
        clientX: 110,
        clientY: 120,
        pressure: 0.9,
        getCoalescedEvents: () => [
          { clientX: 105, clientY: 110, pointerType: "pen", pressure: 0.5 },
          { clientX: 110, clientY: 120, pointerType: "pen", pressure: 0.9 },
        ],
      })
    );
    fireEvent(surface, event("pointercancel"));
    fireEvent(surface, event("lostpointercapture"));
    expect(change).toHaveBeenCalledOnce();
    const stroke = change.mock.calls[0][0][0] as InkStroke;
    expect(stroke.points).toHaveLength(3);
    expect(stroke.points[0]).toEqual([200, 200, 0.3]);
    expect(stroke.points[2][2]).toBeGreaterThan(0.3);
  });
  it("rejects palms and lets a finger pan without creating ink", () => {
    const change = vi.fn();
    render(
      <InkSurface
        strokes={[]}
        tool="pen"
        color="INK"
        thickness={3}
        finger={false}
        onChange={change}
      />
    );
    const surface = screen.getByRole("img");
    fireEvent(
      surface,
      event("pointerdown", { pointerType: "touch", width: 60, height: 60 })
    );
    fireEvent(surface, event("pointerup", { pointerType: "touch" }));
    fireEvent(surface, event("pointerdown", { pointerType: "touch" }));
    fireEvent(surface, event("pointerup", { pointerType: "touch" }));
    expect(change).not.toHaveBeenCalled();
    fireEvent(surface, event("pointerdown"));
    fireEvent(
      surface,
      event("pointerdown", { pointerId: 2, pointerType: "touch" })
    );
    fireEvent(surface, event("pointerup"));
    expect(change).toHaveBeenCalledOnce();
  });
  it("cancels an accidental first-finger stroke when a two-finger zoom begins", () => {
    const change = vi.fn(),
      zoom = vi.fn();
    render(
      <InkSurface
        strokes={[]}
        tool="pen"
        color="INK"
        thickness={3}
        finger
        onChange={change}
        onZoom={zoom}
      />
    );
    const surface = screen.getByRole("img");
    fireEvent(
      surface,
      event("pointerdown", { pointerType: "touch", pointerId: 1 })
    );
    fireEvent(
      surface,
      event("pointerdown", { pointerType: "touch", pointerId: 2, clientX: 200 })
    );
    fireEvent(
      surface,
      event("pointermove", { pointerType: "touch", pointerId: 2, clientX: 250 })
    );
    fireEvent(
      surface,
      event("pointerup", { pointerType: "touch", pointerId: 1 })
    );
    fireEvent(
      surface,
      event("pointerup", { pointerType: "touch", pointerId: 2 })
    );
    expect(change).not.toHaveBeenCalled();
    expect(zoom).toHaveBeenCalledWith(1.5, { x: 175, y: 100 });
  });
  it("supports the pen hardware eraser without changing the selected pen", () => {
    const change = vi.fn();
    const stroke: InkStroke = {
      id: crypto.randomUUID(),
      tool: "pen",
      color: "INK",
      width: 3,
      points: [
        [200, 200, 0.5],
        [300, 200, 0.5],
      ],
    };
    render(
      <InkSurface
        strokes={[stroke]}
        tool="pen"
        color="INK"
        thickness={3}
        finger={false}
        onChange={change}
      />
    );
    const surface = screen.getByRole("img");
    fireEvent(surface, event("pointerdown", { button: 5, buttons: 32 }));
    fireEvent(surface, event("pointerup"));
    expect(change).toHaveBeenCalledWith([]);
  });
});
