"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarDays, MoreHorizontal, Plus, X } from "lucide-react";
import { SylvieIcon } from "../icons";
import type { PagePresence } from "./page-presence";
import type { QuotaInfo } from "../AiPlannerModal";
import { lockPageScroll } from "@/lib/scroll-lock";
import ChatComposer from "./chat/ChatComposer";
import { cancelActiveDictation } from "./chat/useSpeechDictation";
import ChatConversation from "./chat/ChatConversation";
import { useSylvieChat } from "./chat/useSylvieChat";
import chatStyles from "./chat/Chat.module.css";
import styles from "./SystemOverlay.module.css";

interface SystemOverlayProps {
  open: boolean; presence: PagePresence | null; chatQuota: QuotaInfo | null; sessionId: number | null;
  onSessionChange: (id: number | null, session?: { id: number; title: string } | null) => void;
  onQuotaRefresh: () => void; onOpenWorkspace: (id?: number | null) => void; onOpenPlanner: () => void; onClose: () => void;
}
export default function SystemOverlay({ open, presence, chatQuota, sessionId, onSessionChange, onQuotaRefresh, onOpenWorkspace, onOpenPlanner, onClose }: SystemOverlayProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [contextNotice, setContextNotice] = useState("");
  const dialog = useRef<HTMLElement>(null), actions = useRef<HTMLDivElement>(null), context = useRef(presence?.id);
  const reduceMotion = useReducedMotion();
  const chat = useSylvieChat({ sessionId, enabled: open && !!presence, pageContext: presence ? { path: presence.path } : undefined,
    onQuotaRefresh, onSession: value => onSessionChange(value.sessionId ?? null, value.session ?? null) });
  const { send: sendChat, stop, draft: input, setDraft: setInput } = chat;
  const confirm = useCallback((token: string) => { void sendChat("Confirm change", null, token); }, [sendChat]);
  const send = (text = input) => chat.submitDraft(text);
  const close = () => { cancelActiveDictation(); chat.stop(); setActionsOpen(false); onClose(); };
  const newChat = () => { chat.selectSession(null); setInput(""); setContextNotice(""); setActionsOpen(false); };

  useEffect(() => {
    if (context.current !== presence?.id && chat.messages.some(message => message.role === "user")) setContextNotice(presence ? `Now viewing ${presence.label}.` : "");
    context.current = presence?.id;
  }, [presence, chat.messages]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    const frame = requestAnimationFrame(() => dialog.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame); unlock();
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[data-system-companion="true"]')?.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => { cancelActiveDictation(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (actionsOpen) setActionsOpen(false); else { cancelActiveDictation(); stop(); onClose(); } }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [open, actionsOpen, onClose, stop]);
  useEffect(() => {
    if (!actionsOpen) return;
    const dismiss = (event: PointerEvent) => { if (!actions.current?.contains(event.target as Node)) setActionsOpen(false); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, [actionsOpen]);

  const exhausted = chat.quotaReached || (chatQuota && !chatQuota.unlimited && chatQuota.remaining === 0);
  return <AnimatePresence>{open && presence && <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .15 }} className={styles.scrim} onClick={close} aria-hidden="true" />
    <motion.section ref={dialog} role="dialog" aria-modal="true" aria-label={`Sylvie quick assistant — ${presence.label} context`} tabIndex={-1}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 8 }} transition={{ duration: reduceMotion ? 0 : .18 }} className={styles.dialog}>
      <header className={styles.header}>
        <div className={styles.identity}><SylvieIcon size={26} /><div className={styles.heading}><span className={styles.title}>Sylvie</span><span className={styles.context}>{presence.label}</span></div></div>
        <div className={styles.headerActions}>
          <div ref={actions} className={styles.actionsAnchor}>
            <button type="button" className={chatStyles.iconButton} onClick={() => setActionsOpen(value => !value)} aria-label="Conversation options" title="Conversation options" aria-expanded={actionsOpen} aria-controls="system-conversation-options"><MoreHorizontal size={18} /></button>
            {actionsOpen && <div id="system-conversation-options" className={styles.actionsMenu}>
              <button type="button" onClick={newChat}><Plus size={16} />New conversation</button>
              {presence.plannerHint && <button type="button" onClick={() => { cancelActiveDictation(); setActionsOpen(false); onOpenPlanner(); }}><CalendarDays size={16} />Create a study plan</button>}
            </div>}
          </div>
          <button type="button" className={chatStyles.iconButton} aria-label="Open in Sylvie workspace" title="Open in Sylvie workspace" onClick={() => { cancelActiveDictation(); chat.stop(); onOpenWorkspace(chat.sessionId); }}><ArrowUpRight size={17} /></button>
          <button type="button" className={chatStyles.iconButton} aria-label="Close conversation" title="Close (Esc)" onClick={close}><X size={18} /></button>
        </div>
      </header>
      {contextNotice && <p className={styles.contextNotice}>{contextNotice}</p>}
      <ChatConversation compact messages={chat.messages} busy={chat.busy} loading={chat.loading} historyError={chat.historyError} viewKey={chat.viewKey} onConfirm={confirm} onReload={chat.reload} onReuse={chat.media.addReference}
        empty={<div className={chatStyles.empty}><SylvieIcon size={32} /><h2>{presence.greeting}</h2></div>} />
      {!chat.messages.length && !chat.loading && <div className={styles.suggestions}>{presence.suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => send(suggestion)}>{suggestion}<ArrowUpRight size={12} /></button>)}</div>}
      {exhausted && <p className={chatStyles.notice} role="status">Daily AI message limit reached. Planner requests and confirmations are still available.</p>}
      <ChatComposer key={chat.viewKey} resetKey={chat.viewKey} speechEnabled={open} images={chat.media.images} onFilesAdded={chat.media.addFiles} onImageRemove={chat.media.remove} imageError={chat.media.error} uploading={chat.uploading} value={input} onChange={setInput} onSend={() => send()} onStop={chat.stop} busy={chat.busy} disabled={chat.loading}
        footer={chatQuota && <span>{chatQuota.unlimited ? "Unlimited" : `${chatQuota.remaining ?? "–"} messages left`}</span>} />
    </motion.section>
  </>}</AnimatePresence>;
}
