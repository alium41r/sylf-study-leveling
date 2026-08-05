"use client";

import BackToSettings from "../../components/BackToSettings";

export default function SyncSettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Config → Sync</p>
      <h1 className="settings-page-header">Sync</h1>

      <div className="settings-page-placeholder">
        <div className="settings-page-placeholder-icon">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <p className="settings-page-placeholder-text">
          Data sync & backup settings — Coming Soon
        </p>
      </div>
    </div>
  );
}
