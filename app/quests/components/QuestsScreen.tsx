"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function QuestsRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;
    // Preserve any existing query parameters while ensuring exactly one tab=quests
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "quests");
    router.replace(`/goals?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="p-12 text-center text-text-muted font-['Rajdhani']">
      Loading Quests...
    </div>
  );
}

export default function QuestsScreen() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted font-['Rajdhani']">Loading Quests...</div>}>
      <QuestsRedirectContent />
    </Suspense>
  );
}
