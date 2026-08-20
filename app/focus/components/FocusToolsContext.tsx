"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ToolType = "calculator" | "ai" | "audio" | "notes" | "formulas" | null;
export type WindowMode = "normal" | "minimized";
export type DockAnchor = "bottom-right" | "bottom-center" | "bottom-left" | "right" | "left" | "top-right" | "top-left";

export interface DockPosition {
  x: number;
  y: number;
}

interface FocusToolsContextType {
  activeTool: ToolType;
  isDockExpanded: boolean;
  windowMode: WindowMode;
  dockAnchor: DockAnchor;
  dockPosition: DockPosition | null;
  subjectName?: string;
  questTitle?: string;
  openTool: (tool: ToolType) => void;
  closeTool: () => void;
  toggleTool: (tool: ToolType) => void;
  toggleDock: () => void;
  setIsDockExpanded: (expanded: boolean) => void;
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
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const [isDockExpanded, setIsDockExpanded] = useState<boolean>(false);
  const [windowMode, setWindowMode] = useState<WindowMode>("normal");
  const [dockAnchor, setDockAnchor] = useState<DockAnchor>("bottom-right");
  const [dockPosition, setDockPosition] = useState<DockPosition | null>(null);

  // Restore dock anchor preference from localStorage on mount
  useEffect(() => {
    try {
      const savedAnchor = localStorage.getItem("focus_dock_anchor") as DockAnchor;
      if (savedAnchor) {
        setDockAnchor(savedAnchor);
      }
    } catch {}
  }, []);

  const handleSetDockAnchor = useCallback((anchor: DockAnchor) => {
    setDockAnchor(anchor);
    try {
      localStorage.setItem("focus_dock_anchor", anchor);
    } catch {}
  }, []);

  const openTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setWindowMode("normal");
  }, []);

  const closeTool = useCallback(() => {
    setActiveTool(null);
  }, []);

  const toggleTool = useCallback((tool: ToolType) => {
    setActiveTool((current) => (current === tool ? null : tool));
    setWindowMode("normal");
  }, []);

  const toggleDock = useCallback(() => {
    setIsDockExpanded((prev) => !prev);
  }, []);

  // Global Keyboard Shortcuts (Alt+C, Alt+A, Alt+M, Alt+N, Alt+F, Escape)
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
        if (activeTool !== null) {
          e.preventDefault();
          closeTool();
        } else if (isDockExpanded) {
          e.preventDefault();
          setIsDockExpanded(false);
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
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, isDockExpanded, toggleTool, closeTool, toggleDock]);

  return (
    <FocusToolsContext.Provider
      value={{
        activeTool,
        isDockExpanded,
        windowMode,
        dockAnchor,
        dockPosition,
        subjectName,
        questTitle,
        openTool,
        closeTool,
        toggleTool,
        toggleDock,
        setIsDockExpanded,
        setWindowMode,
        setDockAnchor: handleSetDockAnchor,
        setDockPosition,
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
