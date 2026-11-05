// One Sylvie turn at a time, on the one runtime (`system-messages/chat`): streamed text, honest status words, a proposal she signed, and its single-use
// confirmation. Quotas, tools and model choice stay on the server. Quick-ask uses this; Workspace's tool carries the same logic inline and moves onto
// it when it is next touched.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Backend } from "@sylf/backend";
import { describeFailureText } from "../account/failure";

export interface Proposal { chatId: number; token: string; summary: string }

export function useSylvieTurn(backend: Backend | null) {
  const [asked, setAsked] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [planRequest, setPlanRequest] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);

  const send = useCallback(async (message: string) => {
    if (!backend || working || !message.trim()) return false;
    const controller = new AbortController();
    flight.current = controller;
    setAsked(message.trim()); setReply(""); setAnswer(null); setStatus(null); setFailure(null); setProposal(null); setPlanRequest(null); setWorking(true);
    let ok = false;
    try {
      const done = await backend.reads.sendToSylvie(message.trim(), chatId, { onDelta: setReply, onReset: () => setReply(""), onSession: setChatId, onStatus: setStatus }, controller.signal);
      setChatId(done.chatId); setAnswer(done.reply);
      if (done.pendingAction && done.chatId !== null) setProposal({ chatId: done.chatId, token: done.pendingAction.token, summary: done.pendingAction.summary });
      setPlanRequest(done.planRequest);
      backend.resources.invalidate("sylvie");
      ok = true;
    } catch (error) {
      if ((error as { kind?: string }).kind !== "cancelled") setFailure(describeFailureText(error));
    }
    setWorking(false); setStatus(null);
    return ok;
  }, [backend, chatId, working]);

  /** Applies exactly what the server signed, once. A newer message, an expired token or a changed calendar makes the server refuse in its own words. */
  const confirm = useCallback(async () => {
    if (!backend || !proposal || working) return;
    setWorking(true); setFailure(null);
    try {
      await backend.reads.confirmSylvieAction(proposal.chatId, proposal.token);
      for (const tag of ["sylvie", "plan", "today", "progress"]) backend.resources.invalidate(tag);
    } catch (error) { setFailure(describeFailureText(error)); }
    setProposal(null); setWorking(false);
  }, [backend, proposal, working]);

  /** Continue an earlier conversation (or start a fresh one with null). The words of the last turn are cleared, and the thread's own history is read by the caller. */
  const adopt = useCallback((id: number | null) => { flight.current?.abort(); setChatId(id); setAsked(null); setReply(""); setAnswer(null); setProposal(null); setPlanRequest(null); setFailure(null); setStatus(null); setWorking(false); }, []);

  const reset = useCallback(() => { flight.current?.abort(); setAsked(null); setReply(""); setAnswer(null); setProposal(null); setPlanRequest(null); setFailure(null); setStatus(null); setWorking(false); }, []);
  return { asked, text: working ? reply : answer ?? reply, status, proposal, planRequest, failure, working, chatId, send, confirm, adopt, dismiss: () => setProposal(null), reset };
}
