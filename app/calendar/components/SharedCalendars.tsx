"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import type { SharedCalendarSummary } from "@/lib/calendar/shared-contracts";
import { getClientSessionEpoch } from "@/lib/client-data-cache";
import { calendarRequest } from "./useCalendarWorkspace";
import styles from "../Workspace.module.css";
import schedule from "../Scheduling.module.css";
export default function SharedCalendars() {
  const [open, setOpen] = useState(false),
    [calendars, setCalendars] = useState<SharedCalendarSummary[] | null>(null),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<{
      id: string;
      action: "delete" | "leave";
      revision: number;
    } | null>(null);
  const createAttempt = useRef<{ id: string; name: string } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const epoch = getClientSessionEpoch();
    try {
      const r = await calendarRequest("/api/calendar/shared", {
          signal,
          cache: "no-store",
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!signal?.aborted && epoch === getClientSessionEpoch())
        setCalendars(data.calendars);
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Shared calendars could not load."
        );
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController(),
      frame = requestAnimationFrame(() => void load(c.signal)),
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void load(c.signal);
      }, 30000);
    return () => {
      c.abort();
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [open, load]);
  const act = async (command: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    const epoch = getClientSessionEpoch();
    try {
      const r = await calendarRequest("/api/calendar/shared", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (epoch !== getClientSessionEpoch()) return;
      setConfirm(null);
      if (command.action === "create") {
        setName("");
        createAttempt.current = null;
      }
      await load();
      window.dispatchEvent(new Event("calendar-content-updated"));
    } catch (e) {
      if (epoch === getClientSessionEpoch()) {
        setError(e instanceof Error ? e.message : "Sharing could not update.");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={schedule.connectionSection}>
      <button
        className={schedule.advancedDisclosure}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          <strong>
            <Users size={16} /> Shared calendars
          </strong>
          <small>Optional spaces for events you choose to share.</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className={schedule.connectionBody}>
          <p>
            Only events created in a shared calendar are shared. Personal
            notebooks, study records, conversations and connected calendars
            remain private. Invitations need acceptance.
          </p>
          <div className={schedule.sharedCreate}>
            <label className={styles.field}>
              New shared calendar
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="Study group"
              />
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy || !name.trim()}
              onClick={() => {
                if (
                  !createAttempt.current ||
                  createAttempt.current.name !== name
                )
                  createAttempt.current = { id: crypto.randomUUID(), name };
                void act({ action: "create", ...createAttempt.current });
              }}
            >
              Create calendar
            </button>
          </div>
          {!calendars && !error && (
            <p role="status">Loading shared calendars…</p>
          )}
          {calendars?.map((c) => (
            <section key={c.id} className={schedule.connectionAccount}>
              <div className={schedule.connectionHeading}>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.role === "OWNER"
                      ? "You own this calendar"
                      : `Shared by @${c.owner.username} · ${c.role === "EDITOR" ? "Can edit" : "Can view"}`}
                    {c.status === "PENDING" ? " · Invitation pending" : ""}
                  </small>
                </span>
              </div>
              {c.status === "PENDING" ? (
                <div className={schedule.connectionActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy}
                    onClick={() =>
                      void act({ action: "respond", id: c.id, accept: true })
                    }
                  >
                    Accept invitation
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() =>
                      void act({ action: "respond", id: c.id, accept: false })
                    }
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <>
                  {c.role === "OWNER" && (
                    <>
                      <Invite calendar={c} busy={busy} onInvite={act} />
                      {c.members?.map((m) => (
                        <div className={schedule.sharedMember} key={m.userId}>
                          <span>
                            @{m.user.username}
                            <small>
                              {m.status === "PENDING" ? "Invited" : "Member"}
                            </small>
                          </span>
                          <select
                            aria-label={`Permission for ${m.user.username}`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) =>
                              void act({
                                action: "member",
                                id: c.id,
                                revision: c.revision,
                                userId: m.userId,
                                role: e.target.value,
                              })
                            }
                          >
                            <option value="VIEWER">Can view</option>
                            <option value="EDITOR">Can edit</option>
                          </select>
                          <button
                            type="button"
                            className={styles.textButton}
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "member",
                                id: c.id,
                                revision: c.revision,
                                userId: m.userId,
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <Rename calendar={c} busy={busy} onRename={act} />
                    </>
                  )}
                  <button
                    type="button"
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        id: c.id,
                        action: c.role === "OWNER" ? "delete" : "leave",
                        revision: c.revision,
                      })
                    }
                  >
                    {c.role === "OWNER"
                      ? "Delete shared calendar"
                      : "Leave calendar"}
                  </button>
                </>
              )}
              {confirm?.id === c.id && (
                <div className={schedule.confirm}>
                  <p>
                    {confirm.action === "delete"
                      ? `Delete “${c.name}” and all its shared events for every member? Personal content and provider calendars are kept.`
                      : `Leave “${c.name}”? You will lose access to its shared events.`}
                  </p>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        confirm.action === "delete"
                          ? confirm
                          : { action: "leave", id: c.id }
                      )
                    }
                  >
                    {confirm.action === "delete"
                      ? "Delete calendar"
                      : "Leave calendar"}
                  </button>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => setConfirm(null)}
                  >
                    Keep calendar
                  </button>
                </div>
              )}
            </section>
          ))}
          {calendars?.length === 0 && (
            <p>
              No shared calendars yet. Your personal calendar works
              independently.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
function Invite({
  calendar,
  busy,
  onInvite,
}: {
  calendar: SharedCalendarSummary;
  busy: boolean;
  onInvite: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [role, setRole] = useState("VIEWER");
  return (
    <div className={schedule.sharedInvite}>
      <label className={styles.field}>
        Invite by Sylf username
        <input
          value={username}
          maxLength={80}
          onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
          placeholder="username"
          autoComplete="off"
        />
      </label>
      <label className={styles.field}>
        Permission
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="VIEWER">Can view</option>
          <option value="EDITOR">Can edit events</option>
        </select>
      </label>
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={busy || !username.trim()}
        onClick={() =>
          void onInvite({
            action: "invite",
            id: calendar.id,
            revision: calendar.revision,
            username,
            role,
          })
        }
      >
        Invite
      </button>
    </div>
  );
}
function Rename({
  calendar,
  busy,
  onRename,
}: {
  calendar: SharedCalendarSummary;
  busy: boolean;
  onRename: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [value, setValue] = useState(calendar.name);
  return (
    <details>
      <summary>Calendar name</summary>
      <div className={schedule.sharedCreate}>
        <input
          aria-label={`Name for ${calendar.name}`}
          value={value}
          maxLength={100}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className={styles.textButton}
          disabled={busy || !value.trim() || value === calendar.name}
          onClick={() =>
            void onRename({
              action: "rename",
              id: calendar.id,
              revision: calendar.revision,
              name: value,
            })
          }
        >
          Save name
        </button>
      </div>
    </details>
  );
}
