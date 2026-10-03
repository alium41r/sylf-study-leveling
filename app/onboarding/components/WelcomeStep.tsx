"use client";

import React from "react";
import Companion from "@/app/components/landing/companion/Companion";
import { IdentityFields } from "./IdentityFields";
import { Timer, Compass, Zap, ArrowRight } from "lucide-react";
import styles from "../Onboarding.module.css";

interface WelcomeStepProps {
  isGoogleSignup: boolean;
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
  onNext: () => void;
}

export function WelcomeStep({
  isGoogleSignup,
  email,
  name,
  username,
  password,
  showPassword,
  usernameStatus,
  usernameMsg,
  onNameChange,
  onUsernameChange,
  onPasswordChange,
  onToggleShowPassword,
  onNext,
}: WelcomeStepProps) {
  const canProceed = !isGoogleSignup || (name.trim().length > 0 && username.length >= 3 && usernameStatus === "available");

  return (
    <div className={styles.stepCard}>
      {/* ─── Companion Anchor & Header ─── */}
      <div className={styles.stepHeader}>
        <div className="flex items-center justify-center my-1">
          <Companion state="GREETING" size={130} />
        </div>
        <span className={styles.stepEyebrow}>Study Leveling System</span>
        <h1 className={styles.stepTitle}>Welcome to Sylf</h1>
        <p className={styles.stepSubtitle}>
          Turn focused study into real progress. Level up your knowledge, conquer coursework, and rise through the Hunter ranks.
        </p>
      </div>

      {/* ─── Compact Core Loop Overview ─── */}
      <div className={styles.loopGrid} aria-label="The Sylf Study Loop">
        <div className={styles.loopCard}>
          <div className={styles.loopIconBox} aria-hidden="true">
            <Timer className="w-5 h-5" />
          </div>
          <h2 className={styles.loopTitle}>1. Focus</h2>
          <p className={styles.loopDesc}>
            Log deep work sessions with ambient audio & study modes.
          </p>
        </div>

        <div className={styles.loopCard}>
          <div className={styles.loopIconBox} aria-hidden="true">
            <Compass className="w-5 h-5" />
          </div>
          <h2 className={styles.loopTitle}>2. Quests</h2>
          <p className={styles.loopDesc}>
            Transform syllabi into adaptive daily learning objectives.
          </p>
        </div>

        <div className={styles.loopCard}>
          <div className={styles.loopIconBox} aria-hidden="true">
            <Zap className="w-5 h-5" />
          </div>
          <h2 className={styles.loopTitle}>3. Level Up</h2>
          <p className={styles.loopDesc}>
            Earn XP, climb from E to S-Rank, and build cognitive stats.
          </p>
        </div>
      </div>

      {/* ─── Identity Fields for Google OAuth Users ─── */}
      {isGoogleSignup && (
        <div className="pt-2 border-t border-[var(--subtle-line)]">
          <div className="mb-3 text-left">
            <h3 className="font-['Rajdhani'] font-bold text-base text-ink uppercase tracking-wide m-0">
              Confirm Your Scholar Handle
            </h3>
            <p className="text-xs text-muted m-0">
              Choose your public handle to complete your registration.
            </p>
          </div>

          <IdentityFields
            email={email}
            name={name}
            username={username}
            password={password}
            showPassword={showPassword}
            usernameStatus={usernameStatus}
            usernameMsg={usernameMsg}
            onNameChange={onNameChange}
            onUsernameChange={onUsernameChange}
            onPasswordChange={onPasswordChange}
            onToggleShowPassword={onToggleShowPassword}
          />
        </div>
      )}

      {/* ─── Action Button ─── */}
      <div className={styles.actionsBar} style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className={styles.btnPrimary}
        >
          <span>Continue to Subjects</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
