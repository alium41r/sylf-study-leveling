"use client";

import React, { useState } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";

interface DangerAction {
  id: string;
  label: string;
  description: string;
  actionText: string;
}

export default function DangerZone() {
  const { logout } = useAuth();
  
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    actionId: string | null;
  }>({ isOpen: false, actionId: null });

  const actions: DangerAction[] = [
    {
      id: "logout",
      label: "Log Out",
      description: "Sign out of your account on this device.",
      actionText: "Log Out",
    },
    {
      id: "logout_all",
      label: "Log Out All Devices",
      description: "Sign out from everywhere. Useful if you suspect your account has been compromised.",
      actionText: "Log Out Everywhere",
    },
    {
      id: "reset_customization",
      label: "Reset Customizations",
      description: "Revert all your cosmetic choices (Avatar, Frame, Theme, etc.) to the system defaults.",
      actionText: "Reset Cosmetics",
    },
    {
      id: "reset_progress",
      label: "Reset Progress",
      description: "Erase your hunter rank, level, and XP. This keeps your account active but starts you from Level 1.",
      actionText: "Reset Progress",
    },
    {
      id: "delete_account",
      label: "Delete Account",
      description: "Permanently erase your account, study data, quests, and all associations. This cannot be undone.",
      actionText: "Delete Account",
    }
  ];

  const handleActionClick = (id: string) => {
    setModalState({ isOpen: true, actionId: id });
  };

  const confirmAction = () => {
    if (modalState.actionId === "logout") {
      logout();
    } else {
      console.log(`Danger action confirmed: ${modalState.actionId}`);
    }
    setModalState({ isOpen: false, actionId: null });
  };

  const selectedAction = actions.find(a => a.id === modalState.actionId);

  return (
    <div className="pt-2">
      <SettingsRowGroup danger={true}>
        {actions.map((action) => (
          <SettingsRow
            key={action.id}
            label={action.label}
            description={action.description}
            danger={true}
          >
            <button 
              onClick={() => handleActionClick(action.id)} 
              className="btn-danger shrink-0"
              style={{ padding: "6px 16px", fontSize: "0.75rem" }}
            >
              {action.actionText}
            </button>
          </SettingsRow>
        ))}
      </SettingsRowGroup>

      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, actionId: null })}
        onConfirm={confirmAction}
        title={selectedAction?.label || "Confirm Action"}
        danger={true}
        confirmText={selectedAction?.actionText || "Proceed"}
        message={
          <div className="space-y-4">
            <p className="text-gray-300">
              {selectedAction?.id === "logout" 
                ? "Are you sure you want to sign out?" 
                : "You are about to perform a highly destructive action. This process may be irreversible once completed."}
            </p>
            <div className="p-3 bg-red-950/40 border border-red-900/50 rounded text-center italic text-xs text-accent-red">
              <span className="opacity-80">
                {selectedAction?.id === "logout" ? "You will be redirected to the login screen." : "Backend integration coming soon..."}
              </span>
            </div>
          </div>
        }
      />
    </div>
  );
}
