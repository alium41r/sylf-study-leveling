"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function QuestsRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve any existing query parameters while setting tab=quests
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "quests");
    router.replace(`/goals?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="p-12 text-center text-text-muted">
      Loading Quests...
    </div>
  );
}

export default function QuestsRedirectPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted">Loading Quests...</div>}>
      <QuestsRedirectContent />
    </Suspense>
  );
}
