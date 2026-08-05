"use client";

import BackToSettings from "../../components/BackToSettings";

export default function AccountSettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Config → Account</p>
      <h1 className="settings-page-header">Account</h1>

      <div className="settings-page-placeholder">
        <div className="settings-page-placeholder-icon">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <p className="settings-page-placeholder-text">
          Account management & profile — Coming Soon
        </p>
      </div>
    </div>
  );
}
