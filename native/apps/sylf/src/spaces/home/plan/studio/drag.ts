// Dragging a session. The whole session is the handle: a mouse picks it up after a few pixels, a finger after a short press (so the calendar still
// scrolls under a swipe). It follows the pointer on the UI thread with a slight lift, so nothing re-renders while it moves; the view hears about it
// only when the slot under the pointer changes. Near the top or bottom of a scrolling grid the grid scrolls by itself. On release the view moves the
// session and it glides from where it was dropped into its new place; if nothing moved, it settles back.
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePanGesture } from "react-native-gesture-handler";
import { scrollTo, useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { move, useInputFormat, useTheme } from "@sylf/design-system";

/** A grid that scrolls while something is dragged near its edges: its scroll position, where it is on screen and how tall it and its content are. */
export interface AutoScroll { ref: Parameters<typeof scrollTo>[0]; offset: SharedValue<number>; top: SharedValue<number>; height: SharedValue<number>; content: SharedValue<number> }

export interface DragMove {
  enabled: boolean;
  /** Where the session is drawn now. When these change after a drop, it glides from the drop point into place. */
  x: number;
  y: number;
  /** The slot under a translation, as one number (a worklet). */
  slotOf: (dx: number, dy: number) => number;
  onLift: () => void;
  onSlot: (slot: number) => void;
  onDrop: (slot: number) => void;
  scroll?: AutoScroll;
}

const EDGE = 56;

export function useDragMove({ enabled, x, y, slotOf, onLift, onSlot, onDrop, scroll }: DragMove) {
  const { motion } = useTheme();
  const touch = useInputFormat() === "touch";
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rawY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const slot = useSharedValue(-1);
  const origin = useSharedValue(-1);
  const pointer = useSharedValue(0);
  const scrollStart = useSharedValue(0);
  const placed = useRef({ x, y });
  const dropped = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new place after a drop: keep the session where it is on screen, then let it settle into the new place.
  useLayoutEffect(() => {
    const dx = x - placed.current.x;
    const dy = y - placed.current.y;
    placed.current = { x, y };
    if (!dx && !dy) return;
    if (dropped.current) { clearTimeout(dropped.current); dropped.current = null; }
    tx.value = tx.value - dx;
    ty.value = ty.value - dy;
    tx.value = move(0, motion);
    ty.value = move(0, motion);
  }, [x, y, motion, tx, ty]);
  useEffect(() => () => { if (dropped.current) clearTimeout(dropped.current); }, []);

  const frames = useFrameCallback(() => {
    "worklet";
    if (!scroll || lifted.value < 0.5) return;
    const at = pointer.value - scroll.top.value;
    const speed = at < EDGE ? -Math.min(16, (EDGE - at) / 3) : at > scroll.height.value - EDGE ? Math.min(16, (at - scroll.height.value + EDGE) / 3) : 0;
    if (!speed) return;
    const next = Math.max(0, Math.min(Math.max(0, scroll.content.value - scroll.height.value), scroll.offset.value + speed));
    if (next === scroll.offset.value) return;
    scrollTo(scroll.ref, 0, next, false);
    scroll.offset.value = next;
    ty.value = rawY.value + next - scrollStart.value;
    const s = slotOf(tx.value, ty.value);
    if (s !== slot.value) { slot.value = s; scheduleOnRN(onSlot, s); }
  }, false);
  const setFrames = (on: boolean) => frames.setActive(on);

  // Released with no new place (the same slot, or a move the view declined): settle back.
  const finish = (to: number) => {
    setFrames(false);
    const before = placed.current;
    onDrop(to);
    dropped.current = setTimeout(() => {
      dropped.current = null;
      if (placed.current.x === before.x && placed.current.y === before.y) { tx.value = move(0, motion); ty.value = move(0, motion); }
    }, 90);
  };

  const gesture = usePanGesture({
    enabled,
    activateAfterLongPress: touch ? 260 : undefined,
    minDistance: touch ? undefined : 4,
    shouldCancelWhenOutside: false,
    onActivate: (event) => {
      "worklet";
      lifted.value = move(1, motion);
      origin.value = slotOf(0, 0);
      slot.value = origin.value;
      rawY.value = 0;
      pointer.value = event.absoluteY;
      scrollStart.value = scroll ? scroll.offset.value : 0;
      scheduleOnRN(onLift);
      if (scroll) scheduleOnRN(setFrames, true);
    },
    onUpdate: (event) => {
      "worklet";
      tx.value = event.translationX;
      rawY.value = event.translationY;
      pointer.value = event.absoluteY;
      ty.value = event.translationY + (scroll ? scroll.offset.value - scrollStart.value : 0);
      const s = slotOf(tx.value, ty.value);
      if (s !== slot.value) { slot.value = s; scheduleOnRN(onSlot, s); }
    },
    onDeactivate: () => {
      "worklet";
      lifted.value = move(0, motion);
      const to = slot.value;
      slot.value = -1;
      scheduleOnRN(finish, to);
    },
  });

  const amount = motion.amount;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: 1 + lifted.value * 0.035 * amount }],
    zIndex: lifted.value > 0.01 ? 40 : 1,
  }));
  const shadow = useAnimatedStyle(() => ({ opacity: lifted.value }));
  return { gesture, style, shadow };
}
