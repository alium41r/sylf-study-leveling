"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../components/AuthProvider";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { THEME_MAP, BG_MAP } from "../components/GlobalSystemWrapper";

// --- Extensible Onboarding Types ---
type OnboardingStep = "BOOT" | "AVATAR" | "BACKGROUND" | "THEME" | "INITIALIZING";

export default function OnboardingFlow() {
  const router = useRouter();
  const { user, token, mutateUser } = useAuth();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("BOOT");
  
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step progression logic
  const steps: OnboardingStep[] = ["BOOT", "AVATAR", "BACKGROUND", "THEME", "INITIALIZING"];
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
        nextStep();
      }, 3500); // 3.5s cinematic boot
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // Live preview logic for theme/bg
  useEffect(() => {
    if (selectedTheme && THEME_MAP[selectedTheme]) {
      const vars = THEME_MAP[selectedTheme];
      for (const [prop, val] of Object.entries(vars)) {
        document.documentElement.style.setProperty(prop, val);
      }
    }
    
    if (selectedBackground && BG_MAP[selectedBackground]) {
      document.body.style.background = BG_MAP[selectedBackground].value;
      document.body.style.backgroundSize = BG_MAP[selectedBackground].size || "cover";
      document.body.style.backgroundAttachment = "fixed";
    }
  }, [selectedTheme, selectedBackground]);

  const submitOnboarding = async () => {
    if (!token || !user) return;
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          avatarId: selectedAvatar || "avatar_default",
          backgroundId: selectedBackground || "void",
          themeId: selectedTheme || "cyberpunk",
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize system");
      }

      // Pre-save preferences to localStorage for GlobalSystemWrapper
      if (selectedTheme) localStorage.setItem("app_theme", selectedTheme);
      if (selectedBackground) localStorage.setItem("app_background", selectedBackground);

      // Mutate user context so they bypass the onboarding guard
      mutateUser(data.user);
      
      // Delay redirect slightly for dramatic effect
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);

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

  // Submission logic
  useEffect(() => {
    if (currentStep === "INITIALIZING" && !isSubmitting) {
      submitOnboarding();
    }
  }, [currentStep, isSubmitting, submitOnboarding]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: "#020202", zIndex: 50 }}>
      {/* Ambient Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[128px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600 rounded-full mix-blend-screen filter blur-[128px] animate-pulse" style={{ animationDelay: "2s" }}></div>
      </div>

      <AnimatePresence mode="wait">
        {currentStep === "BOOT" && (
          <BootSequence key="boot" />
        )}
        
        {currentStep === "AVATAR" && (
          <SelectionStep 
            key="avatar"
            title="SELECT YOUR AVATAR"
            subtitle="The face you present to the System."
            items={COSMETICS_CATALOG.AVATAR}
            selectedId={selectedAvatar}
            onSelect={setSelectedAvatar}
            onNext={nextStep}
            canProceed={!!selectedAvatar}
          />
        )}

        {currentStep === "BACKGROUND" && (
          <SelectionStep 
            key="background"
            title="SELECT DOMAIN"
            subtitle="Choose the environment for your awakening."
            items={COSMETICS_CATALOG.BACKGROUND}
            selectedId={selectedBackground}
            onSelect={setSelectedBackground}
            onNext={nextStep}
            onPrev={prevStep}
            canProceed={!!selectedBackground}
          />
        )}

        {currentStep === "THEME" && (
          <SelectionStep 
            key="theme"
            title="CALIBRATE RESONANCE"
            subtitle="Choose your core system aura."
            items={COSMETICS_CATALOG.THEME}
            selectedId={selectedTheme}
            onSelect={setSelectedTheme}
            onNext={nextStep}
            onPrev={prevStep}
            canProceed={!!selectedTheme}
            nextLabel="INITIALIZE"
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
  const [text, setText] = useState("");
  const fullText = "SYSTEM.AWAKENING...";

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="flex flex-col items-center text-center z-10"
    >
      <motion.div 
        animate={{ 
          opacity: [0.5, 1, 0.2, 1, 0.8, 1],
          x: [0, -2, 2, -1, 1, 0]
        }}
        transition={{ duration: 2, times: [0, 0.2, 0.4, 0.6, 0.8, 1], repeat: Infinity, repeatDelay: 1 }}
        className="mb-6 w-24 h-24 border-4 border-cyan-400 rounded-full flex items-center justify-center relative"
      >
        <div className="absolute inset-0 border-4 border-t-transparent border-purple-500 rounded-full animate-spin"></div>
        <span className="text-3xl">👁</span>
      </motion.div>
      <h1 className="text-3xl font-bold tracking-[0.5em] text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" style={{ fontFamily: "var(--font-rajdhani)" }}>
        {text}
        <motion.span animate={{ opacity: [0, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>_</motion.span>
      </h1>
      <p className="mt-4 text-xs text-gray-500 tracking-widest uppercase">Connecting to the Akashic Records...</p>
    </motion.div>
  );
}

interface SelectionStepProps {
  title: string;
  subtitle: string;
  items: any[]; // Using any here temporarily to avoid importing CosmeticItem for brevity, but let's just type it inline if possible or keep any and ignore, actually I'll use a local type
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
  onPrev?: () => void;
  canProceed: boolean;
  nextLabel?: string;
}

function SelectionStep({ 
  title, subtitle, items, selectedId, onSelect, onNext, onPrev, canProceed, nextLabel = "CONFIRM" 
}: SelectionStepProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-4xl p-8 z-10 flex flex-col h-[80vh]"
    >
      <div className="text-center mb-10">
        <h2 className="text-4xl font-bold tracking-widest uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ fontFamily: "var(--font-rajdhani)" }}>
          {title}
        </h2>
        <p className="text-gray-400 mt-2 text-sm uppercase tracking-wider">{subtitle}</p>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 p-2">
          {items.map((item: { id: string, category: string, value: string, name: string, description: string }, idx: number) => {
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
                    : "border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-800/80 z-0 hover:z-10 hover:scale-[1.01]"}
                `}
              >
                {/* Visual Preview logic based on category */}
                {item.category === "AVATAR" && (
                  <div className="text-5xl mb-4 text-center">{item.value}</div>
                )}
                {item.category === "BACKGROUND" && (
                  <div className="w-full h-24 mb-4 rounded-lg border border-gray-700/50 relative overflow-hidden" 
                       style={{ background: BG_MAP[item.value]?.value || "#000" }}>
                  </div>
                )}
                {item.category === "THEME" && (
                  <div className="w-full h-24 mb-4 rounded-lg flex items-center justify-center border border-gray-700/50"
                       style={{ backgroundColor: THEME_MAP[item.value]?.["--accent-primary-dim"] || "#222" }}>
                    <div className="w-8 h-8 rounded-full shadow-lg" 
                         style={{ backgroundColor: THEME_MAP[item.value]?.["--accent-primary"] || "#fff" }}></div>
                  </div>
                )}

                <div className="flex justify-between items-start mb-2 relative z-10">
                  <h3 className="font-bold text-lg text-white font-rajdhani tracking-wide">{item.name}</h3>
                  {isSelected && (
                    <motion.div layoutId="selectedBadge" className="text-[var(--accent-primary)]">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </motion.div>
                  )}
                </div>
                <p className="text-sm text-gray-400 relative z-10">{item.description}</p>
                
                {/* Hover Glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500" 
                     style={{ background: "radial-gradient(circle at center, var(--accent-primary-dim) 0%, transparent 70%)" }}>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between mt-6 pt-6 border-t border-gray-800">
        {onPrev ? (
          <button 
            onClick={onPrev}
            className="px-6 py-3 rounded text-gray-400 hover:text-white transition-colors tracking-widest text-sm uppercase"
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
              : "bg-gray-800 text-gray-600 cursor-not-allowed"}
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
          <h2 className="text-2xl text-red-500 font-bold mb-2">INITIALIZATION FAILED</h2>
          <p className="text-gray-400">{error}</p>
          <p className="text-xs text-gray-500 mt-4">Retrying logic sequence...</p>
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
          <motion.div className="w-64 h-1 bg-gray-800 mt-6 rounded overflow-hidden relative">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 1.5, ease: "circOut" }}
              className="absolute inset-y-0 left-0 bg-[var(--accent-primary)] w-full"
            ></motion.div>
          </motion.div>
          <p className="mt-4 text-xs text-gray-500 tracking-widest uppercase animate-pulse">Injecting configurations...</p>
        </>
      )}
    </motion.div>
  );
}
