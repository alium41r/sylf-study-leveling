"use client";

import React, { useState } from "react";
import { Check, ArrowRight } from "lucide-react";

interface PricingPlan {
  id: string;
  name: string;
  badge?: string;
  isPopular?: boolean;
  priceMonthly: number;
  priceAnnual: number;
  description: string;
  ctaText: string;
  features: string[];
}

const PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Scholar Free",
    badge: "Active During Beta",
    priceMonthly: 0,
    priceAnnual: 0,
    description: "Core tools to build a consistent daily study habit.",
    ctaText: "Join Free Beta",
    features: [
      "Distraction-free focus timer with all study interval modes",
      "Calibrated ambient soundscapes (40Hz binaural, rain, white noise)",
      "Full 8-tier rank progression from Rank E to Monarch",
      "Syllabus quest breakdown for core subjects",
      "Daily streak tracking and study calendar",
      "Verified lifetime focus hour statistics",
    ],
  },
  {
    id: "pro",
    name: "Scholar Pro",
    badge: "Early Access",
    isPopular: true,
    priceMonthly: 12,
    priceAnnual: 8,
    description: "For heavy academic workloads, board exams, and competitive fields.",
    ctaText: "Reserve Pro Access",
    features: [
      "Everything included in Scholar Free",
      "Unlimited AI syllabus breakdowns and automatic rescheduling",
      "Multi-track ambient soundscape mixer",
      "Deep habit analytics: stamina, consistency, and focus trends",
      "Additional monthly streak protection shields",
      "Exclusive scholar dossier titles and profile themes",
    ],
  },
];

export default function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);

  const scrollToWaitlist = () => {
    const el = document.getElementById("waitlist");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="pricing" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
            <span>Pricing</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Simple, honest pricing.
          </h2>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            100% free during our early access beta. Optional Pro features available for high-volume study loads.
          </p>

          {/* Billing Switcher */}
          <div className="mt-6 inline-flex items-center gap-2 p-1 rounded-lg border border-border-subtle bg-bg-abyss text-xs font-['Rajdhani'] font-bold select-none">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                !isAnnual
                  ? "bg-accent-primary text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                isAnnual
                  ? "bg-accent-primary text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <span>Annual</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                Save 33%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
          {PLANS.map((plan) => {
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;

            return (
              <div
                key={plan.id}
                className={`p-6 sm:p-8 rounded-xl border flex flex-col justify-between relative transition-colors ${
                  plan.isPopular
                    ? "border-accent-primary-mid bg-bg-abyss shadow-md"
                    : "border-border-subtle bg-bg-abyss/80 hover:border-border-active"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-bold text-text-primary font-['Rajdhani'] tracking-wide">
                      {plan.name}
                    </h3>
                    {plan.badge && (
                      <span className="text-[10px] uppercase font-bold tracking-wider font-['Rajdhani'] px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid/30">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-text-secondary mb-6">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-6 pb-6 border-b border-border-subtle">
                    <span className="text-4xl font-extrabold font-mono text-text-primary">
                      ${price}
                    </span>
                    <span className="text-xs text-text-muted font-mono">
                      {plan.priceMonthly === 0 ? "/ free in beta" : "/ month (billed annually)"}
                    </span>
                  </div>

                  {/* Feature List */}
                  <ul className="space-y-2.5 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-text-secondary">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <button
                    onClick={scrollToWaitlist}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold font-['Rajdhani'] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                      plan.isPopular
                        ? "btn-primary"
                        : "bg-bg-void hover:bg-bg-abyss text-text-primary border border-border-subtle hover:border-border-active"
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <p className="text-[11px] text-text-muted text-center mt-2 font-mono">
                    {plan.priceMonthly === 0
                      ? "No credit card required"
                      : "Early access cohorts"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
