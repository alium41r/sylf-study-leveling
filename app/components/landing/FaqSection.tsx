"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What is Sylf?",
    answer:
      "Sylf is an AI-powered study RPG that turns your curriculum into sequenced daily quests. Study sessions award XP, level you up from Rank E to Monarch, and scale cognitive attributes.",
  },
  {
    question: "Who is Sylf built for?",
    answer:
      "Students tackling demanding material: STEM, Medicine (MCAT/USMLE), Law, Finance, and high school exams (AP, IB, A-Levels) who want structured daily momentum.",
  },
  {
    question: "When is Sylf launching?",
    answer:
      "We are rolling out invitations in scheduled beta waves. Joining the waitlist reserves your place for the next cohort.",
  },
  {
    question: "Is Sylf free to use?",
    answer:
      "Yes. Core features—including AI quest generation, focus timers, ambient soundscapes, and rank progression—are free.",
  },
  {
    question: "What happens after I join the waitlist?",
    answer:
      "You receive an instant Scholar Pass and queue number. We'll email your invite link as soon as your beta cohort is admitted.",
  },
  {
    question: "How does Sylf handle privacy and data security?",
    answer:
      "Your data is encrypted and never sold or shared with advertisers. No credit card is required.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div
            className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs tracking-[0.2em] uppercase font-bold border"
            style={{
              background: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>KNOWLEDGE BASE</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Frequently Asked Questions
          </h2>

          <p className="text-[15px] sm:text-base text-text-secondary leading-relaxed">
            Common questions about Sylf, beta waves, and our academic progression engine.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className="rounded-2xl border border-border-subtle bg-bg-abyss overflow-hidden transition-colors"
                style={{
                  borderColor: isOpen ? "var(--border-active)" : "var(--border-subtle)",
                }}
              >
                <button
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span
                    className="text-[15px] sm:text-lg font-bold text-text-primary tracking-wide"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 sm:w-5 sm:h-5 text-text-muted shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-accent-primary-light" : ""
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${index}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <div className="px-4 sm:px-6 pb-4 sm:pb-6 text-[13px] sm:text-base text-text-secondary leading-relaxed border-t border-border-subtle/50 pt-3">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
