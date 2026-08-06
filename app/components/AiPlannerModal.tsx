"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface AiPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlanCreated?: (plan: any) => void;
}

export default function AiPlannerModal({ isOpen, onClose, onPlanCreated }: AiPlannerModalProps) {
  const router = useRouter();
  const [goalTitle, setGoalTitle] = useState("");
  const [syllabusText, setSyllabusText] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [effortLevel, setEffortLevel] = useState(10); // Hours per week
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const thoughtsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thoughtsEndRef.current) {
      thoughtsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [thoughts]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!goalTitle.trim()) {
      setError("Please enter a subject or goal title.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setThoughts(["Initializing Multi-Agent System..."]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ai-planner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic: goalTitle,
          syllabus: syllabusText,
          effortHours: effortLevel,
          targetDate: targetDate || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate plan");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (part.startsWith("data: ")) {
              const dataStr = part.substring(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "thought") {
                  setThoughts(prev => [...prev, data.text]);
                } else if (data.type === "result") {
                  setThoughts(prev => [...prev, "Plan finalized! Redirecting..."]);
                  
                  setTimeout(() => {
                    setIsGenerating(false);
                    if (onPlanCreated) onPlanCreated(data.goal);
                    onClose();
                    setGoalTitle("");
                    setSyllabusText("");
                    setTargetDate("");
                    setEffortLevel(10);
                    setThoughts([]);
                    router.push("/quests");
                  }, 1500);
                  return; // End loop
                } else if (data.type === "error") {
                  setError(data.message);
                  setIsGenerating(false);
                  setThoughts([]);
                  return; // Exit loop and function
                }
              } catch (e) {
                console.error("Error parsing SSE JSON:", e, dataStr);
              }
            }
          }
        }
      }

    } catch (err: any) {
      setError(err.message);
      setIsGenerating(false);
      setThoughts([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-[#06080d] border border-cyan-500/20 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.15)] w-full max-w-xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-[#0d1117] border-b border-white/10 p-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-accent-light flex items-center gap-2" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              AI Study Planner
            </h2>
            {!isGenerating && (
              <button onClick={onClose} className="text-gray-400 hover:text-white transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-6 text-gray-200">
            {isGenerating ? (
              <div className="flex flex-col py-6 space-y-6">
                <div className="flex justify-center mb-4">
                  <div className="relative w-24 h-24">
                    <motion.div
                      className="absolute inset-0 rounded-full border-t-4 border-indigo-500 opacity-75"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-2 rounded-full border-r-4 border-purple-500 opacity-75"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-3xl">
                      🧠
                    </div>
                  </div>
                </div>
                
                {/* Thoughts Terminal */}
                <div className="bg-black/40 border border-gray-800 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-indigo-300">
                  {thoughts.map((t, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="mb-2"
                    >
                      <span className="text-gray-500 mr-2">{'>'}</span>{t}
                    </motion.div>
                  ))}
                  <div ref={thoughtsEndRef} />
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {error && (
                  <div className="p-3 bg-red-900/50 border border-red-500/50 text-red-200 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    What do you want to master?
                  </label>
                  <input
                    type="text"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="e.g., AP Physics 1, AWS Cloud Practitioner..."
                    className="w-full bg-[#0d1117] border border-blue-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Deadline / Exam Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full bg-[#0d1117] border border-blue-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                    style={{ colorScheme: "dark" }}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank for continuous learning with no strict deadlines.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Syllabus / Topics (Optional)
                  </label>
                  <textarea
                    value={syllabusText}
                    onChange={(e) => setSyllabusText(e.target.value)}
                    placeholder="Paste your chapters, topics, or course outline here..."
                    className="w-full bg-[#0d1117] border border-blue-500/30 rounded-xl px-4 py-3 text-white h-24 focus:outline-none focus:border-cyan-500 transition resize-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Target Effort Level
                    </label>
                    <span className="text-cyan-400 font-bold bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                      {effortLevel} hrs / week
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={effortLevel}
                    onChange={(e) => setEffortLevel(Number(e.target.value))}
                    className="w-full h-2 bg-[#0d1117] border border-blue-500/30 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-2 font-medium">
                    <span>Chill (1 hr)</span>
                    <span>Intense (40 hrs)</span>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  className="w-full btn-primary py-3.5 rounded-xl font-bold tracking-wide mt-2"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  GENERATE AI STUDY PLAN
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
