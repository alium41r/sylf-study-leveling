"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import StudyCalendar from "../components/Calendar/StudyCalendar";

export default function CalendarPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [token, router]);

  if (!user) {
    return <div className="p-8 text-center text-gray-400 font-['Rajdhani']">Loading Calendar...</div>;
  }

  return (
    <div className="p-8 pb-20 max-w-5xl mx-auto animate-fade-in">
      <div className="flex flex-col justify-between items-start mb-10 gap-6 mt-4">
        <div>
          <p className="text-xs tracking-widest mb-1 text-cyan-400 font-['Rajdhani'] uppercase">SCHOLAR DASHBOARD</p>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 mb-4 md:mb-0">
            Study Calendar
          </h1>
        </div>
      </div>

      <StudyCalendar />
    </div>
  );
}
