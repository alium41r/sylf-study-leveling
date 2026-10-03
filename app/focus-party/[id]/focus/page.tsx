"use client";

// ============================================================================
// Dedicated Focus Room Page — Isolated Study Experience (Phase 4B)
// ============================================================================
// Fully isolated page rendered at /focus-party/[id]/focus.
// Zero social chrome, no sidebar, monumental live personal timer, live party
// chibis with aura, shared focus solidarity, pure epoch time derivation.
// ============================================================================

import React, { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import {
  FocusPartyProvider,
  useFocusParty,
} from "@/app/social/components/focus-party/FocusPartyContext";
import { FocusPartyRoom } from "@/app/social/components/focus-party/FocusPartyRoom";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";

interface FocusPartyFocusPageProps {
  params: Promise<{ id: string }>;
}

function FocusPartyRoomGate({ partyId }: { partyId: number }) {
  let router: any = null;
  try {
    router = useRouter();
  } catch {
    router = { push: () => {}, replace: () => {} };
  }

  const { user, isLoading: isAuthLoading } = useAuth();
  const {
    party,
    session,
    isLoading: isPartyLoading,
    error,
    enterFocus,
    myParticipant,
  } = useFocusParty();

  // Validate authentication and party membership
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace("/login");
      return;
    }

    if (!isPartyLoading && party && user) {
      const isMember = (party.members || []).some((m) => m.userId === user.id);
      if (!isMember) {
        // Not a member of this squad, redirect to Social lobby
        router.replace("/social?tab=party");
        return;
      }

      // If user is a member of the party and party has an active session,
      // but current user hasn't entered focus yet, enter them automatically.
      if (!myParticipant) {
        enterFocus().catch(() => {});
      }
    }
  }, [isAuthLoading, user, isPartyLoading, party, myParticipant, enterFocus, router]);

  // Loading state while verifying auth or establishing party connection
  if (isAuthLoading || (isPartyLoading && !party)) {
    return (
      <main
        data-testid="focus-room-loading-gate"
        className="min-h-screen w-full flex flex-col items-center justify-center bg-bg-void dark:bg-bg-abyss text-center font-['Rajdhani'] p-6"
      >
        <Loader2 className="w-10 h-10 text-accent-primary-light animate-spin mb-4" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Entering Dedicated Focus Room...
        </h2>
        <p className="text-xs text-text-muted/60 font-mono mt-1">
          Synchronizing authoritative study session
        </p>
      </main>
    );
  }

  // Error state if party cannot be found or loaded
  if (error && !party) {
    return (
      <main className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-bg-void dark:bg-bg-abyss text-center font-['Rajdhani']">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold uppercase tracking-wider text-text-primary mb-2">
          Unable to Join Focus Room
        </h2>
        <p className="text-sm text-text-muted font-mono max-w-md mb-6">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/social?tab=party")}
          className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/15 border border-border-subtle text-text-primary text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Social</span>
        </button>
      </main>
    );
  }

  return (
    <main
      data-testid="dedicated-focus-room"
      className="min-h-screen w-full bg-bg-abyss text-text-primary flex flex-col justify-between overflow-x-hidden"
    >
      <FocusPartyRoom />
    </main>
  );
}

export default function FocusPartyFocusPage({ params }: FocusPartyFocusPageProps) {
  const { id } = use(params);
  const partyId = parseInt(id, 10);

  if (isNaN(partyId)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-bg-abyss text-text-muted font-mono">
        Invalid Focus Party ID
      </div>
    );
  }

  return (
    <FocusPartyProvider partyIdOverride={partyId}>
      <FocusPartyRoomGate partyId={partyId} />
    </FocusPartyProvider>
  );
}
