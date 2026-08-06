"use client";

import React, { useState } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";

interface DataAction {
  id: string;
  label: string;
  description: string;
  actionText: string;
  danger?: boolean;
}

export default function DataManagement() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    actionId: string | null;
  }>({ isOpen: false, actionId: null });

  const actions: DataAction[] = [
    {
      id: "export_archive",
      label: "Export Full Data Archive",
      description: "Download a comprehensive JSON file containing all your profile data, quests, and study history.",
      actionText: "Request Archive",
    },
    {
      id: "download_stats",
      label: "Download Study Statistics",
      description: "Export only your study sessions, focus rates, and subject logs as a CSV file.",
      actionText: "Download CSV",
    },
    {
      id: "import_preferences",
      label: "Import Preferences",
      description: "Restore your settings and theme preferences from a previously backed-up file.",
      actionText: "Import File",
    },
    {
      id: "reset_tutorial",
      label: "Reset System Tutorial",
      description: "Restart the onboarding tutorial to learn the system's features again.",
      actionText: "Reset",
      danger: true,
    }
  ];

  const handleActionClick = (id: string) => {
    setModalState({ isOpen: true, actionId: id });
  };

  const confirmAction = () => {
    // Placeholder for actual data management API calls
    console.log(`Action confirmed: ${modalState.actionId}`);
    setModalState({ isOpen: false, actionId: null });
  };

  const selectedAction = actions.find(a => a.id === modalState.actionId);

  return (
    <div className="pt-2">
      <SettingsRowGroup>
        {actions.map((action) => (
          <SettingsRow
            key={action.id}
            label={action.label}
            description={action.description}
            danger={action.danger}
          >
            <button 
              onClick={() => handleActionClick(action.id)} 
              className={`shrink-0 ${action.danger ? "btn-secondary !border-red-900/50 hover:!bg-red-900/20 hover:!border-red-500/50 text-danger" : "btn-secondary"}`}
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
        danger={selectedAction?.danger}
        confirmText="Proceed"
        message={
          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to proceed with this data management action? 
              {selectedAction?.danger && " This action may overwrite or reset your current state."}
            </p>
            <div className="p-3 bg-black/40 border border-white/10 rounded text-center italic text-xs text-accent-primary-light">
              <span className="opacity-70">Backend data processing coming soon...</span>
            </div>
          </div>
        }
      />
    </div>
  );
}
