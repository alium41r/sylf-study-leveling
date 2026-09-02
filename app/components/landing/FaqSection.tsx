"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What exactly is Sylf?",
    answer:
      "Sylf is a gamified study operating system designed to eliminate study paralysis. It breaks down dense syllabi into bite-sized daily quests, tracks your deep work with a distraction-free timer and calibrated acoustics, and translates real focus time into an 8-tier rank progression from Rank E to Monarch.",
  },
  {
    question: "Do I need to enter my entire syllabus right away?",
    answer:
      "No. You can start with a single topic, an upcoming midterm, or a few chapters. As you build momentum, you can paste larger syllabi and let Sylf sequence the material across your calendar.",
  },
  {
    question: "Can I use Sylf just as a focus timer?",
    answer:
      "Yes. If you already have your own study plan, you can open the Focus Room directly. Choose from seven interval modes (including Pomodoro, 52/17, and Flowtime), select an ambient soundscape (such as 40Hz focus tones or rain), and start tracking focus immediately.",
  },
  {
    question: "How do XP and ranks work?",
    answer:
      "Every minute of focused study earns +4 XP. As you bank XP from completed sessions, you level up and advance through 8 rank tiers: E, D, C, B, A, S, National, and Monarch. Ranks reflect your verifiable academic hours.",
  },
  {
    question: "What happens if I miss a day or need a break?",
    answer:
      "Sylf is built for sustainable consistency rather than burnout. You can designate weekly rest days on your calendar, and regular study sessions earn streak shields that automatically protect your streak when unexpected interruptions occur.",
  },
  {
    question: "Is Sylf free to use?",
    answer:
      "Yes. Core features—including the study timer, ambient soundscapes, syllabus quest breakdown, and 8-tier rank ladder—are completely free during our beta. Optional Pro plans will be available for high-volume study loads and deeper analytics.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
            <span>FAQ</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl font-extrabold text-text-primary mb-3 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Frequently Asked Questions
          </h2>

          <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
            Everything you need to know about Sylf, study quests, and beta access.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-2.5">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className="rounded-xl border border-border-subtle bg-bg-abyss/90 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span
                    className="text-sm sm:text-base font-bold text-text-primary tracking-wide"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-accent-text-light" : ""
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
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-xs sm:text-sm text-text-secondary leading-relaxed border-t border-border-subtle/50 pt-3">
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
