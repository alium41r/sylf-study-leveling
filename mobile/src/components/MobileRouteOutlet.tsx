import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { SylvieIcon } from "@/app/components/icons";

// ============================================================================
// Route-Level Lazy Loading
// ============================================================================
// Each canonical screen is wrapped in React.lazy() so that navigating to
// /dashboard does NOT eagerly load the implementation code for Focus, Social,
// Locker, System, etc. Vite splits each into a separate chunk.
// ============================================================================

const DashboardScreen = React.lazy(() =>
  import("@/app/dashboard/components/DashboardScreen").then((m) => ({
    default: m.DashboardScreen,
  }))
);

const FocusScreen = React.lazy(() =>
  import("@/app/focus/components/FocusScreen").then((m) => ({
    default: m.FocusScreen,
  }))
);

const TimerScreen = React.lazy(() =>
  import("@/app/timer/components/TimerScreen").then((m) => ({
    default: m.TimerScreen,
  }))
);

const SocialScreen = React.lazy(() =>
  import("@/app/social/components/SocialScreen").then((m) => ({
    default: m.SocialScreen,
  }))
);

const LockerScreen = React.lazy(() =>
  import("@/app/locker/components/LockerScreen").then((m) => ({
    default: m.LockerScreen,
  }))
);

const SystemScreen = React.lazy(() =>
  import("@/app/system/components/SystemScreen").then((m) => ({
    default: m.SystemScreen,
  }))
);

const GoalsScreen = React.lazy(() => import("@/app/goals/components/GoalsScreen"));

const QuestsScreen = React.lazy(() => import("@/app/quests/components/QuestsScreen"));

const CalendarScreen = React.lazy(() => import("@/app/calendar/components/CalendarScreen"));

const ShopScreen = React.lazy(() => import("@/app/shop/components/ShopScreen"));

const SettingsIndexController = React.lazy(() =>
  import("@/app/settings/components/SettingsIndexController").then((m) => ({
    default: m.SettingsIndexController,
  }))
);

const AccountSettingsScreen = React.lazy(() =>
  import("@/app/settings/account/components/AccountSettingsScreen").then((m) => ({
    default: m.AccountSettingsScreen,
  }))
);

const AppearanceSettingsScreen = React.lazy(() =>
  import("@/app/settings/appearance/components/AppearanceSettingsScreen").then((m) => ({
    default: m.AppearanceSettingsScreen,
  }))
);

const ThemesSettingsScreen = React.lazy(() =>
  import("@/app/settings/themes/components/ThemesSettingsScreen").then((m) => ({
    default: m.ThemesSettingsScreen,
  }))
);

const BackgroundsSettingsScreen = React.lazy(() =>
  import("@/app/settings/backgrounds/components/BackgroundsSettingsScreen").then((m) => ({
    default: m.BackgroundsSettingsScreen,
  }))
);

const NotificationsSettingsScreen = React.lazy(() =>
  import("@/app/settings/notifications/components/NotificationsSettingsScreen").then((m) => ({
    default: m.NotificationsSettingsScreen,
  }))
);

const StatsSettingsScreen = React.lazy(() =>
  import("@/app/settings/stats/components/StatsSettingsScreen").then((m) => ({
    default: m.StatsSettingsScreen,
  }))
);

const RankingsSettingsScreen = React.lazy(() =>
  import("@/app/settings/rankings/components/RankingsSettingsScreen").then((m) => ({
    default: m.RankingsSettingsScreen,
  }))
);

const ModesSettingsScreen = React.lazy(() =>
  import("@/app/settings/modes/components/ModesSettingsScreen").then((m) => ({
    default: m.ModesSettingsScreen,
  }))
);

const FocusBackgroundsSettingsScreen = React.lazy(() =>
  import("@/app/settings/focus-backgrounds/components/FocusBackgroundsSettingsScreen").then((m) => ({
    default: m.FocusBackgroundsSettingsScreen,
  }))
);

const CollectionSettingsScreen = React.lazy(() =>
  import("@/app/settings/collection/components/CollectionSettingsScreen").then((m) => ({
    default: m.CollectionSettingsScreen,
  }))
);

const AchievementsSettingsScreen = React.lazy(() =>
  import("@/app/settings/achievements/components/AchievementsSettingsScreen").then((m) => ({
    default: m.AchievementsSettingsScreen,
  }))
);

const ArchiveSettingsScreen = React.lazy(() =>
  import("@/app/settings/archive/components/ArchiveSettingsScreen").then((m) => ({
    default: m.ArchiveSettingsScreen,
  }))
);

const CalendarSettingsScreen = React.lazy(() =>
  import("@/app/settings/calendar/components/CalendarSettingsScreen").then((m) => ({
    default: m.CalendarSettingsScreen,
  }))
);

const ProfileRedirectController = React.lazy(() =>
  import("@/app/settings/profile/components/ProfileRedirectController").then((m) => ({
    default: m.ProfileRedirectController,
  }))
);

const BadgesRedirectController = React.lazy(() =>
  import("@/app/settings/badges/components/BadgesRedirectController").then((m) => ({
    default: m.BadgesRedirectController,
  }))
);

const SyncRedirectController = React.lazy(() =>
  import("@/app/settings/sync/components/SyncRedirectController").then((m) => ({
    default: m.SyncRedirectController,
  }))
);

// ============================================================================
// Explicit Route Map
// ============================================================================
// CRITICAL: Route matching uses EXACT path equality, not startsWith().
//
// This prevents deferred dynamic/nested routes like:
//   /social/chat/[conversationId]
//   /focus/[sessionId]
//   /timer/subjects/[id]
//   /settings/logout
//
// from being silently swallowed by the parent screen. Unsupported
// dynamic/nested routes resolve to a clear "Route Not Yet Migrated" fallback.
// ============================================================================

/**
 * Set of EXACT paths that are migrated and render a canonical screen.
 * Any path NOT in this set falls through to placeholder or "not migrated".
 */
const MIGRATED_EXACT_ROUTES: Record<string, () => React.ReactNode> = {
  "/": () => <DashboardScreen />,
  "/dashboard": () => <DashboardScreen />,
  "/home": () => <DashboardScreen />,
  "/focus": () => <FocusScreen />,
  "/timer": () => <TimerScreen />,
  "/social": () => <SocialScreen />,
  "/locker": () => <LockerScreen />,
  "/system": () => <SystemScreen />,
  "/goals": () => <GoalsScreen />,
  "/quests": () => <QuestsScreen />,
  "/calendar": () => <CalendarScreen />,
  "/shop": () => <ShopScreen />,
  "/inventory": () => <ShopScreen />,
  "/settings": () => <SettingsIndexController />,
  "/settings/account": () => <AccountSettingsScreen />,
  "/settings/appearance": () => <AppearanceSettingsScreen />,
  "/settings/themes": () => <AppearanceSettingsScreen />,
  "/settings/backgrounds": () => <AppearanceSettingsScreen />,
  "/settings/notifications": () => <NotificationsSettingsScreen />,
  "/settings/stats": () => <StatsSettingsScreen />,
  "/settings/rankings": () => <RankingsSettingsScreen />,
  "/settings/modes": () => <ModesSettingsScreen />,
  "/settings/focus-backgrounds": () => <FocusBackgroundsSettingsScreen />,
  "/settings/collection": () => <CollectionSettingsScreen />,
  "/settings/achievements": () => <AchievementsSettingsScreen />,
  "/settings/archive": () => <ArchiveSettingsScreen />,
  "/settings/calendar": () => <CalendarSettingsScreen />,
  "/settings/profile": () => <ProfileRedirectController />,
  "/settings/badges": () => <BadgesRedirectController />,
  "/settings/sync": () => <SyncRedirectController />,
};

/**
 * Routes that have a known parent screen but whose deeper dynamic paths
 * are explicitly NOT migrated yet. Maps a path prefix to its parent route
 * name (for the "not migrated" message).
 */
const DEFERRED_DYNAMIC_PREFIXES: { prefix: string; parentName: string; phase: string }[] = [
  { prefix: "/social/chat/", parentName: "Social Chat", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/social/", parentName: "Social", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/focus/", parentName: "Focus Session", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/timer/subjects/", parentName: "Timer Subject", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/timer/", parentName: "Timer", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/locker/", parentName: "Locker", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/system/", parentName: "System", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/goals/", parentName: "Objectives & Goals", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/quests/", parentName: "Quests", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/calendar/", parentName: "Calendar", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/shop/", parentName: "Shop", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/inventory/", parentName: "Inventory", phase: "Phase 1D Deferred Dynamic Route" },
  { prefix: "/settings/logout", parentName: "Logout", phase: "Phase 2 Mobile Auth" },
  { prefix: "/settings/", parentName: "Settings", phase: "Phase 1D Deferred Dynamic Route" },
];

/**
 * Deferred top-level routes that remain as placeholders.
 */
const DEFERRED_PLACEHOLDER_ROUTES: {
  match: (p: string) => boolean;
  title: string;
  route: string;
  badge: string;
  icon: React.ReactNode;
  description: string;
}[] = [];

// ============================================================================
// Placeholder Components
// ============================================================================

interface PlaceholderProps {
  title: string;
  route: string;
  badge?: string;
  icon: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}

function RoutePlaceholder({
  title,
  route,
  badge = "Production screen migration deferred",
  icon,
  description,
  children,
}: PlaceholderProps) {
  return (
    <div className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      {/* Route Header Card */}
      <div className="p-6 rounded-3xl border border-border-subtle bg-bg-panel/60 backdrop-blur-xl shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center text-accent-primary-light shadow-sm">
              {icon}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                {title}
              </h1>
              <p className="text-xs font-mono text-text-muted">
                Canonical Route: <code className="text-accent-primary-light font-bold">{route}</code>
              </p>
            </div>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent-primary/30 bg-accent-primary/10 text-accent-primary-light text-xs font-['Rajdhani'] font-bold uppercase tracking-wider">
            <SylvieIcon size={14} />
            <span>Canonical Shell Active</span>
          </span>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed pt-1">
          {description}
        </p>

        <div className="pt-2">
          <span className="inline-block px-3 py-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs font-mono font-semibold">
            {badge}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}

/**
 * Themed loading spinner used as the Suspense fallback while lazy chunks load.
 */
function RouteLoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50dvh]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-accent-primary/15 blur-xl opacity-75 animate-pulse" />
          <Loader2 className="w-8 h-8 text-accent-primary animate-spin relative z-10" />
        </div>
        <span className="text-xs font-['Rajdhani'] uppercase tracking-widest text-text-muted font-bold">
          Loading Module...
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Route Outlet
// ============================================================================

export function MobileRouteOutlet() {
  const pathname = usePathname();

  // 1. Exact-match migrated routes (canonical screens)
  const exactRenderer = MIGRATED_EXACT_ROUTES[pathname];
  if (exactRenderer) {
    return <Suspense fallback={<RouteLoadingSpinner />}>{exactRenderer()}</Suspense>;
  }

  // 2. Deferred dynamic/nested routes — clear "not migrated" message
  for (const deferred of DEFERRED_DYNAMIC_PREFIXES) {
    if (pathname.startsWith(deferred.prefix)) {
      return (
        <RoutePlaceholder
          title={`${deferred.parentName} Sub-Route`}
          route={pathname}
          badge={`Dynamic route not yet migrated — deferred to ${deferred.phase}`}
          icon={<LayoutDashboard className="w-6 h-6" />}
          description={`This nested route (${pathname}) requires dynamic data resolution that is not yet available on the mobile client. The parent ${deferred.parentName} screen is available.`}
        />
      );
    }
  }

  // 3. Deferred top-level placeholder routes
  for (const placeholder of DEFERRED_PLACEHOLDER_ROUTES) {
    if (placeholder.match(pathname)) {
      return (
        <RoutePlaceholder
          title={placeholder.title}
          route={placeholder.route}
          badge={placeholder.badge}
          icon={placeholder.icon}
          description={placeholder.description}
        />
      );
    }
  }

  // 4. Fallback for completely unknown routes
  return (
    <RoutePlaceholder
      title="Route Not Found"
      route={pathname}
      badge="Unknown route"
      icon={<LayoutDashboard className="w-6 h-6" />}
      description="This route is not recognized by the mobile client."
    />
  );
}

export default MobileRouteOutlet;
