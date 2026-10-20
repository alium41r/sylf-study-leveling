"use client";
import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Settings2, X } from "lucide-react";
import type { CalendarPreferences } from "@/lib/calendar/preferences";
import {
  browserReminderKey,
  browserRemindersEnabled,
} from "./CalendarReminderAgent";
import SharedCalendars from "./SharedCalendars";
import CalendarConnections from "./CalendarConnections";
import CalendarDialog from "./CalendarDialog";
import styles from "../Workspace.module.css";
import schedule from "../Scheduling.module.css";

export default function CalendarSettings({
  owner,
  settings,
  loaded,
  onChange,
  onClose,
  onStudySettings,
  onSearchNotes,
}: {
  owner: number;
  settings: CalendarPreferences;
  loaded: boolean;
  onChange: (patch: Partial<CalendarPreferences>) => void;
  onClose: () => void;
  onStudySettings: () => void;
  onSearchNotes?: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [browser, setBrowser] = useState(() => browserRemindersEnabled(owner));
  const [status, setStatus] = useState("");
  const enableBrowser = async () => {
    try {
      if (browser) {
        localStorage.setItem(browserReminderKey(owner), "false");
        setBrowser(false);
        setStatus(
          "Browser alerts are off on this device. In-app reminders remain enabled."
        );
        return;
      }
      if (!("Notification" in window) || !window.isSecureContext) {
        setStatus(
          "Browser alerts are unavailable here. In-app reminders remain available."
        );
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(
          permission === "denied"
            ? "Browser alerts are blocked. You can change this in your browser’s site settings."
            : "Permission was not granted. In-app reminders remain available."
        );
        return;
      }
      if ("serviceWorker" in navigator)
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      localStorage.setItem(browserReminderKey(owner), "true");
      setBrowser(true);
      setStatus("Browser alerts enabled on this device while Sylf is running.");
    } catch {
      setStatus(
        "Browser alerts could not be enabled. In-app reminders remain available."
      );
    }
  };
  return (
    <CalendarDialog labelledBy="calendar-settings-title" onClose={onClose}>
      <div className={styles.editor}>
        <header className={styles.dialogHeader}>
          <div className={styles.headingWithIcon}>
            <Settings2 size={21} />
            <h2 id="calendar-settings-title">Calendar settings</h2>
          </div>
          <button
            className={styles.iconButton}
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className={schedule.settingsBody}>
          <section>
            <h3>Reminders</h3>
            <p>
              Event reminders appear in Sylf’s inbox while the app is open.
              Sleeping or closed browsers cannot guarantee delivery; recent
              reminders catch up for five minutes after reopening.
            </p>
            <button
              className={styles.secondaryButton}
              onClick={() => void enableBrowser()}
              aria-pressed={browser}
            >
              <Bell size={15} />
              {browser ? "Browser alerts on" : "Enable browser alerts"}
            </button>
            {status && <p role="status">{status}</p>}
            <Link href="/settings/notifications" className={styles.textButton}>
              Manage notification preferences
            </Link>
          </section>
          <button className={styles.secondaryButton} onClick={onStudySettings}>
            Daily study target & rest days
          </button>
          <CalendarConnections />
          <SharedCalendars />
          <section className={schedule.advancedSettings}>
            <button
              className={schedule.advancedDisclosure}
              aria-expanded={advanced}
              onClick={() => setAdvanced((value) => !value)}
            >
              <span>
                <strong>Advanced Options</strong>
                <small>Shape a planning space that suits you.</small>
              </span>
              <ChevronDown size={18} />
            </button>
            {advanced && (
              <div>
                {onSearchNotes && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={onSearchNotes}
                  >
                    Find in notebooks
                  </button>
                )}
                {(
                  [
                    [
                      "timePlanning",
                      "Time planning",
                      "Add a time grid, drag handles, and resizing to day and week views.",
                    ],
                    [
                      "workload",
                      "Workload insights",
                      "See booked time, overlaps, and free windows between 8 AM and 8 PM.",
                    ],
                    [
                      "organization",
                      "Calendar organization",
                      "Show content filters and category controls above the calendar.",
                    ],
                    [
                      "detailedEvents",
                      "Detailed event controls",
                      "Expand recurrence, categories, colors, descriptions, and multiple reminders when opening events.",
                    ],
                  ] as const
                ).map(([key, title, description]) => (
                  <label key={key} className={schedule.settingRow}>
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    <input
                      role="switch"
                      type="checkbox"
                      checked={settings[key]}
                      disabled={!loaded}
                      onChange={(e) => onChange({ [key]: e.target.checked })}
                    />
                  </label>
                ))}
                <p>
                  Preferences sync to your account. Turning an option off only
                  hides its controls; existing events, time blocks, repeat
                  rules, notes, and reminders are kept.
                </p>
              </div>
            )}
          </section>
        </div>
        <footer className={styles.editorFooter}>
          <button className={styles.primaryButton} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </CalendarDialog>
  );
}
