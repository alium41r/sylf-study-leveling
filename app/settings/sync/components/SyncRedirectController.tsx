"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SyncRedirectController() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/account");
  }, [router]);

  return null;
}

export default SyncRedirectController;
