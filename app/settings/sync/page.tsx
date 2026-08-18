"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SyncSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/account");
  }, [router]);

  return null;
}
