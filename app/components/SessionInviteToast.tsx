"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface Invite {
  id: number;
  sender: {
    name: string | null;
    username: string;
    hunterRank: string;
  };
  subject: {
    id: number;
    title: string;
  } | null;
  createdAt: string;
}

export function SessionInviteToast() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const res = await fetch("/api/invites");
        if (res.ok) {
          const data = await res.json();
          setInvites(data);
        }
      } catch (err) {
        console.error("Failed to fetch invites", err);
      }
    };

    fetchInvites();
    const interval = setInterval(fetchInvites, 30000); // 30s
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (inviteId: number, action: "ACCEPTED" | "DECLINED", subjectId?: number) => {
    try {
      await fetch(`/api/invites/${inviteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });

      setInvites(prev => prev.filter(inv => inv.id !== inviteId));

      if (action === "ACCEPTED") {
        if (subjectId) {
          router.push(`/focus?subjectId=${subjectId}`);
        } else {
          router.push("/focus");
        }
      }
    } catch (err) {
      console.error("Action failed", err);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {invites.map(invite => (
          <motion.div
            key={invite.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="system-card p-4 shadow-2xl flex flex-col gap-3 w-80 border-l-4 pointer-events-auto"
            style={{ borderLeftColor: "var(--accent-primary-light)" }}
          >
            <div>
              <h3 className="font-bold text-sm font-rajdhani text-accent-light">
                SESSION INVITE
              </h3>
              <p className="text-sm mt-1">
                <span className="font-medium text-white">{invite.sender.name || invite.sender.username}</span> invited you to study 
                {invite.subject ? (
                  <span className="font-medium text-accent-light"> {invite.subject.title}</span>
                ) : " together"}.
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleAction(invite.id, "ACCEPTED", invite.subject?.id)}
                className="flex-1 text-xs px-3 py-2 rounded font-medium transition-colors"
                style={{ background: "rgba(34, 197, 94, 0.2)", color: "var(--accent-green)", border: "1px solid rgba(34, 197, 94, 0.4)" }}
              >
                Join Session
              </button>
              <button 
                onClick={() => handleAction(invite.id, "DECLINED")}
                className="text-xs px-3 py-2 rounded text-gray-400 hover:bg-white/5 transition-colors"
              >
                Decline
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
