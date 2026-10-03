"use client";

import BackToSettings from "@/app/components/BackToSettings";
import SettingsSectionCard from "@/app/components/SettingsSectionCard";
import AccountInformation from "../AccountInformation";
import SecurityInformation from "../SecurityInformation";
import PrivacyInformation from "../PrivacyInformation";
import ConnectedAccounts from "../ConnectedAccounts";
import SessionsInformation from "../SessionsInformation";
import DangerZone from "../DangerZone";
import styles from "../../components/SystemHubPage.module.css";
import { User, Lock, Shield, Link2, Monitor, AlertTriangle } from "lucide-react";

export function AccountSettingsScreen() {
  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {/* Navigation & Header */}
        <div>
          <BackToSettings />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 mb-6">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-['Rajdhani'] font-bold tracking-widest text-[var(--accent)] uppercase mb-2 ${styles.chip}`}>
                <Shield className="w-3.5 h-3.5" />
                <span>Config → Account</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--ink)]">
                Account Settings
              </h1>
              <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
                Manage your scholar identity, security credentials, privacy permissions, and device sessions.
              </p>
            </div>
          </div>
        </div>

        {/* Quick-Jump Section Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
          <a
            href="#identity"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-[var(--sub-surface)] border border-[var(--sub-border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line)] shrink-0"
          >
            Identity
          </a>
          <a
            href="#security"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-[var(--sub-surface)] border border-[var(--sub-border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line)] shrink-0"
          >
            Security
          </a>
          <a
            href="#privacy"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-[var(--sub-surface)] border border-[var(--sub-border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line)] shrink-0"
          >
            Privacy
          </a>
          <a
            href="#connections"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-[var(--sub-surface)] border border-[var(--sub-border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line)] shrink-0"
          >
            Connected
          </a>
          <a
            href="#sessions"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-[var(--sub-surface)] border border-[var(--sub-border)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line)] shrink-0"
          >
            Sessions
          </a>
          <a
            href="#danger"
            className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all bg-red-500/10 border border-red-500/30 text-red-400 hover:border-red-500 shrink-0"
          >
            Danger Zone
          </a>
        </div>

        {/* Section Cards */}
        <div className="flex flex-col gap-6">
          <SettingsSectionCard
            id="identity"
            title="Account Information"
            description="Manage your basic profile details, email address, and personal information."
            icon={<User className="w-5 h-5" />}
          >
            <AccountInformation />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="security"
            title="Security"
            description="Update your password, configure two-factor authentication, and secure your account."
            icon={<Lock className="w-5 h-5" />}
          >
            <SecurityInformation />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="privacy"
            title="Privacy"
            description="Control who can see your profile, stats, and achievements."
            icon={<Shield className="w-5 h-5" />}
          >
            <PrivacyInformation />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="connections"
            title="Connected Accounts"
            description="Manage your linked social accounts and third-party integrations."
            icon={<Link2 className="w-5 h-5" />}
          >
            <ConnectedAccounts />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="sessions"
            title="Sessions"
            description="Manage devices that are currently logged into your account."
            icon={<Monitor className="w-5 h-5" />}
          >
            <SessionsInformation />
          </SettingsSectionCard>

          <SettingsSectionCard
            id="danger"
            title="Danger Zone"
            description="Irreversible actions regarding your account data and access."
            icon={<AlertTriangle className="w-5 h-5" />}
            danger={true}
          >
            <DangerZone />
          </SettingsSectionCard>
        </div>
      </div>
    </div>
  );
}

export default AccountSettingsScreen;
