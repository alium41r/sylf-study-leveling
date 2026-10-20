"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { apiFetch, fetchWithTimeout } from "@/lib/api-transport";
import { getClientSessionEpoch } from "@/lib/client-data-cache";
import styles from "../Scheduling.module.css";

type Reminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  minutes: number;
};
export const browserReminderKey = (id: number) => `sylf_calendar_browser:${id}`;
export function browserRemindersEnabled(id: number) {
  try {
    return localStorage.getItem(browserReminderKey(id)) === "true";
  } catch {
    return false;
  }
}
export default function CalendarReminderAgent() {
  const { user } = useAuth();
  const [alert, setAlert] = useState<{
    owner: number;
    items: Reminder[];
  } | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const owner = user.id,
      epoch = getClientSessionEpoch();
    const controller = new AbortController();
    let busy = false,
      lastCheck = 0;
    const check = async () => {
      if (busy || Date.now() - lastCheck < 45000) return;
      busy = true;
      lastCheck = Date.now();
      try {
        const response = await fetchWithTimeout(
          (path, options) => apiFetch(String(path), options),
          "/api/calendar/reminders",
          {
            method: "POST",
            credentials: "include",
            signal: controller.signal,
          }
        );
        if (!response.ok) return;
        const result = (await response.json()) as { reminders: Reminder[] };
        if (
          controller.signal.aborted ||
          epoch !== getClientSessionEpoch() ||
          !result.reminders.length
        )
          return;
        setAlert({ owner, items: result.reminders });
        window.dispatchEvent(new Event("notifications-updated"));
        if (
          browserRemindersEnabled(owner) &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const first = result.reminders[0];
          try {
            const title =
              result.reminders.length > 1
                ? `${result.reminders.length} calendar reminders`
                : first.title;
            const body = `${first.time}${result.reminders.length > 1 ? " · Open Sylf to see all" : ""}`;
            const registration =
              "serviceWorker" in navigator
                ? await navigator.serviceWorker.getRegistration("/")
                : undefined;
            if (registration?.active)
              await registration.showNotification(title, {
                body,
                tag: "sylf-calendar-reminders",
                data: { calendarDate: first.date },
              });
            else {
              const notification = new Notification(title, {
                body,
                tag: "sylf-calendar-reminders",
              });
              notification.onclick = () => {
                window.focus();
                window.location.assign(`/calendar?date=${first.date}`);
                notification.close();
              };
            }
          } catch {
            /* Some mobile browsers expose Notification without constructors. Inbox and in-app alerts remain available. */
          }
        }
      } catch {
        /* Polling/visibility/online retries are the fallback; no offline claims. */
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60000);
    const wake = () => void check();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [user?.id]);
  const visible = alert?.owner === user?.id ? alert : null;
  return visible ? (
    <aside
      className={styles.reminderToast}
      role="status"
      aria-label="Calendar reminders"
    >
      <Bell size={20} />
      <div>
        <strong>
          {visible.items.length > 1
            ? `${visible.items.length} calendar reminders`
            : visible.items[0].title}
        </strong>
        <p>{visible.items[0].time}</p>
        <Link
          href={`/calendar?date=${visible.items[0].date}`}
          onClick={() => setAlert(null)}
        >
          Open calendar
        </Link>
      </div>
      <button aria-label="Dismiss reminder" onClick={() => setAlert(null)}>
        <X size={17} />
      </button>
    </aside>
  ) : null;
}
