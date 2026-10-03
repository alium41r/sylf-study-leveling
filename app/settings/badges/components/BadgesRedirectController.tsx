"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BadgesRedirectController() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return (
    <div className="p-12 text-center text-text-muted font-['Rajdhani']">
      Redirecting to System Hub...
    </div>
  );
}

export default BadgesRedirectController;
