"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ToolType = "calculator" | "ai" | "audio" | "notes" | "formulas" | null;
export type WindowMode = "normal" | "minimized";
export type DockAnchor = "bottom-right" | "bottom-center" | "bottom-left" | "right" | "left" | "top-right" | "top-left";

export interface DockPosition {
  x: number;
  y: number;
}

export const getMaxOpenTools = (): number => {
  if (typeof window !== "undefined" && window.innerWidth >= 1440) {
    return 3;
  }
  return 2;
};

interface FocusToolsContextType {
  activeTool: ToolType;
  openTools: NonNullable<ToolType>[];
  isMultiToolMode: boolean;
  isDockExpanded: boolean;
  isToolbarHidden: boolean;
  windowMode: WindowMode;
  dockAnchor: DockAnchor;
  dockPosition: DockPosition | null;
  subjectName?: string;
  questTitle?: string;
  minimizedTools: Record<string, boolean>;
  maximizedTools: Record<string, boolean>;
  openTool: (tool: ToolType) => void;
  closeTool: (tool?: ToolType) => void;
  toggleTool: (tool: ToolType) => void;
  focusTool: (tool: NonNullable<ToolType>) => void;
  minimizeTool: (tool: NonNullable<ToolType>) => void;
  restoreTool: (tool: NonNullable<ToolType>) => void;
  toggleToolMinimized: (tool: NonNullable<ToolType>) => void;
  toggleMaximizeTool: (tool: NonNullable<ToolType>) => void;
  toggleMultiToolMode: () => void;
  setIsMultiToolMode: (enabled: boolean) => void;
  toggleDock: () => void;
  setIsDockExpanded: (expanded: boolean) => void;
  setIsToolbarHidden: (hidden: boolean) => void;
  toggleToolbarHidden: () => void;
  setWindowMode: (mode: WindowMode) => void;
  setDockAnchor: (anchor: DockAnchor) => void;
  setDockPosition: (pos: DockPosition | null) => void;
}

const FocusToolsContext = createContext<FocusToolsContextType | undefined>(undefined);

interface FocusToolsProviderProps {
  children: React.ReactNode;
  subjectName?: string;
  questTitle?: string;
}

export function FocusToolsProvider({
  children,
  subjectName,
  questTitle,
}: FocusToolsProviderProps) {
  const [openTools, setOpenTools] = useState<NonNullable<ToolType>[]>([]);
  const [minimizedTools, setMinimizedTools] = useState<Record<string, boolean>>({});
  const [maximizedTools, setMaximizedTools] = useState<Record<string, boolean>>({});
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  // Client-side UI state (hydrated safely in useEffect from localStorage)
  const [isMultiToolMode, setIsMultiToolMode] = useState<boolean>(false);
  const [isDockExpanded, setIsDockExpanded] = useState<boolean>(false);
  const [isToolbarHidden, setIsToolbarHidden] = useState<boolean>(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("normal");
  const [dockAnchor, setDockAnchor] = useState<DockAnchor>("bottom-right");
  const [dockPosition, setDockPosition] = useState<DockPosition | null>(null);

  // Restore dock anchor & position preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedAnchor = localStorage.getItem("focus_dock_anchor") as DockAnchor;
      if (savedAnchor) {
        setDockAnchor(savedAnchor);
      }
      const savedPos = localStorage.getItem("focus_dock_pos");
      if (savedPos) {
        setDockPosition(JSON.parse(savedPos));
      }
      const savedHidden = localStorage.getItem("focus_toolbar_hidden");
      if (savedHidden !== null) {
        setIsToolbarHidden(savedHidden === "true");
      }
      const savedMulti = localStorage.getItem("focus_multi_tool_mode");
      if (savedMulti !== null) {
        setIsMultiToolMode(savedMulti === "true");
      }
    } catch {}
  }, []);

  const handleSetDockAnchor = useCallback((anchor: DockAnchor) => {
    setDockAnchor(anchor);
    try {
      localStorage.setItem("focus_dock_anchor", anchor);
    } catch {}
  }, []);

  const handleSetDockPosition = useCallback((pos: DockPosition | null) => {
    setDockPosition(pos);
    try {
      if (pos) {
        localStorage.setItem("focus_dock_pos", JSON.stringify(pos));
      } else {
        localStorage.removeItem("focus_dock_pos");
      }
    } catch {}
  }, []);

  const handleSetIsToolbarHidden = useCallback((hidden: boolean) => {
    setIsToolbarHidden(hidden);
    try {
      localStorage.setItem("focus_toolbar_hidden", String(hidden));
    } catch {}
  }, []);

  const toggleToolbarHidden = useCallback(() => {
    setIsToolbarHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("focus_toolbar_hidden", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleSetIsMultiToolMode = useCallback(
    (enabled: boolean) => {
      setIsMultiToolMode(enabled);
      try {
        localStorage.setItem("focus_multi_tool_mode", String(enabled));
      } catch {}
      if (!enabled) {
        setOpenTools((current) => {
          if (current.length <= 1) return current;
          const keepTool =
            activeTool && current.includes(activeTool)
              ? activeTool
              : current[current.length - 1];
          return keepTool ? [keepTool] : [];
        });
      } else {
        setOpenTools((current) => {
          const maxAllowed = getMaxOpenTools();
          if (current.length > maxAllowed) {
            return current.slice(-maxAllowed);
          }
          return current;
        });
      }
    },
    [activeTool]
  );

  const toggleMultiToolMode = useCallback(() => {
    setIsMultiToolMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("focus_multi_tool_mode", String(next));
      } catch {}
      return next;
    });
    setOpenTools((current) => {
      if (isMultiToolMode) {
        // Toggling from ON to OFF
        if (current.length <= 1) return current;
        const keepTool =
          activeTool && current.includes(activeTool)
            ? activeTool
            : current[current.length - 1];
        return keepTool ? [keepTool] : [];
      } else {
        // Toggling from OFF to ON
        const maxAllowed = getMaxOpenTools();
        if (current.length > maxAllowed) {
          return current.slice(-maxAllowed);
        }
        return current;
      }
    });
  }, [isMultiToolMode, activeTool]);

  const focusTool = useCallback((tool: NonNullable<ToolType>) => {
    setActiveTool(tool);
    setMinimizedTools((prev) => {
      if (prev[tool]) {
        const next = { ...prev };
        delete next[tool];
        return next;
      }
      return prev;
    });
  }, []);

  const minimizeTool = useCallback((tool: NonNullable<ToolType>) => {
    setMinimizedTools((prev) => ({ ...prev, [tool]: true }));
  }, []);

  const restoreTool = useCallback((tool: NonNullable<ToolType>) => {
    setMinimizedTools((prev) => {
      const next = { ...prev };
      delete next[tool];
      return next;
    });
    setActiveTool(tool);
  }, []);

  const toggleToolMinimized = useCallback((tool: NonNullable<ToolType>) => {
    setMinimizedTools((prev) => {
      const isMin = !prev[tool];
      if (!isMin) {
        setActiveTool(tool);
      }
      return { ...prev, [tool]: isMin };
    });
  }, []);

  const toggleMaximizeTool = useCallback((tool: NonNullable<ToolType>) => {
    setMaximizedTools((prev) => ({ ...prev, [tool]: !prev[tool] }));
  }, []);

  const openTool = useCallback(
    (tool: ToolType) => {
      if (!tool) {
        setActiveTool(null);
        setOpenTools([]);
        return;
      }
      setIsToolbarHidden(false);
      setWindowMode("normal");
      setActiveTool(tool);
      setMinimizedTools((prev) => {
        if (prev[tool]) {
          const next = { ...prev };
          delete next[tool];
          return next;
        }
        return prev;
      });
      setOpenTools((prev) => {
        if (isMultiToolMode) {
          if (prev.includes(tool)) return prev;
          const maxAllowed = getMaxOpenTools();
          if (prev.length >= maxAllowed) {
            // Replace the oldest non-active tool
            const targetToRemove = prev.find((t) => t !== activeTool) || prev[0];
            const filtered = prev.filter((t) => t !== targetToRemove);
            return [...filtered, tool];
          }
          return [...prev, tool];
        }
        return [tool];
      });
    },
    [isMultiToolMode, activeTool]
  );

  const closeTool = useCallback((toolToClose?: ToolType | unknown) => {
    let validTool: NonNullable<ToolType> | undefined;
    if (typeof toolToClose === "string") {
      if (toolToClose === "scratchpad") validTool = "notes";
      else if (toolToClose === "audiomixer") validTool = "audio";
      else if (["calculator", "ai", "audio", "notes", "formulas"].includes(toolToClose)) {
        validTool = toolToClose as NonNullable<ToolType>;
      }
    }

    setOpenTools((prev) => {
      const target = validTool || activeTool || (prev.length > 0 ? prev[prev.length - 1] : null);
      if (!target) {
        setActiveTool(null);
        return [];
      }
      const updated = prev.filter((t) => t !== target);
      setActiveTool((curr) => {
        if (curr === target || !curr) {
          return updated.length > 0 ? updated[updated.length - 1] : null;
        }
        return curr;
      });
      return updated;
    });

    if (validTool) {
      setMinimizedTools((prev) => {
        if (prev[validTool]) {
          const next = { ...prev };
          delete next[validTool];
          return next;
        }
        return prev;
      });
      setMaximizedTools((prev) => {
        if (prev[validTool]) {
          const next = { ...prev };
          delete next[validTool];
          return next;
        }
        return prev;
      });
    }
  }, [activeTool]);

  const toggleTool = useCallback(
    (tool: ToolType) => {
      if (!tool) return;
      setIsToolbarHidden(false);
      setWindowMode("normal");

      // If it's currently minimized, restore it
      if (minimizedTools[tool]) {
        restoreTool(tool);
        return;
      }

      setOpenTools((prev) => {
        if (isMultiToolMode) {
          if (prev.includes(tool)) {
            const updated = prev.filter((t) => t !== tool);
            setActiveTool((curr) => (curr === tool ? (updated[updated.length - 1] || null) : curr));
            return updated;
          } else {
            setActiveTool(tool);
            const maxAllowed = getMaxOpenTools();
            if (prev.length >= maxAllowed) {
              const targetToRemove = prev.find((t) => t !== activeTool) || prev[0];
              const filtered = prev.filter((t) => t !== targetToRemove);
              return [...filtered, tool];
            }
            return [...prev, tool];
          }
        } else {
          if (prev.includes(tool)) {
            setActiveTool(null);
            return [];
          } else {
            setActiveTool(tool);
            return [tool];
          }
        }
      });
    },
    [isMultiToolMode, activeTool, minimizedTools, restoreTool]
  );

  const toggleDock = useCallback(() => {
    setIsDockExpanded((prev) => !prev);
  }, []);

  // Global Keyboard Shortcuts (Alt+C, Alt+A, Alt+M, Alt+N, Alt+F, Alt+H, Alt+U, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (isDockExpanded) {
          e.preventDefault();
          setIsDockExpanded(false);
          return;
        }
        if (openTools.length > 0) {
          e.preventDefault();
          closeTool();
          return;
        }
        return;
      }

      // Alt/Option + Key combinations or single letter keys when not in an input
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "c":
            e.preventDefault();
            toggleTool("calculator");
            break;
          case "a":
          case "s":
            e.preventDefault();
            toggleTool("ai");
            break;
          case "m":
            e.preventDefault();
            toggleTool("audio");
            break;
          case "n":
            e.preventDefault();
            toggleTool("notes");
            break;
          case "f":
            e.preventDefault();
            toggleTool("formulas");
            break;
          case "d":
            e.preventDefault();
            toggleDock();
            break;
          case "h":
            e.preventDefault();
            toggleToolbarHidden();
            break;
          case "u":
            e.preventDefault();
            toggleMultiToolMode();
            break;
        }
      } else if (!isInput && !e.ctrlKey && !e.metaKey) {
        // Single key shortcuts when not typing
        if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          toggleTool("calculator");
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleTool("audio");
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          toggleTool("notes");
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          toggleTool("formulas");
        } else if (e.key === "h" || e.key === "H") {
          e.preventDefault();
          toggleToolbarHidden();
        } else if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          toggleMultiToolMode();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openTools, activeTool, isDockExpanded, toggleTool, closeTool, toggleDock, toggleToolbarHidden, toggleMultiToolMode]);

  return (
    <FocusToolsContext.Provider
      value={{
        activeTool,
        openTools,
        isMultiToolMode,
        isDockExpanded,
        isToolbarHidden,
        windowMode,
        dockAnchor,
        dockPosition,
        subjectName,
        questTitle,
        minimizedTools,
        maximizedTools,
        openTool,
        closeTool,
        toggleTool,
        focusTool,
        minimizeTool,
        restoreTool,
        toggleToolMinimized,
        toggleMaximizeTool,
        toggleMultiToolMode,
        setIsMultiToolMode: handleSetIsMultiToolMode,
        toggleDock,
        setIsDockExpanded,
        setIsToolbarHidden: handleSetIsToolbarHidden,
        toggleToolbarHidden,
        setWindowMode,
        setDockAnchor: handleSetDockAnchor,
        setDockPosition: handleSetDockPosition,
      }}
    >
      {children}
    </FocusToolsContext.Provider>
  );
}

export function useFocusTools() {
  const context = useContext(FocusToolsContext);
  if (!context) {
    throw new Error("useFocusTools must be used within a FocusToolsProvider");
  }
  return context;
}
