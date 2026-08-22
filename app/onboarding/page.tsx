"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../components/AuthProvider";
import { COSMETICS_CATALOG, CosmeticItem } from "@/lib/cosmetics-catalog";
import { THEME_MAP, BG_MAP } from "../components/GlobalSystemWrapper";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { Moon, Sun, Sparkles, Check, BookOpen, Plus, X } from "lucide-react";

// --- Extensible Onboarding Types ---
type OnboardingStep = "BOOT" | "IDENTITY" | "SUBJECTS" | "BACKGROUND" | "THEME" | "INITIALIZING";

export interface ConfiguredSubject {
  id: string;
  name: string;
  code: string;
  examBoard: string;
  level: string;
  color: string;
}

const PRESET_SUBJECTS: Omit<ConfiguredSubject, "id">[] = [
  { name: "Mathematics", code: "9709", examBoard: "CAIE", level: "A-Level", color: "#8B5CF6" },
  { name: "Physics", code: "9702", examBoard: "CAIE", level: "A-Level", color: "#06B6D4" },
  { name: "Computer Science", code: "9618", examBoard: "CAIE", level: "A-Level", color: "#EC4899" },
  { name: "Chemistry", code: "9701", examBoard: "CAIE", level: "A-Level", color: "#10B981" },
  { name: "Further Mathematics", code: "9231", examBoard: "CAIE", level: "A-Level", color: "#F59E0B" },
];

export default function OnboardingFlow() {
  const router = useRouter();
  const { user, token, mutateUser, login, refreshStats } = useAuth();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("BOOT");
  
  // Custom Identity Details
  const [scholarUsername, setScholarUsername] = useState("");
  const [scholarName, setScholarName] = useState("");
  const [scholarPassword, setScholarPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Live Username Availability Check (Identity Step)
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const usernameDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Academic Curriculum & Subject Intake
  const [configuredSubjects, setConfiguredSubjects] = useState<ConfiguredSubject[]>([
    { id: "preset-9709", name: "Mathematics", code: "9709", examBoard: "CAIE", level: "A-Level", color: "#8B5CF6" },
  ]);

  // Cosmetic & Mode Selections
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<"dark" | "light">("dark");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const initializedRef = useRef(false);

  // Initialize identity defaults once from loaded user
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

  // Read initial saved mode from localStorage if any
  useEffect(() => {
    const savedMode = (localStorage.getItem("app_mode") as "dark" | "light") || "dark";
    setSelectedMode(savedMode);
    document.documentElement.setAttribute("data-mode", savedMode);
  }, []);

  // Debounced check username availability for Identity Step
  useEffect(() => {
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
      setUsernameMsg("Username must be at least 3 characters.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(scholarUsername)) {
      setUsernameStatus("invalid");
      setUsernameMsg("Only lowercase letters, numbers, and underscores allowed.");
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
          setUsernameMsg("✓ Username is available");
        } else {
          setUsernameStatus("taken");
          setUsernameMsg(data.error || "This username is already taken.");
        }
      } catch {
        setUsernameStatus("idle");
        setUsernameMsg("");
      }
    }, 350);

    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, [scholarUsername]);

  // Mode selection toggle
  const handleModeChange = (newMode: "dark" | "light") => {
    setSelectedMode(newMode);
    localStorage.setItem("app_mode", newMode);
    document.documentElement.setAttribute("data-mode", newMode);

    if (selectedBackground && BG_MAP[selectedBackground]) {
      document.body.style.background = newMode === "light" ? BG_MAP[selectedBackground].lightValue : BG_MAP[selectedBackground].value;
      document.body.style.backgroundSize = BG_MAP[selectedBackground].size || "cover";
      document.body.style.backgroundAttachment = "fixed";
    } else {
      document.body.style.background = newMode === "light" ? BG_MAP["void"].lightValue : BG_MAP["void"].value;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundAttachment = "fixed";
    }
  };

  // Determine if user registered via Google (no credentials password set)
  const isGoogleSignup = user ? user.hasPassword === false : false;

  // Step progression: Manual signups skip IDENTITY step
  const steps: OnboardingStep[] = isGoogleSignup
    ? ["BOOT", "IDENTITY", "SUBJECTS", "BACKGROUND", "THEME", "INITIALIZING"]
    : ["BOOT", "SUBJECTS", "BACKGROUND", "THEME", "INITIALIZING"];

  const stepIndex = steps.indexOf(currentStep);

  const nextStep = () => {
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1]);
    }
  };

  const prevStep = () => {
    if (stepIndex > 1 && !isSubmitting) {
      setCurrentStep(steps[stepIndex - 1]);
    }
  };

  // Boot sequence auto-advance
  useEffect(() => {
    if (currentStep === "BOOT") {
      const timer = setTimeout(() => {
        if (isGoogleSignup) {
          setCurrentStep("IDENTITY");
        } else {
          setCurrentStep("SUBJECTS");
        }
      }, 3500); // 3.5s cinematic boot
      return () => clearTimeout(timer);
    }
  }, [currentStep, isGoogleSignup]);

  // Live preview logic for theme/bg
  useEffect(() => {
    if (selectedTheme && THEME_MAP[selectedTheme]) {
      const vars = THEME_MAP[selectedTheme];
      for (const [prop, val] of Object.entries(vars)) {
        document.documentElement.style.setProperty(prop, val);
      }
    }
    
    if (selectedBackground && BG_MAP[selectedBackground]) {
      document.body.style.background = selectedMode === "light" ? BG_MAP[selectedBackground].lightValue : BG_MAP[selectedBackground].value;
      document.body.style.backgroundSize = BG_MAP[selectedBackground].size || "cover";
      document.body.style.backgroundAttachment = "fixed";
    }
  }, [selectedTheme, selectedBackground, selectedMode]);

  const submitOnboarding = async () => {
    if (!token && !user) return;
    setIsSubmitting(true);
    setError("");
    
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
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          classId: "class_scholar",
          avatarId: "class_scholar",
          backgroundId: selectedBackground || "void",
          themeId: selectedTheme || "cyberpunk",
          username: isGoogleSignup ? (scholarUsername || user?.username) : undefined,
          name: isGoogleSignup ? (scholarName || user?.name) : undefined,
          password: isGoogleSignup ? (scholarPassword || undefined) : undefined,
          timezone: detectedTimezone,
          subjects: configuredSubjects.map(({ name, code, examBoard, level, color }) => ({
            name,
            code,
            examBoard,
            level,
            color,
          })),
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize system");
      }

      // Pre-save preferences to localStorage for GlobalSystemWrapper
      if (selectedTheme) localStorage.setItem("app_theme", selectedTheme);
      if (selectedBackground) localStorage.setItem("app_background", selectedBackground);
      localStorage.setItem("app_mode", selectedMode);

      // Mutate user and session token so Edge route guard allows /dashboard
      if (data.token && data.user) {
        login(data.token, data.user);
      } else if (data.user) {
        mutateUser(data.user);
      }
      
      await refreshStats();

      // Delay redirect slightly for cinematic effect
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
      // Fallback to previous step on error
      setTimeout(() => {
        setCurrentStep("THEME");
        setIsSubmitting(false);
      }, 2000);
    }
  };

  // Submission trigger on reaching INITIALIZING step
  useEffect(() => {
    if (currentStep === "INITIALIZING" && !isSubmitting) {
      submitOnboarding();
    }
  }, [currentStep, isSubmitting]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: "var(--bg-void)", zIndex: 50 }}>
      {/* Ambient Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary rounded-full mix-blend-screen filter blur-[128px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-primary-mid rounded-full mix-blend-screen filter blur-[128px] animate-pulse" style={{ animationDelay: "2s" }}></div>
      </div>

      <AnimatePresence mode="wait">
        {currentStep === "BOOT" && (
          <BootSequence key="boot" />
        )}

        {currentStep === "IDENTITY" && isGoogleSignup && (
          <IdentityStep
            key="identity"
            email={user?.email || ""}
            username={scholarUsername}
            name={scholarName}
            password={scholarPassword}
            showPassword={showPassword}
            usernameStatus={usernameStatus}
            usernameMsg={usernameMsg}
            onUsernameChange={(val) => setScholarUsername(val.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
            onNameChange={setScholarName}
            onPasswordChange={setScholarPassword}
            onToggleShowPassword={() => setShowPassword(!showPassword)}
            onNext={nextStep}
            canProceed={
              scholarUsername.length >= 3 &&
              usernameStatus === "available" &&
              scholarName.trim().length > 0
            }
          />
        )}
        
        {currentStep === "SUBJECTS" && (
          <SubjectIntakeStep 
            key="subjects"
            title="CONFIGURE CURRICULUM"
            subtitle="Select your academic subjects & syllabus codes to generate your Constellation Trees."
            subjects={configuredSubjects}
            onUpdateSubjects={setConfiguredSubjects}
            onNext={nextStep}
            onPrev={isGoogleSignup ? prevStep : undefined}
            canProceed={configuredSubjects.length > 0}
          />
        )}

        {currentStep === "BACKGROUND" && (
          <SelectionStep 
            key="background"
            title="SELECT DOMAIN"
            subtitle="Choose the environment for your awakening."
            items={COSMETICS_CATALOG.BACKGROUND}
            selectedId={selectedBackground}
            selectedMode={selectedMode}
            onSelect={setSelectedBackground}
            onNext={nextStep}
            onPrev={prevStep}
            canProceed={!!selectedBackground}
          />
        )}

        {currentStep === "THEME" && (
          <ThemeAndModeStep 
            key="theme"
            title="CALIBRATE RESONANCE"
            subtitle="Choose your core system aura and interface appearance."
            items={COSMETICS_CATALOG.THEME}
            selectedThemeId={selectedTheme}
            selectedMode={selectedMode}
            onSelectTheme={setSelectedTheme}
            onSelectMode={handleModeChange}
            onNext={nextStep}
            onPrev={prevStep}
            canProceed={!!selectedTheme}
            nextLabel="COMPLETE SETUP"
          />
        )}

        {currentStep === "INITIALIZING" && (
          <InitializingSequence key="initializing" error={error} />
        )}
      </AnimatePresence>
    </div>
  );
}


/* --- Sub Components --- */

function BootSequence() {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("INITIALIZING SYSTEM");

  useEffect(() => {
    const start = Date.now();
    const duration = 2800;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(Math.floor((elapsed / duration) * 100), 100);
      setProgress(pct);

      if (pct > 65) {
        setStatusText("PREPARING WORKSPACE");
      } else if (pct > 30) {
        setStatusText("CALIBRATING INTERFACE");
      } else {
        setStatusText("INITIALIZING SYSTEM");
      }

      if (pct >= 100) {
        clearInterval(interval);
      }
    }, 35);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(8px)" }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="flex flex-col items-center justify-center text-center z-10 select-none"
    >
      {/* Custom Vector Emblem & Orbital HUD Rings */}
      <div className="relative w-36 h-36 mb-8 flex items-center justify-center">
        {/* Ambient Pulsing Glow */}
        <div className="absolute inset-0 bg-[var(--accent-primary)] opacity-25 blur-3xl rounded-full animate-pulse" />

        {/* Outer Orbiting Dashed Radar Ring */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border border-dashed border-[var(--accent-primary-mid)] opacity-60"
        />

        {/* Middle Dual-Arc Rotor */}
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-full border-2 border-t-[var(--accent-primary-light)] border-r-transparent border-b-[var(--accent-primary)] border-l-transparent opacity-80"
        />

        {/* Inner Hexagonal Core */}
        <motion.div 
          animate={{ scale: [1, 1.04, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-20 h-20 flex items-center justify-center"
        >
          {/* Custom SVG Monogram Logo */}
          <svg viewBox="0 0 64 64" fill="none" className="w-14 h-14 filter drop-shadow-[0_0_12px_var(--accent-primary)]">
            <polygon 
              points="32,4 58,18 58,46 32,60 6,46 6,18" 
              stroke="var(--accent-primary-light)" 
              strokeWidth="2.5" 
              fill="rgba(0,0,0,0.5)" 
            />
            <path 
              d="M42 20 L24 20 L20 30 L44 34 L40 44 L22 44" 
              stroke="var(--accent-primary-light)" 
              strokeWidth="3.2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            <circle cx="32" cy="32" r="2.5" fill="var(--accent-primary-light)" />
          </svg>
        </motion.div>
      </div>

      {/* Primary Status Text */}
      <motion.h1 
        key={statusText}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl sm:text-3xl font-bold tracking-[0.4em] uppercase font-rajdhani drop-shadow-[0_0_12px_var(--accent-primary-dim)]"
        style={{ color: "var(--text-primary)" }}
      >
        {statusText}
      </motion.h1>

      {/* Sleek Minimal Progress Meter */}
      <div className="w-64 sm:w-72 mt-6 flex flex-col items-center gap-2">
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden relative">
          <motion.div 
            className="h-full bg-gradient-to-r from-[var(--accent-primary-dim)] via-[var(--accent-primary)] to-[var(--accent-primary-light)] rounded-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="w-full flex justify-between items-center text-[10px] font-mono tracking-widest text-text-muted">
          <span>SYSTEM_INIT</span>
          <span className="text-[var(--accent-primary-light)] font-bold">{progress.toString().padStart(2, "0")}%</span>
        </div>
      </div>
    </motion.div>
  );
}

interface IdentityStepProps {
  email: string;
  username: string;
  name: string;
  password: string;
  showPassword: boolean;
  usernameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  usernameMsg: string;
  onUsernameChange: (val: string) => void;
  onNameChange: (val: string) => void;
  onPasswordChange: (val: string) => void;
  onToggleShowPassword: () => void;
  onNext: () => void;
  canProceed: boolean;
}

function IdentityStep({
  email,
  username,
  name,
  password,
  showPassword,
  usernameStatus,
  usernameMsg,
  onUsernameChange,
  onNameChange,
  onPasswordChange,
  onToggleShowPassword,
  onNext,
  canProceed,
}: IdentityStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-lg p-8 z-10 flex flex-col system-card border rounded-2xl shadow-card"
      style={{
        background: "var(--bg-abyss)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="text-center mb-6">
        <p
          className="text-xs tracking-[0.2em] uppercase font-bold mb-1"
          style={{ color: "var(--accent-text-light)", fontFamily: "'Rajdhani', sans-serif" }}
        >
          CONFIRM SCHOLAR IDENTITY
        </p>
        <h2
          className="text-2xl font-bold uppercase tracking-wide"
          style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}
        >
          Player Registration
        </h2>
      </div>

      <div className="space-y-4">
        {email && (
          <div>
            <label className="stat-label block mb-1">Registered Email</label>
            <input
              type="text"
              value={email}
              disabled
              className="input-field opacity-70 cursor-not-allowed"
            />
          </div>
        )}

        <div>
          <label className="stat-label block mb-1">Display Name</label>
          <input
            type="text"
            placeholder="Sung Jin-Woo"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="input-field"
            maxLength={30}
          />
        </div>

        <div>
          <label className="stat-label block mb-1">Scholar Username</label>
          <div className="relative">
            <input
              type="text"
              placeholder="shadow_monarch"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className={`input-field font-mono text-sm pr-8 ${
                usernameStatus === "taken" || usernameStatus === "invalid"
                  ? "border-red-500/70 focus:border-red-500"
                  : usernameStatus === "available"
                  ? "border-green-500/70 focus:border-green-500"
                  : ""
              }`}
            />
            {usernameStatus === "checking" && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/20 border-t-accent-primary rounded-full animate-spin" />
            )}
          </div>

          {/* Real-time username feedback */}
          {usernameMsg ? (
            <p
              className={`text-xs mt-1 font-['Rajdhani'] font-semibold ${
                usernameStatus === "taken" || usernameStatus === "invalid"
                  ? "text-red-400"
                  : usernameStatus === "available"
                  ? "text-green-400"
                  : "text-text-muted"
              }`}
            >
              {usernameMsg}
            </p>
          ) : (
            <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
              3-20 characters: lowercase letters, numbers, and underscores only.
            </p>
          )}
        </div>

        <div>
          <label className="stat-label block mb-1">
            Security Password <span className="text-[0.65rem] lowercase opacity-60">(optional)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Set password for credentials login"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="input-field pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
              style={{ color: "var(--text-muted)" }}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {password && <PasswordStrengthMeter password={password} />}
          <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
            Allows signing in with email & password in addition to Google.
          </p>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t flex justify-end" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="btn-primary"
          style={{ opacity: canProceed ? 1 : 0.5, cursor: canProceed ? "pointer" : "not-allowed" }}
        >
          CONFIRM IDENTITY & PROCEED
        </button>
      </div>
    </motion.div>
  );
}

interface SubjectIntakeStepProps {
  title: string;
  subtitle: string;
  subjects: ConfiguredSubject[];
  onUpdateSubjects: (subjects: ConfiguredSubject[]) => void;
  onNext: () => void;
  onPrev?: () => void;
  canProceed: boolean;
}

const ACCENT_COLORS = [
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#6366F1", // Indigo
];

function SubjectIntakeStep({
  title,
  subtitle,
  subjects,
  onUpdateSubjects,
  onNext,
  onPrev,
  canProceed,
}: SubjectIntakeStepProps) {
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customExamBoard, setCustomExamBoard] = useState("CAIE");
  const [customLevel, setCustomLevel] = useState("A-Level");
  const [customColor, setCustomColor] = useState("#8B5CF6");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [validationError, setValidationError] = useState("");

  const handleTogglePreset = (preset: Omit<ConfiguredSubject, "id">) => {
    const existingIndex = subjects.findIndex((s) => s.code.toUpperCase() === preset.code.toUpperCase());
    if (existingIndex >= 0) {
      onUpdateSubjects(subjects.filter((_, idx) => idx !== existingIndex));
    } else {
      onUpdateSubjects([
        ...subjects,
        {
          id: `preset-${preset.code}-${Date.now()}`,
          ...preset,
        },
      ]);
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!customName.trim()) {
      setValidationError("Subject name is required.");
      return;
    }
    if (!customCode.trim()) {
      setValidationError("Syllabus code is required.");
      return;
    }

    const cleanCode = customCode.trim().toUpperCase();
    if (subjects.some((s) => s.code.toUpperCase() === cleanCode)) {
      setValidationError(`Subject code "${cleanCode}" is already in your curriculum.`);
      return;
    }

    onUpdateSubjects([
      ...subjects,
      {
        id: `custom-${Date.now()}`,
        name: customName.trim(),
        code: cleanCode,
        examBoard: customExamBoard.trim() || "CAIE",
        level: customLevel.trim() || "A-Level",
        color: customColor,
      },
    ]);

    setCustomName("");
    setCustomCode("");
    setValidationError("");
    setShowCustomForm(false);
  };

  const handleRemoveSubject = (id: string) => {
    onUpdateSubjects(subjects.filter((s) => s.id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-6xl p-6 sm:p-8 z-10 flex flex-col h-[88vh]"
    >
      <div className="text-center mb-6">
        <h2 className="text-4xl font-bold tracking-widest uppercase font-rajdhani drop-shadow-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <p className="mt-2 text-sm uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 pb-8 flex flex-col gap-6">
        {/* ─── AI Calibration Guidance Banner ─── */}
        <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 text-xs text-purple-200 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 font-semibold text-purple-300 tracking-wider font-rajdhani text-sm">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span>AI CONSTELLATION ENGINE CALIBRATION</span>
          </div>
          <p className="mt-1 leading-relaxed text-zinc-400">
            Enter your official subject codes and exam boards carefully (e.g. CAIE 9709, Edexcel 9MA0, AP Calculus BC). 
            The AI decomposes your exact syllabus to forge your 48-node academic constellation graph.
          </p>
        </div>

        {/* Presets Section */}
        <div className="bg-bg-abyss/90 border border-border-subtle p-5 rounded-2xl flex flex-col gap-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-rajdhani uppercase tracking-widest text-accent-text-light flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>QUICK-ADD STANDARD SYLLABI</span>
            </span>
            <span className="text-[11px] text-text-secondary font-rajdhani font-medium">
              Click to toggle syllabus into curriculum
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRESET_SUBJECTS.map((preset) => {
              const isSelected = subjects.some((s) => s.code.toUpperCase() === preset.code.toUpperCase());
              return (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => handleTogglePreset(preset)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between group ${
                    isSelected
                      ? "bg-accent-primary-dim/30 border-accent-primary shadow-[0_0_15px_rgba(124,58,237,0.25)] scale-[1.01]"
                      : "bg-bg-panel/60 border-border-subtle hover:border-border-active hover:bg-bg-panel"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3.5 h-10 rounded-full flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: preset.color }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm font-rajdhani" style={{ color: "var(--text-primary)" }}>
                          {preset.name}
                        </h4>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
                          style={{
                            backgroundColor: `${preset.color}25`,
                            color: preset.color,
                            border: `1px solid ${preset.color}50`,
                          }}
                        >
                          {preset.code}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary font-rajdhani">
                        {preset.examBoard} • {preset.level}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      isSelected ? "border-accent-primary bg-accent-primary text-white" : "border-border-subtle group-hover:border-border-active"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Configured Subjects List */}
        <div className="bg-bg-abyss/90 border border-border-subtle p-5 rounded-2xl flex flex-col gap-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-rajdhani uppercase tracking-widest text-text-secondary flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-accent-primary" />
              <span>ACTIVE CURRICULUM ({subjects.length} SUBJECT{subjects.length === 1 ? "" : "S"})</span>
            </span>
            <button
              type="button"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="text-xs font-rajdhani font-bold uppercase tracking-wider text-accent-text-light hover:text-white flex items-center gap-1 transition-colors px-2.5 py-1 rounded bg-bg-panel border border-border-subtle hover:border-accent-primary"
            >
              <Plus className="w-3 h-3" />
              <span>{showCustomForm ? "Cancel Custom Form" : "Add Custom Subject"}</span>
            </button>
          </div>

          {/* Custom Subject Intake Sub-Form */}
          {showCustomForm && (
            <form onSubmit={handleAddCustom} className="p-4 rounded-xl border border-border-active bg-bg-void/80 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">Subject Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Linear Algebra"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">Syllabus Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. MATH-201"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">Exam Board</label>
                  <select
                    value={customExamBoard}
                    onChange={(e) => setCustomExamBoard(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                  >
                    <option value="CAIE">CAIE</option>
                    <option value="Edexcel">Edexcel</option>
                    <option value="AQA">AQA</option>
                    <option value="AP">AP (College Board)</option>
                    <option value="IB">IB (International)</option>
                    <option value="University">University</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">Academic Level</label>
                  <select
                    value={customLevel}
                    onChange={(e) => setCustomLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                  >
                    <option value="A-Level">A-Level</option>
                    <option value="AS-Level">AS-Level</option>
                    <option value="AP">AP</option>
                    <option value="IB HL">IB Higher Level</option>
                    <option value="IB SL">IB Standard Level</option>
                    <option value="University">Undergraduate</option>
                    <option value="High School">High School</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase text-text-secondary">Accent Color:</span>
                  <div className="flex items-center gap-1.5">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCustomColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          customColor === c ? "scale-125 border-white shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent-primary text-white hover:bg-accent-primary-light shadow-sm"
                >
                  + Add to Curriculum
                </button>
              </div>

              {validationError && (
                <p className="text-xs text-accent-red font-mono">{validationError}</p>
              )}
            </form>
          )}

          {/* Subjects Grid */}
          {subjects.length === 0 ? (
            <div className="p-8 border border-dashed border-border-subtle rounded-xl text-center flex flex-col items-center justify-center gap-2">
              <BookOpen className="w-8 h-8 text-text-muted opacity-40" />
              <p className="text-sm text-text-secondary font-rajdhani">No subjects selected yet.</p>
              <p className="text-xs text-text-muted font-mono">
                Click any quick-add preset above or add a custom syllabus to continue.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {subjects.map((sub) => (
                <div
                  key={sub.id}
                  className="p-3.5 rounded-xl border border-border-subtle bg-bg-panel/80 flex items-center justify-between relative overflow-hidden group hover:border-border-active transition-all"
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: sub.color }}
                  />
                  <div className="pl-2">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-sm font-rajdhani truncate max-w-[160px]" style={{ color: "var(--text-primary)" }}>
                        {sub.name}
                      </h4>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
                        style={{
                          backgroundColor: `${sub.color}20`,
                          color: sub.color,
                          border: `1px solid ${sub.color}40`,
                        }}
                      >
                        {sub.code}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary font-rajdhani mt-0.5">
                      {sub.examBoard} • {sub.level}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSubject(sub.id)}
                    className="w-7 h-7 rounded-lg border border-border-subtle hover:border-accent-red/50 hover:bg-accent-red/10 text-text-muted hover:text-accent-red flex items-center justify-center transition-colors"
                    title="Remove subject"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between mt-6 pt-6 border-t border-border-subtle">
        {onPrev ? (
          <button
            onClick={onPrev}
            className="px-6 py-3 rounded text-text-secondary hover:text-text-primary transition-colors tracking-widest text-sm uppercase font-bold"
          >
            Go Back
          </button>
        ) : (
          <div />
        )}

        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`px-8 py-3 rounded font-bold tracking-widest uppercase transition-all duration-300 relative overflow-hidden
            ${
              canProceed
                ? "bg-[var(--accent-primary)] text-white shadow-[0_0_15px_var(--accent-primary-mid)] hover:scale-105"
                : "bg-bg-shadow text-text-muted cursor-not-allowed"
            }
          `}
        >
          CONFIRM CURRICULUM
        </button>
      </div>
    </motion.div>
  );
}

interface SelectionStepProps {
  title: string;
  subtitle: string;
  items: CosmeticItem[];
  selectedId: string | null;
  selectedMode?: "dark" | "light";
  onSelect: (id: string) => void;
  onNext: () => void;
  onPrev?: () => void;
  canProceed: boolean;
  nextLabel?: string;
}

const BG_PREVIEWS: Record<string, { darkBg: string; lightBg: string; size?: string }> = {
  void: {
    darkBg: "linear-gradient(135deg, #090918 0%, #04040a 100%)",
    lightBg: "linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)",
  },
  "cyber-grid": {
    darkBg: "linear-gradient(transparent 90%, rgba(6, 182, 212, 0.4) 100%), linear-gradient(90deg, transparent 90%, rgba(6, 182, 212, 0.4) 100%), linear-gradient(135deg, #04141c 0%, #020a0e 100%)",
    lightBg: "linear-gradient(transparent 90%, rgba(6, 182, 212, 0.35) 100%), linear-gradient(90deg, transparent 90%, rgba(6, 182, 212, 0.35) 100%), linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)",
    size: "18px 18px, 18px 18px, auto",
  },
  "sakura-fall": {
    darkBg: "linear-gradient(135deg, #2b0b20 0%, #150510 50%, #0c0409 100%)",
    lightBg: "linear-gradient(135deg, #fff0f5 0%, #fce7f3 50%, #fbcfe8 100%)",
  },
  "abyssal-glow": {
    darkBg: "linear-gradient(135deg, #1b0d3a 0%, #0d0620 50%, #060310 100%)",
    lightBg: "linear-gradient(135deg, #f5f0ff 0%, #ede9fe 50%, #ddd6fe 100%)",
  },
  "neon-sunrise": {
    darkBg: "linear-gradient(to top, rgba(239, 68, 68, 0.4) 0%, rgba(245, 158, 11, 0.25) 50%, #100404 100%)",
    lightBg: "linear-gradient(to top, rgba(239, 68, 68, 0.25) 0%, rgba(245, 158, 11, 0.2) 50%, #fffdf5 100%)",
  },
  "matrix-rain": {
    darkBg: "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.35) 0px, transparent 1px, transparent 12px), linear-gradient(135deg, #041a10 0%, #010c07 100%)",
    lightBg: "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.3) 0px, transparent 1px, transparent 12px), linear-gradient(135deg, #f0fdf4 0%, #d1fae5 100%)",
  },
  "aurora-borealis": {
    darkBg: "linear-gradient(135deg, #09203f 0%, #0d1b2a 50%, #1b0c2a 100%)",
    lightBg: "linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 50%, #fae8ff 100%)",
  },
  "deep-ocean": {
    darkBg: "linear-gradient(135deg, #071e42 0%, #04122b 50%, #020718 100%)",
    lightBg: "linear-gradient(135deg, #e0f2fe 0%, #dbeafe 50%, #bfdbfe 100%)",
  },
};

function SelectionStep({ 
  title, subtitle, items, selectedId, selectedMode, onSelect, onNext, onPrev, canProceed, nextLabel = "CONFIRM" 
}: SelectionStepProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-6xl p-6 sm:p-8 z-10 flex flex-col h-[88vh]"
    >
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold tracking-widest uppercase font-rajdhani drop-shadow-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <p className="mt-2 text-sm uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 pb-8">
        <div className={`grid gap-6 p-2 ${items[0]?.category === "CLASS" || items[0]?.category === "AVATAR" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"}`}>
          {items.map((item: CosmeticItem, idx: number) => {
            const isSelected = selectedId === item.id;
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => onSelect(item.id)}
                className={`relative p-6 text-left border rounded-xl overflow-hidden transition-all duration-300 group
                  ${isSelected 
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] shadow-[0_0_20px_var(--accent-primary-mid)] scale-[1.03] z-10" 
                    : "border-border-subtle bg-bg-abyss hover:border-border-active hover:bg-bg-panel z-0 hover:z-10 hover:scale-[1.01]"}
                `}
              >
                {/* Visual Preview logic based on category */}
                {(item.category === "CLASS" || item.category === "AVATAR") && (
                  <div className="w-full h-44 sm:h-48 mb-4 rounded-lg overflow-hidden relative border border-border-subtle bg-black/60 shadow-inner group-hover:border-[var(--accent-primary-light)] transition-colors duration-300">
                    <img 
                      src={item.value} 
                      alt={item.name} 
                      className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                        const fallback = (e.target as HTMLElement).nextElementSibling;
                        if (fallback) (fallback as HTMLElement).style.display = "flex";
                      }}
                    />
                    {/* Dark gradient overlay for manhwa card atmosphere */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-abyss)] via-black/20 to-transparent pointer-events-none opacity-80" />
                    
                    <div className="absolute inset-0 hidden items-center justify-center text-5xl">
                      {item.fallbackIcon || "👤"}
                    </div>
                  </div>
                )}
                {item.category === "BACKGROUND" && (() => {
                  const preview = BG_PREVIEWS[item.value] || {
                    darkBg: "#0a0a14",
                    lightBg: "#f8fafc",
                  };
                  const bgGradient = selectedMode === "light" ? preview.lightBg : preview.darkBg;
                  return (
                    <div
                      className="w-full h-24 mb-4 rounded-xl border border-border-subtle relative overflow-hidden shadow-inner flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-300"
                      style={{
                        background: bgGradient,
                        backgroundSize: preview.size || "cover",
                      }}
                    >
                      {/* Category chip */}
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-bg-abyss/80 text-text-secondary border border-border-subtle backdrop-blur-sm">
                        {item.bgCategory || "domain"}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex justify-between items-start mb-2 relative z-10">
                  <h3 className="font-bold text-lg font-rajdhani tracking-wide" style={{ color: isSelected ? "var(--accent-text-light)" : "var(--text-primary)" }}>
                    {item.name}
                  </h3>
                  {isSelected && (
                    <motion.div layoutId="selectedBadge" className="text-[var(--accent-primary)]">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </motion.div>
                  )}
                </div>
                <p className="text-sm relative z-10" style={{ color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {item.description}
                </p>
                
                {/* Hover Glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" 
                     style={{ background: "radial-gradient(circle at center, var(--accent-primary-dim) 0%, transparent 70%)" }}>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between mt-6 pt-6 border-t border-border-subtle">
        {onPrev ? (
          <button 
            onClick={onPrev}
            className="px-6 py-3 rounded text-text-secondary hover:text-text-primary transition-colors tracking-widest text-sm uppercase font-bold"
          >
            Go Back
          </button>
        ) : <div></div>}

        <button 
          onClick={onNext}
          disabled={!canProceed}
          className={`px-8 py-3 rounded font-bold tracking-widest uppercase transition-all duration-300 relative overflow-hidden
            ${canProceed 
              ? "bg-[var(--accent-primary)] text-white shadow-[0_0_15px_var(--accent-primary-mid)] hover:scale-105" 
              : "bg-bg-shadow text-text-muted cursor-not-allowed"}
          `}
        >
          {nextLabel}
        </button>
      </div>
    </motion.div>
  );
}

interface ThemeAndModeStepProps {
  title: string;
  subtitle: string;
  items: CosmeticItem[];
  selectedThemeId: string | null;
  selectedMode: "dark" | "light";
  onSelectTheme: (id: string) => void;
  onSelectMode: (mode: "dark" | "light") => void;
  onNext: () => void;
  onPrev?: () => void;
  canProceed: boolean;
  nextLabel?: string;
}

function ThemeAndModeStep({
  title,
  subtitle,
  items,
  selectedThemeId,
  selectedMode,
  onSelectTheme,
  onSelectMode,
  onNext,
  onPrev,
  canProceed,
  nextLabel = "COMPLETE SETUP",
}: ThemeAndModeStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-6xl p-6 sm:p-8 z-10 flex flex-col h-[88vh]"
    >
      <div className="text-center mb-6">
        <h2
          className="text-4xl font-bold tracking-widest uppercase font-rajdhani drop-shadow-sm"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 pb-8 flex flex-col gap-6">
        {/* ─── Mode Selection (Dark vs Light) ─── */}
        <div className="bg-bg-abyss/90 border border-border-subtle p-5 rounded-2xl flex flex-col gap-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>INTERFACE MODE</span>
            </span>
            <span className="text-[11px] text-text-secondary font-['Rajdhani'] font-medium">
              Select daylight or stealth contrast
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Dark Mode Card */}
            <button
              type="button"
              onClick={() => onSelectMode("dark")}
              className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between group ${
                selectedMode === "dark"
                  ? "bg-accent-primary-dim/30 border-accent-primary shadow-[0_0_15px_rgba(124,58,237,0.3)] scale-[1.02]"
                  : "bg-bg-panel/60 border-border-subtle hover:border-border-active hover:bg-bg-panel"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-black border border-white/10 flex items-center justify-center text-accent-primary shadow-inner">
                  <Moon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm font-['Rajdhani']" style={{ color: "var(--text-primary)" }}>Dark Mode (Default)</h4>
                  <p className="text-xs text-text-secondary font-['Rajdhani']">Stealth black & glowing neon atmosphere</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedMode === "dark" ? "border-accent-primary bg-accent-primary text-white" : "border-border-subtle"
                }`}
              >
                {selectedMode === "dark" && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>

            {/* Light Mode Card */}
            <button
              type="button"
              onClick={() => onSelectMode("light")}
              className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between group ${
                selectedMode === "light"
                  ? "bg-accent-primary-dim/30 border-accent-primary shadow-[0_0_15px_rgba(124,58,237,0.3)] scale-[1.02]"
                  : "bg-bg-panel/60 border-border-subtle hover:border-border-active hover:bg-bg-panel"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-amber-500 shadow-inner">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm font-['Rajdhani']" style={{ color: "var(--text-primary)" }}>Light Mode</h4>
                  <p className="text-xs text-text-secondary font-['Rajdhani']">High-contrast clean daylight interface</p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  selectedMode === "light" ? "border-accent-primary bg-accent-primary text-white" : "border-border-subtle"
                }`}
              >
                {selectedMode === "light" && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          </div>
        </div>

        {/* ─── Themes Grid ─── */}
        <div>
          <div className="mb-3">
            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-secondary font-semibold">
              SYSTEM RESONANCE AURAS
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {items.map((item: CosmeticItem, idx: number) => {
              const isSelected = selectedThemeId === item.id;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => onSelectTheme(item.id)}
                  className={`relative p-6 text-left border rounded-xl overflow-hidden transition-all duration-300 group
                    ${
                      isSelected
                        ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] shadow-[0_0_20px_var(--accent-primary-mid)] scale-[1.03] z-10"
                        : "border-border-subtle bg-bg-abyss hover:border-border-active hover:bg-bg-panel z-0 hover:z-10 hover:scale-[1.01]"
                    }
                  `}
                >
                  <div
                    className="w-full h-24 mb-4 rounded-lg flex items-center justify-center border border-border-subtle shadow-sm"
                    style={{ backgroundColor: THEME_MAP[item.value]?.["--accent-primary-dim"] || "#222" }}
                  >
                    <div
                      className="w-8 h-8 rounded-full shadow-lg"
                      style={{ backgroundColor: THEME_MAP[item.value]?.["--accent-primary"] || "#fff" }}
                    />
                  </div>

                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <h3 className="font-bold text-lg font-rajdhani tracking-wide" style={{ color: isSelected ? "var(--accent-text-light)" : "var(--text-primary)" }}>
                      {item.name}
                    </h3>
                    {isSelected && (
                      <motion.div layoutId="selectedThemeBadge" className="text-[var(--accent-primary)]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </motion.div>
                    )}
                  </div>
                  <p className="text-sm relative z-10" style={{ color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {item.description}
                  </p>

                  {/* Hover Glow */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500"
                    style={{ background: "radial-gradient(circle at center, var(--accent-primary-dim) 0%, transparent 70%)" }}
                  />
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-6 pt-6 border-t border-border-subtle">
        {onPrev ? (
          <button 
            onClick={onPrev}
            className="px-6 py-3 rounded text-text-secondary hover:text-text-primary transition-colors tracking-widest text-sm uppercase font-bold"
          >
            Go Back
          </button>
        ) : <div />}

        <button 
          onClick={onNext}
          disabled={!canProceed}
          className={`px-8 py-3 rounded font-bold tracking-widest uppercase transition-all duration-300 relative overflow-hidden
            ${canProceed 
              ? "bg-[var(--accent-primary)] text-white shadow-[0_0_15px_var(--accent-primary-mid)] hover:scale-105" 
              : "bg-bg-shadow text-text-muted cursor-not-allowed"}
          `}
        >
          {nextLabel}
        </button>
      </div>
    </motion.div>
  );
}

function InitializingSequence({ error }: { error: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center z-10"
    >
      {error ? (
        <>
          <div className="text-red-500 mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h2 className="text-2xl text-accent-red font-bold mb-2">INITIALIZATION FAILED</h2>
          <p className="text-text-muted">{error}</p>
          <p className="text-xs text-text-muted mt-4">Please try again.</p>
        </>
      ) : (
        <>
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="mb-8 relative w-32 h-32"
          >
            <div className="absolute inset-0 border-2 border-t-[var(--accent-primary)] border-r-[var(--accent-primary-light)] border-b-transparent border-l-transparent rounded-full opacity-80"></div>
            <div className="absolute inset-2 border-2 border-b-[var(--accent-primary)] border-l-[var(--accent-primary-light)] border-t-transparent border-r-transparent rounded-full opacity-60 animate-spin-slow" style={{ animationDirection: "reverse", animationDuration: "3s" }}></div>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-[0.3em] text-[var(--accent-primary)] drop-shadow-[0_0_8px_var(--accent-primary-dim)] uppercase" style={{ fontFamily: "var(--font-rajdhani)" }}>
            Synchronizing
          </h2>
          <motion.div className="w-64 h-1 bg-bg-shadow mt-6 rounded overflow-hidden relative">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 1.5, ease: "circOut" }}
              className="absolute inset-y-0 left-0 bg-[var(--accent-primary)] w-full"
            ></motion.div>
          </motion.div>
          <p className="mt-4 text-xs text-text-muted tracking-widest uppercase animate-pulse">Applying system configuration...</p>
        </>
      )}
    </motion.div>
  );
}
