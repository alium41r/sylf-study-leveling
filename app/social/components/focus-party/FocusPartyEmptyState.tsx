"use client";

import React, { useState } from "react";
import { Users, Plus, Mail, Check, X, Sparkles, Loader2 } from "lucide-react";
import { useFocusParty } from "./FocusPartyContext";

export function FocusPartyEmptyState() {
  const {
    createParty,
    respondToInvite,
    pendingInvites,
    isActionLoading,
    error,
    clearError,
  } = useFocusParty();

  const [partyName, setPartyName] = useState("");
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [actingInviteId, setActingInviteId] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createParty(partyName.trim() || undefined);
    setPartyName("");
    setShowCreateInput(false);
  };

  const handleInviteAction = async (inviteId: number, action: "ACCEPTED" | "DECLINED") => {
    setActingInviteId(inviteId);
    try {
      await respondToInvite(inviteId, action);
    } finally {
      setActingInviteId(null);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 py-4 font-['Rajdhani'] select-none">
      {/* ─── Hero Banner / No Party State ─────────────────────────────── */}
      <div className="relative overflow-hidden p-8 sm:p-12 text-center flex flex-col items-center justify-center border border-border-subtle rounded-3xl bg-white dark:bg-bg-panel backdrop-blur-2xl shadow-card dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)]">
        {/* Top subtle specular highlight */}
        <div className="absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 dark:bg-accent-primary/20 border border-accent-primary/30 flex items-center justify-center mb-5 shadow-sm dark:shadow-[0_0_25px_var(--accent-primary-dim)] text-accent-text-light">
          <Users className="w-8 h-8" />
        </div>

        <span className="text-xs uppercase tracking-widest text-accent-text-light font-bold mb-1">
          MULTIPLAYER STUDY SESSIONS
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold uppercase tracking-wider text-text-primary mb-3">
          Focus Party
        </h2>
        <p className="text-sm text-text-secondary dark:text-text-muted max-w-md mb-8 leading-relaxed">
          Study together with up to 4 friends in real-time. Share collective focus energy, synchronize study timers, and hold each other accountable.
        </p>

        {error && (
          <div className="w-full max-w-md system-message msg-warning mb-6 py-2.5 px-4 text-xs font-mono flex items-center justify-between rounded-xl">
            <span>{error}</span>
            <button onClick={clearError} className="text-text-muted hover:text-text-primary ml-2 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ─── Create Party Trigger or Inline Form ──────────────────── */}
        {!showCreateInput ? (
          <button
            type="button"
            data-testid="create-party-btn"
            onClick={() => setShowCreateInput(true)}
            disabled={isActionLoading}
            className="py-3.5 px-8 sm:px-10 rounded-2xl text-sm font-bold uppercase tracking-wider flex items-center gap-2.5 shadow-[0_4px_20px_var(--accent-primary-dim)] hover:shadow-[0_6px_28px_var(--accent-primary-mid)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
            style={{
              background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
              color: "#ffffff",
            }}
          >
            <Plus className="w-5 h-5 text-white" />
            <span className="text-white">Create Focus Party</span>
          </button>
        ) : (
          <form onSubmit={handleCreate} className="w-full max-w-md flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Party name (e.g. Midnight Grind)"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              maxLength={50}
              autoFocus
              className="flex-1 text-sm py-2.5 px-4 rounded-xl border border-border-subtle bg-slate-900/[0.03] dark:bg-white/[0.04] focus:border-accent-primary/60 text-text-primary placeholder:text-text-muted outline-none transition-all shadow-inner"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                data-testid="submit-create-party"
                disabled={isActionLoading}
                className="py-2.5 px-5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                  color: "#ffffff",
                }}
              >
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Plus className="w-4 h-4 text-white" />}
                <span className="text-white">Create</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreateInput(false)}
                disabled={isActionLoading}
                className="py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider border border-border-subtle bg-white hover:bg-slate-100 dark:bg-white/[0.02] dark:hover:bg-white/[0.06] text-text-muted hover:text-text-primary transition-colors cursor-pointer shadow-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ─── Pending Invitations Section ─────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <div className="relative overflow-hidden p-6 border border-border-subtle rounded-3xl bg-white dark:bg-bg-panel backdrop-blur-2xl shadow-card dark:shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center text-accent-text-light">
                <Mail className="w-4 h-4 text-accent-primary-light" />
              </div>
              <h3 className="text-base font-bold uppercase tracking-wider text-text-primary">
                Party Invitations ({pendingInvites.length})
              </h3>
            </div>
            <span className="text-xs text-text-muted font-mono">
              Pending Invites
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                data-testid={`party-invite-${inv.id}`}
                className="p-4 rounded-2xl bg-slate-900/[0.02] dark:bg-white/[0.02] border border-border-subtle hover:border-accent-primary/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-text-primary tracking-wide">
                      {inv.partyName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-accent-primary/15 border border-accent-primary/30 text-accent-text-light text-[10px] font-bold uppercase">
                      Invite
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    Invited by <span className="text-text-primary font-medium">{inv.senderName || `@${inv.senderUsername}`}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    data-testid={`accept-invite-${inv.id}`}
                    onClick={() => handleInviteAction(inv.id, "ACCEPTED")}
                    disabled={actingInviteId === inv.id || isActionLoading}
                    className="py-1.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    {actingInviteId === inv.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Accept</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`decline-invite-${inv.id}`}
                    onClick={() => handleInviteAction(inv.id, "DECLINED")}
                    disabled={actingInviteId === inv.id || isActionLoading}
                    className="py-1.5 px-3.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06] text-text-muted hover:text-text-primary border border-border-subtle dark:border-white/[0.08] text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
