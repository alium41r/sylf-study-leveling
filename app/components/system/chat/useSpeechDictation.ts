"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

interface SpeechResult { isFinal: boolean; [index: number]: { transcript: string } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean;
  onstart: (() => void) | null; onend: (() => void) | null; onspeechend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface SpeechConstructor { new(): Recognition; available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string> }
const constructor = () => typeof window === "undefined" ? undefined : (window as unknown as { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechConstructor }).webkitSpeechRecognition;
const subscribe = () => () => {};
let activeDictation: (() => void) | undefined;
/** Release the microphone before a surface's exit animation retains its old children. */
export function cancelActiveDictation() { activeDictation?.(); }
type Phase = "idle" | "starting" | "listening" | "processing";
const append = (base: string, speech: string) => !speech ? base : `${base}${base && !/\s$/.test(base) ? " " : ""}${speech}`;

/** Browser owns microphone/audio; Sylf keeps editable text only, never records a Blob. */
export function useSpeechDictation(value: string, onChange: (value: string) => void, enabled: boolean, resetKey: string | number, maxLength: number) {
  const supported = useSyncExternalStore(subscribe, () => Boolean(constructor()), () => false);
  const [phase, setPhase] = useState<Phase>("idle"), [error, setError] = useState("");
  const [local, setLocal] = useState(false);
  const active = useRef<Recognition | null>(null), generation = useRef(0), base = useRef(""), final = useRef(""), draft = useRef("");
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ value, onChange, maxLength });
  useLayoutEffect(() => { latest.current = { value, onChange, maxLength }; });
  const dispose = useCallback(() => {
    generation.current++; clearTimeout(timeout.current);
    const recognition = active.current; active.current = null;
    if (recognition) { activeDictation = undefined; recognition.onstart = recognition.onend = recognition.onspeechend = recognition.onerror = recognition.onresult = null; try { recognition.abort(); } catch {} }
  }, []);
  const cancel = useCallback(() => {
    const inProgress = active.current !== null;
    dispose(); if (inProgress) { latest.current.onChange(base.current); activeDictation = undefined; }
    setPhase("idle"); setError("");
  }, [dispose]);
  const start = useCallback(async () => {
    if (!enabled || active.current) return;
    const Ctor = constructor();
    if (!Ctor) { setError("Dictation isn’t available in this browser. Try your keyboard’s dictation control."); return; }
    activeDictation?.(); activeDictation = cancel;
    let recognition: Recognition;
    try { recognition = new Ctor(); }
    catch { if (activeDictation === cancel) activeDictation = undefined; setError("Dictation isn’t available here. Try your keyboard’s microphone."); return; }
    active.current = recognition;
    const revision = ++generation.current;
    const current = () => revision === generation.current && active.current === recognition;
    base.current = latest.current.value; final.current = ""; draft.current = "";
    setError(""); setPhase("starting"); setLocal(false);
    recognition.lang = navigator.language || document.documentElement.lang || "en-US";
    recognition.continuous = true; recognition.interimResults = true;
    const commit = (speech: string) => {
      const text = append(base.current, speech);
      latest.current.onChange(text.slice(0, latest.current.maxLength));
      if (text.length > latest.current.maxLength) setError(`Dictation reached the ${latest.current.maxLength}-character limit. Edit your prompt before sending.`);
    };
    recognition.onstart = () => { if (current()) {
      clearTimeout(timeout.current); setPhase("listening");
      timeout.current = setTimeout(() => { if (current()) { commit(final.current); dispose(); setPhase("idle"); setError("Dictation ended after 90 seconds. Review the text, then continue if needed."); } }, 90000);
    } };
    recognition.onresult = event => {
      if (!current()) return;
      const results = Array.from(event.results);
      final.current = results.filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
      draft.current = results.map(result => result[0].transcript).join(" ").trim();
      commit(draft.current);
    };
    recognition.onspeechend = null;
    recognition.onend = () => {
      if (!current()) return;
      commit(final.current); dispose(); setPhase("idle");
      if (!final.current) setError("No speech was recognized. Try again.");
      if (activeDictation === cancel) activeDictation = undefined;
    };
    recognition.onerror = event => {
      if (!current()) return;
      commit(final.current); dispose(); setPhase("idle");
      setError(event.error === "not-allowed" || event.error === "service-not-allowed" ? "Microphone access was denied. Allow it in your browser settings, then try again."
        : event.error === "audio-capture" ? "No microphone is available. Check your audio input."
        : event.error === "no-speech" ? "No speech was recognized. Try again."
        : event.error === "network" ? "The browser’s speech service couldn’t connect. Check your connection and try again."
        : "Dictation was interrupted. Your typed text is safe; try again.");
      if (activeDictation === cancel) activeDictation = undefined;
    };
    try {
      timeout.current = setTimeout(() => { if (current()) { dispose(); setPhase("idle"); setError("The microphone didn’t start. Check permissions and try again."); } }, 20000);
      if ("processLocally" in recognition && Ctor.available) {
        const availability = await Ctor.available({ langs: [recognition.lang], processLocally: true }).catch(() => "unavailable");
        if (!current()) return;
        recognition.processLocally = availability === "available"; setLocal(recognition.processLocally);
      }
      if (current()) recognition.start();
    } catch { if (current()) { dispose(); setPhase("idle"); setError("Dictation couldn’t start. Check microphone permissions and try again."); } }
  }, [enabled, cancel, dispose]);
  const stop = useCallback(() => {
    const recognition = active.current; if (!recognition) return;
    clearTimeout(timeout.current);
    setPhase("processing");
    try { recognition.stop(); } catch { cancel(); return; }
    if (active.current !== recognition) return;
    timeout.current = setTimeout(() => { if (active.current === recognition) { latest.current.onChange(append(base.current, final.current).slice(0, latest.current.maxLength)); dispose(); setPhase("idle"); setError("Dictation stopped before processing finished. Review the text or try again."); } }, 5000);
  }, [cancel, dispose]);
  useEffect(() => {
    const interrupt = () => { if (document.hidden) cancel(); };
    const leave = () => cancel();
    document.addEventListener("visibilitychange", interrupt); window.addEventListener("pagehide", leave);
    return () => { document.removeEventListener("visibilitychange", interrupt); window.removeEventListener("pagehide", leave); dispose(); if (activeDictation === cancel) activeDictation = undefined; };
  }, [resetKey, cancel, dispose]);
  useEffect(() => { if (!enabled && active.current) cancel(); }, [enabled, cancel]);
  return { supported, phase, error, local, start, stop, cancel, active: phase !== "idle" };
}
