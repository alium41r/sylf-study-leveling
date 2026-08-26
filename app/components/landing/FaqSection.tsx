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
      "Sylf is an AI-driven gamified study platform that turns your academic coursework and exam prep into structured RPG progression. You input your curriculum, the AI creates sequenced daily quests, and your focused study sessions award XP, level you up from Rank E to Monarch, and scale your cognitive attributes.",
  },
  {
    question: "Who is Sylf built for?",
    answer:
      "Sylf is designed for dedicated students tackling heavy curricula: Medical (MCAT, USMLE), STEM & Engineering, Law (Bar Exam), Finance (CFA), High School (A-Levels, AP, IB), and competitive exam candidates who need structure and motivation.",
  },
  {
    question: "When is Sylf launching?",
    answer:
      "Sylf is currently in closed testing. We are admitting waitlist signups in scheduled rolling beta waves to ensure platform stability. Joining the waitlist reserves your place in upcoming waves.",
  },
  {
    question: "Is Sylf free to use?",
    answer:
      "Yes. Sylf will offer a generous free tier covering core features: AI syllabus quest generation, deep work focus tracking, leveling and ranks, and acoustic soundscapes.",
  },
  {
    question: "What happens after I join the waitlist?",
    answer:
      "You receive an instant Scholar Access Pass with your queue number and a referral link. As soon as your beta cohort is admitted, we will email your invitation directly to your inbox.",
  },
  {
    question: "How does Sylf handle privacy and data security?",
    answer:
      "Your email and study data are stored securely and never sold to third parties or advertisers. We do not require account setup or credit card info just to join the waitlist.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 md:py-28 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
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
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Frequently Asked Questions
          </h2>

          <p className="text-base text-text-secondary leading-relaxed">
            Everything you need to know about Sylf, early access waves, and our academic progression engine.
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
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span
                    className="text-base sm:text-lg font-bold text-text-primary tracking-wide"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-text-muted shrink-0 transition-transform duration-200 ${
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
                      <div className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm sm:text-base text-text-secondary leading-relaxed border-t border-border-subtle/50 pt-3">
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
