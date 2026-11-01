"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { SylvieIcon, SystemWarningIcon } from "@/app/components/icons";
import { useAuth } from "@/app/components/AuthProvider";
import type { PlannerCapabilities } from "@/lib/planner/transport";
import { workspaceRequest } from "@/lib/planner/v2/client/transport";
import StudentPlannerEntry from "./StudentPlannerEntry";
import s from "./StudentPlannerWorkspace.module.css";

/** Shared web/mobile route. APIs remain the authentication and ownership owner;
 * an opaque route ID is a selection, never permission to read or mutate it. */
export default function StudentPlannerScreen({
  initialPlanId,
}: {
  initialPlanId?: string;
}) {
  const { user } = useAuth(),
    router = useRouter(),
    pathname = usePathname();
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{
    ownerId: number | undefined;
    capabilities: PlannerCapabilities | null;
    error: string | null;
  } | null>(null);
  const ownerId = user?.id;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void workspaceRequest<PlannerCapabilities>(
      "/capabilities",
      undefined,
      controller.signal
    )
      .then((capabilities) => {
        if (active) setResult({ ownerId, capabilities, error: null });
      })
      .catch((error) => {
        if (active)
          setResult({ ownerId, capabilities: null, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [ownerId, reload]);
  const current = result?.ownerId === ownerId ? result : null;
  if (
    !current ||
    current.error ||
    !current.capabilities?.studentWorkspace?.enabled
  )
    return (
      <section className={s.root}>
        <div className={s.stage}>
          <header className={s.top}>
            <button
              type="button"
              className={s.icon}
              onClick={() => router.push("/system?tab=planner")}
              aria-label="Back to Classic Planner"
            >
              <ArrowLeft size={16} />
            </button>
            <div className={s.brand}>
              <h1>Planner</h1>
              <span className={s.badge}>Preview</span>
            </div>
            <div className={s.switcherPlaceholder} aria-hidden="true">
              <span>Your plans</span>
              <ChevronDown size={14} />
            </div>
          </header>
          <div className={s.gate}>
            {!current ? (
              <div className={s.gateLoading} role="status">
                <span className={s.loadingEmblem}>
                  <SylvieIcon size={34} />
                </span>
                <strong className={s.loadingTitle}>
                  Opening Planner Studio
                </strong>
                <p className={s.loadingSub}>
                  Preparing your AI planning workspace…
                </p>
                <div className={s.loadingTrack} aria-hidden="true">
                  <div className={s.loadingBar} />
                </div>
              </div>
            ) : (
              <div className={s.gateError}>
                <span className={s.gateWarningIcon}>
                  <SystemWarningIcon size={32} />
                </span>
                <h2>
                  {current.error
                    ? "Planner could not open"
                    : "Planner preview is unavailable"}
                </h2>
                <p role={current.error ? "alert" : undefined}>
                  {current.error ??
                    "Your existing Planner remains available in System. The student workspace has not been enabled here."}
                </p>
                <div className={s.gateActions}>
                  <button
                    type="button"
                    className={s.button}
                    onClick={() => setReload((n) => n + 1)}
                  >
                    Check again
                  </button>
                  <Link href="/system?tab=planner" className={s.ghost}>
                    Back to Classic Planner
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  return (
    <StudentPlannerEntry
      capabilities={current.capabilities}
      initialPlanId={initialPlanId}
      onExit={() => router.push("/system?tab=planner")}
      onQuotaRefresh={() => {}}
      onPlanSelected={(id) => {
        const next = id ? `/planner/${encodeURIComponent(id)}` : "/planner";
        if (pathname !== next) router.replace(next);
      }}
    />
  );
}
