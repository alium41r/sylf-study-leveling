// ============================================================================
// Focus Timer Layout Router (Phase 3A)
// ============================================================================
// Selects the appropriate presentational layout component based on category
// layoutKey. Guarantees clean fallback to ClassicTimerLayout on unknown keys.
// ============================================================================
"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FocusTimerLayoutProps } from "./FocusTimerLayoutProps";
import { ClassicTimerLayout } from "./layouts/ClassicTimerLayout";
import { AnimeTimerLayout } from "./layouts/AnimeTimerLayout";
import { LandscapeTimerLayout } from "./layouts/LandscapeTimerLayout";
import { FantasyTimerLayout } from "./layouts/FantasyTimerLayout";
import { normalizeLayoutKey } from "@/lib/focus-background-types";
import { FocusSessionBar } from "./FocusSessionBar";

export const FocusTimerLayoutRouter = memo(function FocusTimerLayoutRouter(
  props: FocusTimerLayoutProps
) {
  const normalizedKey = normalizeLayoutKey(props.layoutKey);

  return (
    <>
      <FocusSessionBar {...props} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={normalizedKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="w-full flex-1 flex flex-col justify-between items-center z-10 min-h-0"
        >
          {(() => {
            switch (normalizedKey) {
              case "anime":
                return <AnimeTimerLayout {...props} />;
              case "landscape":
                return <LandscapeTimerLayout {...props} />;
              case "fantasy":
                return <FantasyTimerLayout {...props} />;
              case "classic":
              default:
                return <ClassicTimerLayout {...props} />;
            }
          })()}
        </motion.div>
      </AnimatePresence>
    </>
  );
});
