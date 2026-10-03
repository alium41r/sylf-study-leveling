"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import {
  applyGlobalBackground,
  applyAppMode,
  applyGlobalTheme,
} from "../components/GlobalSystemWrapper";
import { OnboardingProgress, StepKey } from "./components/OnboardingProgress";
import { WelcomeStep } from "./components/WelcomeStep";
import { SubjectsStep, ConfiguredSubject } from "./components/SubjectsStep";
import { AppearanceStep } from "./components/AppearanceStep";
import { CompletionStep } from "./components/CompletionStep";
import styles from "./Onboarding.module.css";

export default function OnboardingFlow() {
  const router = useRouter();
  const { user, login, refreshStats } = useAuth();

  const [currentStep, setCurrentStep] = useState<StepKey>("WELCOME");

  // Google OAuth identity fields (if applicable)
  const [scholarUsername, setScholarUsername] = useState("");
  const [scholarName, setScholarName] = useState("");
  const [scholarPassword, setScholarPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Live username availability state
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const usernameDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Curriculum State
  const [configuredSubjects, setConfiguredSubjects] = useState<ConfiguredSubject[]>([]);

  // Appearance State (defaults matching modern Sylf defaults)
  const [selectedMode, setSelectedMode] = useState<"dark" | "light">("dark");
  const [selectedAccent, setSelectedAccent] = useState<string>("#7c3aed");
  const [selectedBackground, setSelectedBackground] = useState<string>("simple");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // If user has already completed onboarding, redirect to dashboard
  useEffect(() => {
    if (user) {
      if (user.hasCompletedOnboarding) {
        router.push("/dashboard");
        return;
      }
      if (!initializedRef.current) {
        setScholarUsername(user.username || "");
        setScholarName(user.name || "");
        initializedRef.current = true;
      }
    }
  }, [user, router]);

  // Load existing mode preference on mount
  useEffect(() => {
    const savedMode = (localStorage.getItem("app_mode") as "dark" | "light") || "dark";
    setSelectedMode(savedMode);
    applyAppMode(savedMode);
  }, []);

  // Determine if user authenticated through Google (no password set)
  const isGoogleSignup = user ? user.hasPassword === false : false;

  // Debounced live username availability check
  useEffect(() => {
    if (!isGoogleSignup) return;

    if (usernameDebounceRef.current) {
      clearTimeout(usernameDebounceRef.current);
    }

    if (!scholarUsername) {
      setUsernameStatus("idle");
      setUsernameMsg("");
      return;
    }

    if (scholarUsername.length < 3) {
      setUsernameStatus("invalid");
      setUsernameMsg("Handle must be at least 3 characters.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(scholarUsername)) {
      setUsernameStatus("invalid");
      setUsernameMsg("Use lowercase letters, numbers, and underscores only.");
      return;
    }

    setUsernameStatus("checking");
    setUsernameMsg("Checking availability...");

    usernameDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(scholarUsername)}`);
        const data = await res.json();
        if (data.available) {
          setUsernameStatus("available");
          setUsernameMsg("✓ Handle is available");
        } else {
          setUsernameStatus("taken");
          setUsernameMsg(data.error || "This handle is already taken.");
        }
      } catch {
        setUsernameStatus("idle");
        setUsernameMsg("");
      }
    }, 350);

    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, [scholarUsername, isGoogleSignup]);

  // Handle Mode Change with live DOM updates
  const handleModeChange = useCallback((newMode: "dark" | "light") => {
    setSelectedMode(newMode);
    localStorage.setItem("app_mode", newMode);
    applyAppMode(newMode);
    applyGlobalBackground(selectedBackground, newMode);
  }, [selectedBackground]);

  // Handle Accent Change with live DOM updates
  const handleAccentChange = useCallback((newAccent: string) => {
    setSelectedAccent(newAccent);
    localStorage.setItem("app_theme", newAccent);
    applyGlobalTheme(newAccent);
  }, []);

  // Handle Background Change with live DOM updates
  const handleBackgroundChange = useCallback((newBg: string) => {
    setSelectedBackground(newBg);
    localStorage.setItem("app_background", newBg);
    applyGlobalBackground(newBg, selectedMode);
  }, [selectedMode]);

  // Final submission to API
  const handleFinalSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);
    setCurrentStep("COMPLETION");

    let detectedTimezone = user?.timezone || "UTC";
    try {
      if (detectedTimezone === "UTC") {
        detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      }
    } catch {
      detectedTimezone = "UTC";
    }

    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: "class_scholar",
          avatarId: "class_scholar",
          backgroundId: selectedBackground || "simple",
          themeId: selectedAccent || "#7c3aed",
          username: isGoogleSignup ? (scholarUsername || user?.username) : undefined,
          name: isGoogleSignup ? (scholarName || user?.name) : undefined,
          password: isGoogleSignup ? (scholarPassword || undefined) : undefined,
          timezone: detectedTimezone,
          subjects: configuredSubjects.map(({ name, code, examBoard, level, color, syllabusNote }) => ({
            name,
            code: code || undefined,
            examBoard,
            level,
            color,
            syllabusNote: syllabusNote || undefined,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize workspace.");
      }

      // Synchronize client storage and runtime theme
      localStorage.setItem("app_mode", selectedMode);
      localStorage.setItem("app_theme", selectedAccent);
      localStorage.setItem("app_background", selectedBackground);

      applyAppMode(selectedMode);
      applyGlobalTheme(selectedAccent);
      applyGlobalBackground(selectedBackground, selectedMode);

      if (data.user) {
        login(data.user);
      }
      await refreshStats();

      // Brief transition delay so the user experiences the celebrating companion
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 800);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.onboardingContainer}>
      {/* ─── Ambient Starlight Canvas Glow ─── */}
      <div className={styles.topGlow} aria-hidden="true" />

      <main className={styles.shell}>
        {/* Subtle Stepper Header */}
        {currentStep !== "COMPLETION" && (
          <OnboardingProgress currentStep={currentStep} />
        )}

        {/* Step 1: Welcome & Loop Intro */}
        {currentStep === "WELCOME" && (
          <WelcomeStep
            isGoogleSignup={isGoogleSignup}
            email={user?.email || ""}
            name={scholarName}
            username={scholarUsername}
            password={scholarPassword}
            showPassword={showPassword}
            usernameStatus={usernameStatus}
            usernameMsg={usernameMsg}
            onNameChange={setScholarName}
            onUsernameChange={setScholarUsername}
            onPasswordChange={setScholarPassword}
            onToggleShowPassword={() => setShowPassword(!showPassword)}
            onNext={() => setCurrentStep("SUBJECTS")}
          />
        )}

        {/* Step 2: Curriculum & Subjects */}
        {currentStep === "SUBJECTS" && (
          <SubjectsStep
            subjects={configuredSubjects}
            onUpdateSubjects={setConfiguredSubjects}
            onNext={() => setCurrentStep("APPEARANCE")}
            onPrev={() => setCurrentStep("WELCOME")}
          />
        )}

        {/* Step 3: Appearance & Personalization */}
        {currentStep === "APPEARANCE" && (
          <AppearanceStep
            selectedMode={selectedMode}
            selectedAccent={selectedAccent}
            selectedBackground={selectedBackground}
            onSelectMode={handleModeChange}
            onSelectAccent={handleAccentChange}
            onSelectBackground={handleBackgroundChange}
            onNext={handleFinalSubmit}
            onPrev={() => setCurrentStep("SUBJECTS")}
          />
        )}

        {/* Step 4: Real Initialization & Transition */}
        {currentStep === "COMPLETION" && (
          <CompletionStep
            isSubmitting={isSubmitting}
            error={error}
            onRetry={handleFinalSubmit}
            onBackToSettings={() => setCurrentStep("APPEARANCE")}
          />
        )}
      </main>
    </div>
  );
}
