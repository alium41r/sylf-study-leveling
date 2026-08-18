"use client";

import BackToSettings from "../../components/BackToSettings";
import SettingsSectionCard from "../../components/SettingsSectionCard";
import AccountInformation from "./AccountInformation";
import SecurityInformation from "./SecurityInformation";
import PrivacyInformation from "./PrivacyInformation";
import ConnectedAccounts from "./ConnectedAccounts";
import SessionsInformation from "./SessionsInformation";
import DangerZone from "./DangerZone";

export default function AccountSettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Config → Account</p>
      <h1 className="settings-page-header">Account</h1>

      <div className="flex flex-col gap-2 mt-8">
        <SettingsSectionCard
          title="Account Information"
          description="Manage your basic profile details, email address, and personal information."
        >
          <AccountInformation />
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Security"
          description="Update your password, configure two-factor authentication, and secure your account."
        >
          <SecurityInformation />
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Privacy"
          description="Control who can see your profile, stats, and achievements."
        >
          <PrivacyInformation />
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Connected Accounts"
          description="Manage your linked social accounts and third-party integrations."
        >
          <ConnectedAccounts />
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Sessions"
          description="Manage devices that are currently logged into your account."
        >
          <SessionsInformation />
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Danger Zone"
          description="Irreversible actions regarding your account data and access."
          danger={true}
        >
          <DangerZone />
        </SettingsSectionCard>
      </div>
    </div>
  );
}
