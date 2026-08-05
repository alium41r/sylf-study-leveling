"use client";

import BackToSettings from "../../components/BackToSettings";

export default function InventorySettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">System → Inventory</p>
      <h1 className="settings-page-header">Inventory</h1>

      <div className="settings-page-placeholder">
        <div className="settings-page-placeholder-icon">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <p className="settings-page-placeholder-text">
          Items & rewards inventory — Coming Soon
        </p>
      </div>
    </div>
  );
}
