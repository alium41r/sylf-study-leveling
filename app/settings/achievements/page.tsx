"use client";

import BackToSettings from "../../components/BackToSettings";

export default function AchievementsSettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">System → Achievements</p>
      <h1 className="settings-page-header">Achievements</h1>

      <div className="settings-page-placeholder">
        <div className="settings-page-placeholder-icon">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <p className="settings-page-placeholder-text">
          Achievement tracking & milestones — Coming Soon
        </p>
      </div>
    </div>
  );
}
