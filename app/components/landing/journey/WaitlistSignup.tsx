"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import styles from "./Journey.module.css";

interface WaitlistPass {
  referralCode: string;
  position: number;
  referralCount: number;
  targetExam?: string | null;
  alreadyRegistered: boolean;
}
const STORAGE_KEY = "sylf_waitlist_pass";
function parsePass(value: unknown): WaitlistPass | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.referralCode !== "string" ||
    !/^[a-zA-Z0-9_-]{4,64}$/.test(data.referralCode) ||
    typeof data.position !== "number" ||
    !Number.isFinite(data.position) ||
    data.position < 1
  )
    return null;
  return {
    referralCode: data.referralCode,
    position: data.position,
    referralCount:
      typeof data.referralCount === "number" ? data.referralCount : 0,
    targetExam: typeof data.targetExam === "string" ? data.targetExam : null,
    alreadyRegistered: Boolean(data.alreadyRegistered),
  };
}
function persist(pass: WaitlistPass) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pass));
  } catch {
    /* Private browsing can disable storage. */
  }
}

export default function WaitlistSignup() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState<WaitlistPass | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    restoreController.current = controller;
    const restore = async () => {
      let stored: WaitlistPass | null = null;
      try {
        stored = parsePass(
          JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
        );
      } catch {
        /* Ignore invalid storage. */
      }
      if (stored) setPass({ ...stored, alreadyRegistered: true });
      const code = new URLSearchParams(window.location.search).get("pass");
      if (!code) return;
      setRestoring(true);
      try {
        const response = await fetch(
          `/api/waitlist?code=${encodeURIComponent(code)}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        const restored = parsePass(data);
        if (!response.ok || !data.success || !restored)
          throw new Error(
            "We couldn’t restore that pass. You can join again with the same email."
          );
        if (controller.signal.aborted) return;
        const next = { ...restored, alreadyRegistered: true };
        setPass(next);
        persist(next);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "We couldn’t restore your pass. Please try again."
          );
      } finally {
        if (!controller.signal.aborted) setRestoring(false);
      }
    };
    void restore();
    return () => {
      controller.abort();
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || restoring) return;
    setBusy(true);
    setError("");
    try {
      const referredBy =
        new URLSearchParams(window.location.search).get("ref") || undefined;
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), referredBy }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Couldn’t join the waitlist. Please try again."
        );
      const next = parsePass(data);
      if (!next)
        throw new Error(
          "We couldn’t confirm your pass. Please try again with the same email."
        );
      setPass(next);
      persist(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?ref=${pass.referralCode}`
      );
      setCopied(true);
      setError("");
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Copy isn’t available in this browser. Select and copy your referral link below."
      );
    }
  }

  function reset() {
    restoreController.current?.abort();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage may be disabled. */
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("pass");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
    setPass(null);
    setEmail("");
    setError("");
    setCopied(false);
    setRestoring(false);
  }
  const shareUrl =
    pass && typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${pass.referralCode}`
      : "";

  return (
    <div className={styles.signup}>
      {pass ? (
        <div className={styles.accessPass}>
          <div className={styles.passHeading}>
            <span className={styles.successIcon}>
              <Check size={20} />
            </span>
            <div>
              <strong>
                {pass.alreadyRegistered
                  ? "Your place is saved."
                  : "Your next chapter is reserved."}
              </strong>
              <p>
                You’re #{pass.position} on the waitlist. We’ll email you when
                it’s your turn.
              </p>
            </div>
          </div>
          <div className={styles.referralRow}>
            <code>{pass.referralCode}</code>
            <button type="button" onClick={copy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied!" : "Copy invite link"}
            </button>
          </div>
          <div className={styles.passActions}>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("I’m joining Sylf — where studying becomes a journey.")}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share on X
            </a>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join me on Sylf: ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <button type="button" onClick={reset}>
              <RotateCcw size={13} /> Different email
            </button>
          </div>
          {error && (
            <input
              className={styles.shareFallback}
              aria-label="Your referral link"
              value={shareUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
      ) : (
        <form onSubmit={submit} className={styles.signupForm}>
          <label htmlFor="journey-email" className={styles.visuallyHidden}>
            Email address
          </label>
          <div className={styles.signupFields}>
            <input
              id="journey-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={255}
              placeholder="Your email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "waitlist-error" : "waitlist-note"}
            />
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={busy || restoring}
            >
              {busy || restoring ? (
                <Loader2 className={styles.spinner} size={17} />
              ) : (
                <ArrowRight size={17} />
              )}
              <span>
                {restoring
                  ? "Restoring…"
                  : busy
                    ? "Joining…"
                    : "Join the waitlist"}
              </span>
            </button>
          </div>
          <p id="waitlist-note" className={styles.formNote}>
            <ShieldCheck size={14} /> Early access, at your pace. No spam, ever.
          </p>
        </form>
      )}
      {error && (
        <p id="waitlist-error" role="alert" className={styles.formError}>
          <AlertCircle size={16} />
          {error}
        </p>
      )}
      <span className={styles.visuallyHidden} role="status">
        {copied
          ? "Invite link copied to clipboard"
          : pass
            ? "You are registered on the waitlist"
            : ""}
      </span>
    </div>
  );
}
