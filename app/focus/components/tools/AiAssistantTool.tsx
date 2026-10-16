"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, History, RotateCcw, Trash2, X, GitBranch, Search } from "lucide-react";
import { useFocusTools } from "../FocusToolsContext";
import ChatComposer from "@/app/components/system/chat/ChatComposer";
import ChatConversation from "@/app/components/system/chat/ChatConversation";
import { useSylvieChat } from "@/app/components/system/chat/useSylvieChat";
import { SylvieIcon } from "@/app/components/icons";
import type { ChatSessionSummary } from "@/lib/ai/sylvie/chat-client";
import styles from "@/app/components/system/chat/Chat.module.css";

export default function AiAssistantTool() {
  const { subjectName, openTool } = useFocusTools();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false), [historyError, setHistoryError] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const chat = useSylvieChat({ pageContext: { path: "/focus", subject: subjectName || undefined }, onSession: value => {
    if (value.session) setSessions(previous => [value.session!, ...previous.filter(session => session.id !== value.sessionId)]);
  } });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("/api/chats", { signal: controller.signal }), fetch("/api/skills", { signal: controller.signal }).catch(() => null)])
      .then(async ([chats, unlocked]) => {
        const data = chats.ok ? await chats.json() : null, perks = unlocked?.ok ? await unlocked.json() : null;
        if (controller.signal.aborted) return;
        if (Array.isArray(data?.sessions)) setSessions(data.sessions);
        if (Array.isArray(perks?.unlockedSkills)) setSkills(perks.unlockedSkills.map((skill: { nodeKey: string }) => skill.nodeKey));
      }).catch(() => { if (!controller.signal.aborted) setHistoryError("Conversation history is unavailable. Try again later."); });
    return () => controller.abort();
  }, []);
  const { send: sendChat, draft: input, setDraft: setInput } = chat;
  const confirm = useCallback((token: string) => { void sendChat("Confirm change", null, token); }, [sendChat]);
  const saveNote = useCallback((text: string) => {
    try {
      const key = `focus_scratchpad_${subjectName ? subjectName.toLowerCase().replace(/\s+/g, "_") : "general"}`;
      localStorage.setItem(key, `${localStorage.getItem(key) || ""}\n\n### AI Note [${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}]\n${text}\n`);
      openTool("notes");
    } catch { setHistoryError("This note couldn’t be saved on this device."); }
  }, [subjectName, openTool]);
  const newChat = () => { chat.selectSession(null); setInput(""); setHistoryOpen(false); };
  const title = sessions.find(session => session.id === chat.sessionId)?.title || "New conversation";
  return <div className={styles.surface}>
    <header className={styles.toolbar}>
      <div className={styles.toolbarTitle}><span>Sylvie</span><span className={styles.muted}>{subjectName || "Study assistant"}</span></div>
      <div className={styles.toolbarActions}>
        <button type="button" className={styles.iconButton} title="Start New Chat Session" aria-label="New conversation" onClick={newChat}><Plus size={16} /></button>
        <button type="button" className={styles.iconButton} title="Reset Active Chat" aria-label="Reset active chat" onClick={newChat}><RotateCcw size={15} /></button>
        <button type="button" className={styles.iconButton} title="View All Past Conversations" aria-label="Conversation history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}><History size={17} /></button>
      </div>
    </header>
    {historyOpen ? <section className={styles.history} aria-label="Conversation history">
      <div className={styles.toolbar}><strong>Conversation History</strong><button type="button" className={styles.iconButton} aria-label="Close history" onClick={() => setHistoryOpen(false)}><X size={16} /></button></div>
      <button type="button" className={styles.textButton} onClick={newChat}><Plus size={15} />Start Blank Chat Session</button>
      {historyError && <p role="status">{historyError}</p>}
      {!sessions.length && <p className={styles.muted}>Your conversations will appear here.</p>}
      {sessions.map(session => <div key={session.id} className={styles.historyItem} data-active={session.id === chat.sessionId}>
        <button type="button" onClick={() => { chat.selectSession(session.id); setHistoryOpen(false); }}>{session.title}</button>
        <button type="button" className={styles.iconButton} aria-label={`Delete ${session.title}`} onClick={async () => {
          try {
            const result = await fetch(`/api/chats/${session.id}`, { method: "DELETE" });
            if (!result.ok) throw new Error("Delete unavailable");
            setSessions(previous => previous.filter(item => item.id !== session.id));
            if (chat.sessionId === session.id) newChat();
          } catch { setHistoryError("Couldn’t delete this conversation. Try again."); }
        }}><Trash2 size={14} /></button>
      </div>)}
    </section> : <ChatConversation compact messages={chat.messages} busy={chat.busy} loading={chat.loading} historyError={chat.historyError} viewKey={chat.viewKey}
      onConfirm={confirm} onReload={chat.reload} onReuse={chat.media.addReference} onSave={saveNote}
      empty={<div className={styles.empty}><SylvieIcon size={32} /><h2>What can I help you with?</h2></div>} />}
    {skills.includes("analyst-logic-breakdown") && !historyOpen && <div className={styles.suggestions}>
      <button type="button" onClick={() => { void chat.send("Please decompose this problem/theorem into formal step-by-step logic and verify every premise."); }}><GitBranch size={12} /> Decompose Logic</button>
      <button type="button" onClick={() => { void chat.send("Verify the mathematical proof rigorously and check for edge conditions or boundary violations."); }}><Search size={12} /> Verify Proof</button>
    </div>}
    {chat.quotaReached && <p className={styles.notice} role="status">Daily AI message limit reached. Planner requests and confirmations are still available.</p>}
    <ChatComposer key={chat.viewKey} resetKey={chat.viewKey} images={chat.media.images} onFilesAdded={chat.media.addFiles} onImageRemove={chat.media.remove} imageError={chat.media.error} uploading={chat.uploading} value={input} onChange={setInput} busy={chat.busy} disabled={chat.loading || historyOpen} onStop={chat.stop}
      placeholder={`Ask Sylvie about ${subjectName || "your studies"}…`} sendTitle="Send Message (Enter)"
      onSend={() => chat.submitDraft()}
      footer={<span className="truncate">{title}</span>} />
  </div>;
}
