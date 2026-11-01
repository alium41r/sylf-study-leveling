// Android's keyboard does not resize this app's window, so a field near the bottom of the screen ends up behind it, and a page too short to
// scroll has no way to bring it back. This lifts a whole surface by exactly what clears the focused field and the controls under it.
import { useEffect } from "react";
import { DeviceEventEmitter, Keyboard, Platform, TextInput } from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { FIELD_FOCUS_EVENT } from "@sylf/design-system";

/** Room kept under the field, because the button that submits it usually sits just below. */
const ROOM_BELOW_FIELD = 112;
const TRAVEL_MS = 180;

export function useKeyboardLift() {
  const lift = useSharedValue(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let keyboard: { top: number; height: number } | null = null;
    const place = () => {
      const field = TextInput.State.currentlyFocusedInput();
      if (!field || !keyboard) return;
      const { top, height: room } = keyboard;
      field.measureInWindow((_x, y, _width, height) => {
        const hidden = y + height + ROOM_BELOW_FIELD - top;
        lift.value = withTiming(Math.max(0, Math.min(lift.value + hidden, room)), { duration: TRAVEL_MS });
      });
    };
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboard = { top: event.endCoordinates.screenY, height: event.endCoordinates.height };
      place();
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboard = null;
      lift.value = withTiming(0, { duration: TRAVEL_MS });
    });
    const focus = DeviceEventEmitter.addListener(FIELD_FOCUS_EVENT, place);
    return () => { show.remove(); hide.remove(); focus.remove(); };
  }, [lift]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }));
}
