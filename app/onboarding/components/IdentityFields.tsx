"use client";

import React from "react";
import PasswordStrengthMeter from "../../components/PasswordStrengthMeter";
import { Eye, EyeOff, Check, AlertCircle, Loader2 } from "lucide-react";
import styles from "../Onboarding.module.css";

interface IdentityFieldsProps {
  email?: string;
  name: string;
  username: string;
  password?: string;
  showPassword?: boolean;
  usernameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  usernameMsg: string;
  onNameChange: (val: string) => void;
  onUsernameChange: (val: string) => void;
  onPasswordChange?: (val: string) => void;
  onToggleShowPassword?: () => void;
}

export function IdentityFields({
  email,
  name,
  username,
  password = "",
  showPassword = false,
  usernameStatus,
  usernameMsg,
  onNameChange,
  onUsernameChange,
  onPasswordChange,
  onToggleShowPassword,
}: IdentityFieldsProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {email && (
        <div className={styles.formGroup}>
          <label htmlFor="onboarding-email" className={styles.label}>
            <span>Account Email</span>
          </label>
          <input
            id="onboarding-email"
            type="email"
            value={email}
            disabled
            className={`${styles.input} opacity-70 cursor-not-allowed`}
          />
        </div>
      )}

      {/* Display Name */}
      <div className={styles.formGroup}>
        <label htmlFor="onboarding-name" className={styles.label}>
          <span>Display Name *</span>
        </label>
        <input
          id="onboarding-name"
          type="text"
          placeholder="e.g. Sung Jin-Woo"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={30}
          required
          className={styles.input}
        />
      </div>

      {/* Scholar Username */}
      <div className={styles.formGroup}>
        <label htmlFor="onboarding-username" className={styles.label}>
          <span>Scholar Handle / Username *</span>
          <span className={styles.labelOptional}>3-20 chars (a-z, 0-9, _)</span>
        </label>
        <div className="relative w-full">
          <input
            id="onboarding-username"
            type="text"
            placeholder="shadow_scholar"
            value={username}
            onChange={(e) =>
              onUsernameChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))
            }
            minLength={3}
            maxLength={20}
            required
            aria-describedby="username-feedback"
            className={`${styles.input} font-mono text-sm pr-10 ${
              usernameStatus === "taken" || usernameStatus === "invalid"
                ? "border-red-500/70 focus:border-red-500"
                : usernameStatus === "available"
                ? "border-green-500/70 focus:border-green-500"
                : ""
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            {usernameStatus === "checking" && (
              <Loader2 className="w-4 h-4 text-accent animate-spin" aria-hidden="true" />
            )}
            {usernameStatus === "available" && (
              <Check className="w-4 h-4 text-green-500 stroke-[3]" aria-hidden="true" />
            )}
            {(usernameStatus === "taken" || usernameStatus === "invalid") && (
              <AlertCircle className="w-4 h-4 text-red-400" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Live Feedback */}
        <div id="username-feedback" aria-live="polite" className="min-h-[1.25rem] mt-0.5">
          {usernameMsg && (
            <p
              className={`text-xs font-semibold m-0 flex items-center gap-1 ${
                usernameStatus === "taken" || usernameStatus === "invalid"
                  ? "text-red-400"
                  : usernameStatus === "available"
                  ? "text-green-400"
                  : "text-muted"
              }`}
            >
              {usernameMsg}
            </p>
          )}
        </div>
      </div>

      {/* Optional Password (For Google OAuth signups who want credentials login) */}
      {onPasswordChange && (
        <div className={styles.formGroup}>
          <label htmlFor="onboarding-password" className={styles.label}>
            <span>Security Password</span>
            <span className={styles.labelOptional}>Optional — enables email/password login</span>
          </label>
          <div className="relative w-full">
            <input
              id="onboarding-password"
              type={showPassword ? "text" : "password"}
              placeholder="Set a password (minimum 6 characters)"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="new-password"
              className={`${styles.input} pr-11`}
            />
            {onToggleShowPassword && (
              <button
                type="button"
                onClick={onToggleShowPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:text-ink transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
          {password && <PasswordStrengthMeter password={password} />}
        </div>
      )}
    </div>
  );
}
