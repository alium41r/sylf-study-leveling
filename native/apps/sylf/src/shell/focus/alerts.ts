// The one thing a person needs while the app is away: knowing a phase ended. When the app goes behind something with a timed phase running, one local
// notification is scheduled for that phase's end, and it is cancelled on return. No push service, no server, nothing in the background but the OS's
// own alarm. Asking for permission happens once, when a timed session first begins, and a refusal changes nothing else.
import { Platform } from "react-native";
import type { StudySessionModel } from "@sylf/spaces";

type Notifications = typeof import("expo-notifications");
let module: Notifications | null = null;
let scheduled: string | null = null;
let asked = false;

const load = async () => { if (Platform.OS === "web") return null; module ??= await import("expo-notifications"); return module; };

export async function askOnce() {
  if (asked) return;
  asked = true;
  const notifications = await load().catch(() => null);
  if (!notifications) return;
  const current = await notifications.getPermissionsAsync().catch(() => null);
  if (current && !current.granted && current.canAskAgain) await notifications.requestPermissionsAsync().catch(() => undefined);
}

async function cancel() {
  if (!scheduled || !module) return;
  const id = scheduled; scheduled = null;
  await module.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

/** Called as the app leaves and returns. It reads the session, and schedules or cancels. */
export async function onForegroundChange(active: boolean, session: StudySessionModel) {
  if (active) { await cancel(); return; }
  const readout = session.readout();
  const current = session.state().active;
  if (readout.status !== "running" || !current || readout.fraction === null || current.snapshot.remainingMs === null) return;
  const notifications = await load().catch(() => null);
  if (!notifications) return;
  await cancel();
  const seconds = Math.max(1, Math.round(readout.clock));
  const breaking = readout.phase !== "focus";
  scheduled = await notifications.scheduleNotificationAsync({
    content: { title: breaking ? "Break's over" : "Time for a break", body: current.title, sound: true },
    trigger: { type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  }).catch(() => null);
}
