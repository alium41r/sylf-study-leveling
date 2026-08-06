"use client";

import React from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  danger = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`system-card relative w-full max-w-sm p-6 z-10 flex flex-col ${danger ? 'border-red-900/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'shadow-2xl'}`}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        
        <h2 className={`text-xl font-bold mb-4 font-rajdhani uppercase tracking-wide ${danger ? 'text-accent-red' : 'text-accent-cyan'}`}>
          {title}
        </h2>

        <div className="text-muted text-sm mb-6">
          {message}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
            Cancel
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onClose();
            }} 
            className={danger ? "btn-danger" : "btn-primary"}
            style={{ padding: "8px 16px", fontSize: "0.85rem" }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
