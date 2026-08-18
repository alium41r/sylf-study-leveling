"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BadgesRedirect() {
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
