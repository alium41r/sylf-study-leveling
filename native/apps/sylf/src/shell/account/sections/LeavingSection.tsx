// Leaving: reset progress and delete the account. Two steps each, in plain words. The first says what is lost, and the second is the proof the server
// requires. Nothing here can be reached by one press. Deleting an account leaves nothing of it on this device: the cache, and the owner's sessions and
// journal, go with it.
import { useState } from "react";
import { View } from "react-native";
import { Button, Dialog, Stack, Text, useNotice } from "@sylf/design-system";
import type { Proof, UserStats } from "@sylf/backend";
import { useBackend } from "../../backend";
import { useStudySession } from "../../context";
import { ProofSheet } from "../ProofSheet";
import { AccountSection } from "./Section";

type Step = { kind: "reset" | "delete"; stage: "warn" | "prove" } | null;

export function LeavingSection({ stats, onPlace, onDeleted }: { stats: UserStats; onPlace: (id: string, y: number) => void; onDeleted: () => void }) {
  const backend = useBackend();
  const session = useStudySession();
  const notice = useNotice();
  const [step, setStep] = useState<Step>(null);
  const by = stats.verificationStatus === "UNVERIFIED" ? "password" : "code";

  const reset = async (proof: Proof) => {
    if (!backend) return;
    await backend.reads.account.resetProgress(proof);
    for (const tag of ["progress", "traveller", "today", "sessions", "plan"]) backend.resources.invalidate(tag);
    notice("Your progress was reset.");
  };
  const remove = async (proof: Proof) => {
    if (!backend) return;
    const owner = backend.auth.getSnapshot().userId ?? stats.id ?? null;
    await backend.reads.account.deleteAccount(proof);
    // The account is gone, so what the device held for it is too: its sessions, its unsent journal, and every cached read.
    if (session.state().active?.ownerId === owner) session.end();
    if (owner !== null) { session.forgetOwner(owner); backend.forgetOwner(owner); }
    onDeleted();
    await backend.auth.signOut();
  };

  return (
    <AccountSection id="leaving" title="Leaving" onPlace={onPlace}>
      <Stack gap="md">
        <Text variant="small" tone="soft">These can't be undone.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button title="Reset progress" variant="ghost" testID="account-reset-progress" onPress={() => setStep({ kind: "reset", stage: "warn" })} />
          <Button title="Delete account" variant="critical" testID="account-delete" onPress={() => setStep({ kind: "delete", stage: "warn" })} />
        </View>
      </Stack>
      <Dialog
        open={step?.stage === "warn"}
        onClose={() => setStep(null)}
        title={step?.kind === "delete" ? "Delete your account?" : "Reset your progress?"}
        message={step?.kind === "delete"
          ? "Your account, study record, quests, goals, friends and everything you own are permanently deleted, on every device. This can't be undone."
          : "Your level, XP, streak, Sylph history, every quest and every study session are erased. Your account, friends, subjects and purchases stay. End a running session first. This can't be undone."}
        actions={[{ label: "Keep my account", onPress: () => setStep(null) }, { label: "Continue", variant: "critical", onPress: () => setStep(step ? { ...step, stage: "prove" } : null) }]}
      />
      <ProofSheet
        open={step?.stage === "prove"}
        onClose={() => setStep(null)}
        action={step?.kind === "delete" ? "DELETE_ACCOUNT" : "RESET_PROGRESS"}
        title={step?.kind === "delete" ? "Delete account" : "Reset progress"}
        consequence={by === "password" ? "Enter your password to confirm." : `We'll email a code to ${stats.email ?? "your address"}. Enter it to confirm.`}
        confirmLabel={step?.kind === "delete" ? "Delete everything" : "Reset progress"}
        by={by}
        critical
        onConfirm={step?.kind === "delete" ? remove : reset}
      />
    </AccountSection>
  );
}
