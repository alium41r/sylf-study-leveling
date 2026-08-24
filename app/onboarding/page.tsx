"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../components/AuthProvider";
import { COSMETICS_CATALOG, CosmeticItem } from "@/lib/cosmetics-catalog";
import { THEME_MAP, BG_MAP, applyGlobalBackground } from "../components/GlobalSystemWrapper";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { Moon, Sun, Sparkles, Check, BookOpen, Plus, X } from "lucide-react";

// --- Extensible Onboarding Types ---
type OnboardingStep = "BOOT" | "IDENTITY" | "SUBJECTS" | "THEME" | "INITIALIZING";

export interface ConfiguredSubject {
  id: string;
  name: string;
  code: string;
  examBoard: string;
  level: string;
  color: string;
  /** Free-text book / syllabus details used by the AI syllabus dissection. */
  syllabusNote?: string;
}

// Exam boards across international, Pakistani and Indian systems.
const EXAM_BOARDS: { value: string; label: string }[] = [
  { value: "CAIE", label: "CAIE — Cambridge International" },
  { value: "Edexcel", label: "Edexcel (Pearson)" },
  { value: "Oxford AQA International", label: "Oxford AQA International" },
  { value: "AQA", label: "AQA (UK)" },
  { value: "OCR", label: "OCR (UK)" },
  { value: "WJEC/Eduqas", label: "WJEC / Eduqas (Wales)" },
  { value: "CCEA", label: "CCEA (Northern Ireland)" },
  { value: "AP", label: "AP (College Board)" },
  { value: "IB", label: "IB (International Baccalaureate)" },
  { value: "FBISE", label: "FBISE — Federal Board (Pakistan)" },
  { value: "BISE Punjab", label: "BISE Punjab (Lahore)" },
  { value: "BISE Sindh", label: "BISE Sindh (Karachi)" },
  { value: "BISE KPK", label: "BISE KPK (Peshawar)" },
  { value: "BISE Balochistan", label: "BISE Balochistan (Quetta)" },
  { value: "AKU-EB", label: "AKU-EB (Aga Khan University)" },
  { value: "CBSE", label: "CBSE (India)" },
  { value: "CISCE", label: "CISCE — ICSE / ISC (India)" },
  { value: "NIOS", label: "NIOS (India — Open Schooling)" },
  { value: "State Board", label: "State Board (India)" },
  { value: "University", label: "University" },
  { value: "Other", label: "Other" },
];

// Academic levels spanning international, Pakistani (Matric/Intermediate)
// and Indian (Middle/Secondary/Senior Secondary) systems.
const ACADEMIC_LEVELS: { value: string; label: string }[] = [
  { value: "A-Level", label: "A-Level" },
  { value: "AS-Level", label: "AS-Level" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "GCSE", label: "GCSE" },
  { value: "O-Level", label: "O-Level" },
  { value: "AP", label: "AP (Advanced Placement)" },
  { value: "IB HL", label: "IB Higher Level (HL)" },
  { value: "IB SL", label: "IB Standard Level (SL)" },
  { value: "Middle School", label: "Middle School (Class 6-8)" },
  { value: "Matric / SSC", label: "Matriculation / SSC (Class 9-10)" },
  { value: "Intermediate / HSSC", label: "Intermediate / HSSC (Class 11-12)" },
  { value: "High School", label: "High School" },
  { value: "University", label: "Undergraduate" },
  { value: "Other", label: "Other" },
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

    // Paint on the viewport-fixed background layer (mobile-safe)
    applyGlobalBackground(selectedBackground, newMode);
  };

  // Determine if user registered via Google (no credentials password set)
  const isGoogleSignup = user ? user.hasPassword === false : false;

  // Step progression: Manual signups skip IDENTITY step
  const steps: OnboardingStep[] = isGoogleSignup
    ? ["BOOT", "IDENTITY", "SUBJECTS", "THEME", "INITIALIZING"]
    : ["BOOT", "SUBJECTS", "THEME", "INITIALIZING"];

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
      // Paint on the viewport-fixed background layer (mobile-safe)
      applyGlobalBackground(selectedBackground, selectedMode);
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
          subjects: configuredSubjects.map(({ name, code, examBoard, level, color, syllabusNote }) => ({
            name,
            code,
            examBoard,
            level,
            color,
            syllabusNote: syllabusNote || undefined,
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

        {currentStep === "THEME" && (
          <ThemeAndModeStep 
            key="theme"
            title="CALIBRATE RESONANCE"
            subtitle="Choose your interface mode, domain environment and core system aura."
            themeItems={COSMETICS_CATALOG.THEME}
            backgroundItems={COSMETICS_CATALOG.BACKGROUND}
            selectedThemeId={selectedTheme}
            selectedBackgroundId={selectedBackground}
            selectedMode={selectedMode}
            onSelectTheme={setSelectedTheme}
            onSelectBackground={setSelectedBackground}
            onSelectMode={handleModeChange}
            onNext={nextStep}
            onPrev={prevStep}
            canProceed={!!selectedTheme && !!selectedBackground}
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
  const [customSyllabusNote, setCustomSyllabusNote] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [validationError, setValidationError] = useState("");

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
        syllabusNote: customSyllabusNote.trim() || undefined,
      },
    ]);

    setCustomName("");
    setCustomCode("");
    setCustomSyllabusNote("");
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
            Add each subject yourself — name, official syllabus code, exam board and academic
            level (e.g. CAIE 9709, Edexcel 9MA0, FBISE Mathematics). Include your book or syllabus
            details so the AI can dissect your exact syllabus and forge your 48-node academic
            constellation graph.
          </p>
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
                    {EXAM_BOARDS.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">Academic Level</label>
                  <select
                    value={customLevel}
                    onChange={(e) => setCustomLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                  >
                    {ACADEMIC_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Book / syllabus details — feeds the AI syllabus dissection */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-text-secondary mb-1">
                  Book / Syllabus Details <span className="normal-case text-text-muted">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 'Cambridge International AS & A Level Mathematics (9709) — Pure Mathematics 1 & 2, Hodder Education'"
                  value={customSyllabusNote}
                  onChange={(e) => setCustomSyllabusNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary resize-y min-h-[52px]"
                />
                <p className="mt-1 text-[10px] text-text-muted font-mono leading-relaxed">
                  Include the textbook / exam-spec name and syllabus code if possible — the AI uses
                  these details to dissect your exact syllabus into skill nodes.
                </p>
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
                Add each subject with its code, exam board and syllabus details below.
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
                    {sub.syllabusNote && (
                      <p
                        className="text-[10px] text-text-muted font-mono mt-1 truncate max-w-[200px]"
                        title={sub.syllabusNote}
                      >
                        {sub.syllabusNote}
                      </p>
                    )}
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

interface ThemeAndModeStepProps {
  title: string;
  subtitle: string;
  themeItems: CosmeticItem[];
  backgroundItems: CosmeticItem[];
  selectedThemeId: string | null;
  selectedBackgroundId: string | null;
  selectedMode: "dark" | "light";
  onSelectTheme: (id: string) => void;
  onSelectBackground: (id: string) => void;
  onSelectMode: (mode: "dark" | "light") => void;
  onNext: () => void;
  onPrev?: () => void;
  canProceed: boolean;
  nextLabel?: string;
}

function ThemeAndModeStep({
  title,
  subtitle,
  themeItems,
  backgroundItems,
  selectedThemeId,
  selectedBackgroundId,
  selectedMode,
  onSelectTheme,
  onSelectBackground,
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

        {/* ─── Domain / Background Selection (live preview) ─── */}
        <div className="bg-bg-abyss/90 border border-border-subtle p-5 rounded-2xl flex flex-col gap-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ENVIRONMENT DOMAIN</span>
            </span>
            <span className="text-[11px] text-text-secondary font-['Rajdhani'] font-medium">
              Preview updates live as you choose
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {backgroundItems.map((item) => {
              const isSelected = selectedBackgroundId === item.id;
              // Preview EXACTLY what the app renders: the same BG_MAP
              // gradients used by the System Hub backgrounds page (and the
              // live wallpaper layer) — not hand-rolled approximations.
              const bgData = BG_MAP[item.value] || BG_MAP["void"];
              const bgGradient = selectedMode === "light" ? bgData.lightValue : bgData.value;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectBackground(item.id)}
                  className={`relative p-4 text-left border rounded-xl overflow-hidden transition-all duration-300 group
                    ${
                      isSelected
                        ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] shadow-[0_0_20px_var(--accent-primary-mid)] scale-[1.02] z-10"
                        : "border-border-subtle bg-bg-panel/60 hover:border-border-active hover:bg-bg-panel z-0 hover:z-10 hover:scale-[1.01]"
                    }
                  `}
                >
                  <div
                    className="w-full h-20 mb-3 rounded-lg border border-border-subtle relative overflow-hidden shadow-inner group-hover:scale-[1.02] transition-transform duration-300"
                    style={{
                      // backgroundImage (longhand) + backgroundSize — the
                      // shorthand `background` resets size and triggers
                      // React's shorthand-vs-longhand re-render warning.
                      backgroundImage: bgGradient,
                      backgroundSize: bgData.size || "cover",
                    }}
                  >
                    <span className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-bg-abyss/80 text-text-secondary border border-border-subtle backdrop-blur-sm">
                      {item.bgCategory || "domain"}
                    </span>
                  </div>
                  <div className="flex justify-between items-start relative z-10">
                    <h4 className="font-bold text-sm font-rajdhani tracking-wide" style={{ color: isSelected ? "var(--accent-text-light)" : "var(--text-primary)" }}>
                      {item.name}
                    </h4>
                    {isSelected && (
                      <span className="text-[var(--accent-primary)]">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
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
            {themeItems.map((item: CosmeticItem, idx: number) => {
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
