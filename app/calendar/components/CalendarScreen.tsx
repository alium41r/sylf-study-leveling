"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import StudyCalendar from "../../components/Calendar/StudyCalendar";
import { Calendar } from "lucide-react";
import styles from "../Calendar.module.css";

export default function CalendarScreen() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  if (!user) {
    return (
      <div className={styles.calendarContainer}>
        <div className={styles.topGlow} aria-hidden="true" />
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-20 text-center font-['Rajdhani'] text-lg" style={{ color: "var(--muted)" }}>
          Loading Calendar...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.calendarContainer}>
      {/* Ambient Starlight Canvas Glow (Synchronized Dark / Light Mode) */}
      <div className={styles.topGlow} aria-hidden="true" />

      <div className="w-full min-w-0 max-w-6xl mx-auto px-4 sm:px-8 py-6 pb-20 relative z-10 animate-fade-in">
        {/* Page Heading */}
        <div className="flex flex-col justify-between items-start mb-8 gap-2 mt-2 w-full min-w-0">
          <h1 className={styles.title}>
            <Calendar size={28} className="text-accent-primary shrink-0" />
            <span>Calendar</span>
          </h1>
        </div>

        <StudyCalendar />
      </div>
    </div>
  );
}
