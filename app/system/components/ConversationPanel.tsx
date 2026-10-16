"use client";

import { useCallback } from "react";
import { SylvieIcon } from "@/app/components/icons";
import type { QuotaInfo } from "@/app/components/AiPlannerPanel";
import type { SystemChatSession } from "./SessionSidebar";
import ChatComposer from "@/app/components/system/chat/ChatComposer";
import ChatConversation from "@/app/components/system/chat/ChatConversation";
import { useSylvieChat } from "@/app/components/system/chat/useSylvieChat";
import styles from "@/app/components/system/chat/Chat.module.css";

interface ConversationPanelProps {
  sessionId: number | null; sessionTitle: string; chatQuota: QuotaInfo | null;
  modelPref: "auto" | "deepseek" | "gemini" | "groq"; isDevMode: boolean;
  onSessionCreated: (session: SystemChatSession) => void; onQuotaRefresh: () => void; onOpenPlanner: () => void;
}
const starters = [
  ["Explain a concept", "Help me understand a concept with a clear explanation and an example."],
  ["Plan my week", "Help me plan my study week."],
  ["Quiz me", "Help me practice with an active recall quiz."],
  ["Review my routine", "Help me review my study routine and improve my focus."],
];

export default function ConversationPanel({ sessionId, chatQuota, modelPref, isDevMode, onSessionCreated, onQuotaRefresh }: ConversationPanelProps) {
  const chat = useSylvieChat({ sessionId, modelPreference: modelPref, multipart: true, pageContext: { path: "/system" }, onQuotaRefresh,
    onSession: value => { if (value.session) onSessionCreated(value.session as SystemChatSession); } });
  const { send: sendChat } = chat;
  const confirm = useCallback((token: string) => { void sendChat("Confirm change", null, token); }, [sendChat]);
  const { draft: input, setDraft: setInput } = chat;
  const exhausted = chat.quotaReached || (chatQuota && !chatQuota.unlimited && chatQuota.remaining === 0);
  return <div className={styles.surface}>
    <ChatConversation messages={chat.messages} busy={chat.busy} loading={chat.loading} historyError={chat.historyError} viewKey={chat.viewKey}
      onConfirm={confirm} onReload={chat.reload} onReuse={chat.media.addReference} showModels={isDevMode}
      empty={<div className={styles.empty}><SylvieIcon size={38} /><h2>What can I help you with?</h2>
        <div className={styles.suggestions}>{starters.map(([label, prompt]) => <button key={label} type="button" onClick={() => setInput(prompt)}>{label}</button>)}</div>
      </div>} />
    {exhausted && <p className={styles.notice} role="status"><strong>Daily AI message limit reached</strong><span>Planner requests and confirmations are still available.</span></p>}
    <ChatComposer key={chat.viewKey} resetKey={chat.viewKey} value={input} onChange={setInput} onSend={() => chat.submitDraft()} onStop={chat.stop} busy={chat.busy} disabled={chat.loading}
      images={chat.media.images} onFilesAdded={chat.media.addFiles} onImageRemove={chat.media.remove} imageError={chat.media.error} uploading={chat.uploading} sendLabel="Send" footer={chatQuota && <span>{chatQuota.unlimited ? "Unlimited messages" : `${chatQuota.remaining ?? "–"} messages left`}</span>} />
  </div>;
}
