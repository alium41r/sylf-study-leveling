"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Link2, RefreshCw } from "lucide-react";
import { getClientSessionEpoch } from "@/lib/client-data-cache";
import { calendarRequest } from "./useCalendarWorkspace";
import styles from "../Workspace.module.css";
import schedule from "../Scheduling.module.css";
interface Connection {
  id: string;
  provider: string;
  label: string;
  status: string;
  calendars: {
    id: string;
    name: string;
    writable: boolean;
    visible: boolean;
    planning: boolean;
    error: string | null;
    syncing: boolean;
    lastSyncedAt: string | null;
  }[];
}
interface ConnectionsData {
  configured: { google: boolean; microsoft: boolean };
  connections: Connection[];
  operations: {
    id: string;
    state: string;
    error: string | null;
    title: string;
  }[];
  webConnectionURL?: string;
}
export default function CalendarConnections() {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<ConnectionsData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [feed, setFeed] = useState(false),
    [name, setName] = useState(""),
    [url, setURL] = useState(""),
    [disconnect, setDisconnect] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const epoch = getClientSessionEpoch();
      const response = await calendarRequest("/api/calendar/connections", {
        cache: "no-store",
        signal,
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      if (!signal?.aborted && epoch === getClientSessionEpoch()) setData(next);
    } catch {
      if (!signal?.aborted)
        setError("Connections could not be loaded. Try again.");
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void load(controller.signal));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(controller.signal);
    }, 10000);
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [open, load]);
  const act = async (input: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const epoch = getClientSessionEpoch();
      const response = await calendarRequest("/api/calendar/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (epoch !== getClientSessionEpoch()) return;
      if (!response.ok)
        throw new Error(result.error || "Could not update this connection.");
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setDisconnect(null);
      if (input.action === "subscribe") {
        setURL("");
        setName("");
        setFeed(false);
      }
      await load();
      window.dispatchEvent(new Event("calendar-content-updated"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update this connection."
      );
    } finally {
      setBusy(false);
    }
  };
  const native = typeof window !== "undefined" && "Capacitor" in window;
  return (
    <section className={schedule.connectionSection}>
      <button
        type="button"
        className={schedule.advancedDisclosure}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <strong>
            <Link2 size={16} /> Connected calendars
          </strong>
          <small>Bring your appointments and classes into one place.</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className={schedule.connectionBody}>
          <p>
            Connections are optional. External reminders stay with their
            calendar provider.
          </p>
          {native && data?.webConnectionURL ? (
            <a
              className={styles.secondaryButton}
              href={data.webConnectionURL + "/calendar"}
              target="_blank"
              rel="noreferrer"
            >
              Connect Google or Outlook in your browser
            </a>
          ) : (
            <div className={schedule.connectionActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || !data?.configured.google}
                onClick={() =>
                  void act({ action: "connect", provider: "google" })
                }
              >
                <CalendarDays size={15} /> Google Calendar
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy || !data?.configured.microsoft}
                onClick={() =>
                  void act({ action: "connect", provider: "microsoft" })
                }
              >
                <CalendarDays size={15} /> Outlook
              </button>
            </div>
          )}
          {data && (!data.configured.google || !data.configured.microsoft) && (
            <p>
              Some providers need to be enabled by the app administrator before
              you can connect.
            </p>
          )}
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setFeed((v) => !v)}
            aria-expanded={feed}
          >
            Apple or another calendar subscription
          </button>
          {feed && (
            <div className={schedule.connectionFeed}>
              <p>
                Read-only HTTPS / webcal subscriptions, including shared iCloud
                calendar links. Anyone with a public feed link may be able to
                read that calendar. Sylf stores your link privately; it cannot
                edit subscribed events.
              </p>
              <label className={styles.field}>
                Calendar name
                <input
                  value={name}
                  maxLength={180}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Classes"
                />
              </label>
              <label className={styles.field}>
                Subscription URL
                <input
                  type="url"
                  value={url}
                  maxLength={3000}
                  onChange={(e) => setURL(e.target.value)}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || !name.trim() || !url.trim()}
                onClick={() => void act({ action: "subscribe", name, url })}
              >
                Add subscription
              </button>
            </div>
          )}
          {!data && !error && <p role="status">Loading connections…</p>}
          {data?.connections.map((connection) => (
            <section key={connection.id} className={schedule.connectionAccount}>
              <div className={schedule.connectionHeading}>
                <span>
                  <strong>{connection.label}</strong>
                  <small>
                    {connection.provider === "ics"
                      ? "Subscription · read only"
                      : connection.provider === "google"
                        ? "Google Calendar"
                        : "Outlook"}
                    {connection.status !== "ACTIVE"
                      ? " · Reconnection needed"
                      : ""}
                  </small>
                </span>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() => setDisconnect(connection.id)}
                >
                  Disconnect
                </button>
              </div>
              {connection.status !== "ACTIVE" &&
                connection.provider !== "ics" && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "connect",
                        provider: connection.provider,
                      })
                    }
                  >
                    Reconnect
                  </button>
                )}
              {connection.calendars.map((calendar) => (
                <div className={schedule.connectionCalendar} key={calendar.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={calendar.visible}
                      disabled={busy}
                      onChange={(e) =>
                        void act({
                          action: "calendar",
                          id: calendar.id,
                          visible: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <strong>{calendar.name}</strong>
                      <small>
                        {calendar.writable ? "Editable" : "Read only"} ·{" "}
                        {calendar.syncing
                          ? "Syncing…"
                          : calendar.lastSyncedAt
                            ? `Updated ${new Date(calendar.lastSyncedAt).toLocaleString()}`
                            : "Waiting for first sync"}
                      </small>
                    </span>
                  </label>
                  <label className={schedule.planningChoice}>
                    <input
                      type="checkbox"
                      checked={calendar.planning}
                      disabled={busy}
                      onChange={(e) =>
                        void act({
                          action: "calendar",
                          id: calendar.id,
                          planning: e.target.checked,
                        })
                      }
                    />{" "}
                    Include commitments in availability
                  </label>
                  {calendar.error && <p role="status">{calendar.error}</p>}
                </div>
              ))}
              {connection.provider !== "ics" && (
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() =>
                    void act({ action: "refresh", id: connection.id })
                  }
                >
                  Refresh calendar list
                </button>
              )}
              {disconnect === connection.id && (
                <div className={schedule.confirm}>
                  <p>
                    Disconnect this account? Its cached external events and
                    queued changes will be removed from Sylf. Provider events
                    and your Sylf events, notebooks, quests and goals are kept.
                    You can also revoke access in the provider’s account
                    settings.
                  </p>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={busy}
                    onClick={() =>
                      void act({ action: "disconnect", id: connection.id })
                    }
                  >
                    Disconnect account
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => setDisconnect(null)}
                  >
                    Keep connected
                  </button>
                </div>
              )}
            </section>
          ))}
          {data?.operations.length ? (
            <div>
              <h3>Changes awaiting confirmation from a provider</h3>
              {data.operations.map((op) => (
                <div className={schedule.connectionCalendar} key={op.id}>
                  <strong>{op.title}</strong>
                  <p>{op.error || "Waiting for the calendar provider."}</p>
                  {["PENDING", "RUNNING"].includes(op.state) ? (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => void act({ action: "retry", id: op.id })}
                    >
                      Retry approved change
                    </button>
                  ) : (
                    <small>
                      Refresh the event and review a new change to resolve this
                      conflict.
                    </small>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {data?.connections.length ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() => void act({ action: "sync" })}
            >
              <RefreshCw size={14} /> {busy ? "Updating…" : "Sync now"}
            </button>
          ) : null}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
