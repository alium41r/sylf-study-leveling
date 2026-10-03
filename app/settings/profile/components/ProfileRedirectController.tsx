"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ProfileRedirectController() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/locker?tab=identity");
  }, [router]);

  return (
    <div className="p-12 text-center text-text-muted font-['Rajdhani']">
      Redirecting to Scholar Locker...
    </div>
  );
}

export default ProfileRedirectController;
