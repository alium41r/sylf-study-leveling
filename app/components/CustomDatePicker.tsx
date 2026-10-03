"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";

export interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string | null; // YYYY-MM-DD
  maxDate?: string | null; // YYYY-MM-DD
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  direction?: "up" | "down" | "auto";
  compact?: boolean;
  className?: string;
  triggerClassName?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDateStr(str: string): { year: number; month: number; day: number } | null {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

function formatDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function CustomDatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Select deadline date...",
  disabled = false,
  align = "left",
  direction = "auto",
  compact = false,
  className = "",
  triggerClassName = "",
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Parse current value or initialize to today
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  }, [today]);

  // Effective minDate: if undefined, default to todayStr; if explicitly null/empty, allow all
  const effectiveMin = minDate !== undefined ? minDate : todayStr;

  const parsedValue = useMemo(() => parseDateStr(value), [value]);

  // View state: which month/year is currently being viewed
  const [viewYear, setViewYear] = useState(() => parsedValue?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedValue?.month ?? today.getMonth());

  // Sync view when value changes from outside
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [value, parsedValue]);

  // Dynamic vertical orientation check (flip up if near bottom of viewport or scroll parent)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();

      // Find nearest scrollable or constrained container (e.g. modal)
      let scrollParent: HTMLElement | null = containerRef.current.parentElement;
      while (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
        const style = window.getComputedStyle(scrollParent);
        const overflow = (style.overflowY || "") + (style.overflow || "");
        if (/(auto|scroll|hidden)/.test(overflow)) {
          break;
        }
        scrollParent = scrollParent.parentElement;
      }

      let limitBottom = window.innerHeight;
      let limitTop = 0;
      if (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
        const parentRect = scrollParent.getBoundingClientRect();
        limitBottom = Math.min(limitBottom, parentRect.bottom);
        limitTop = Math.max(limitTop, parentRect.top);
      }

      const spaceBelow = limitBottom - rect.bottom;
      const spaceAbove = rect.top - limitTop;
      if (spaceBelow < 330 && spaceAbove > spaceBelow) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }

      const timer = setTimeout(() => {
        if (popoverRef.current) {
          popoverRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Navigation
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar matrix calculation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      month: number;
      year: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // Helper for disabled check
    const checkDisabled = (dateStr: string) => {
      const isBeforeMin = Boolean(effectiveMin && dateStr < effectiveMin);
      const isAfterMax = Boolean(maxDate && dateStr > maxDate);
      return isBeforeMin || isAfterMax;
    };

    // Prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = formatDateStr(y, m, d);
      cells.push({
        day: d,
        month: m,
        year: y,
        dateStr,
        isCurrentMonth: false,
        isDisabled: checkDisabled(dateStr),
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateStr(viewYear, viewMonth, d);
      cells.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        dateStr,
        isCurrentMonth: true,
        isDisabled: checkDisabled(dateStr),
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Next month padding to fill full 35 or 42 grid
    const remaining = 42 - cells.length;
    if (remaining < 7 || cells.length <= 35) {
      const padCount = cells.length <= 35 ? 35 - cells.length : 42 - cells.length;
      for (let d = 1; d <= padCount; d++) {
        const m = viewMonth === 11 ? 0 : viewMonth + 1;
        const y = viewMonth === 11 ? viewYear + 1 : viewYear;
        const dateStr = formatDateStr(y, m, d);
        cells.push({
          day: d,
          month: m,
          year: y,
          dateStr,
          isCurrentMonth: false,
          isDisabled: checkDisabled(dateStr),
          isSelected: dateStr === value,
          isToday: dateStr === todayStr,
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth, effectiveMin, maxDate, value, todayStr]);

  const handleSelectDate = (dateStr: string, cellDisabled: boolean) => {
    if (cellDisabled) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  // Human readable display of selected value
  const displayLabel = useMemo(() => {
    if (!parsedValue) return "";
    try {
      const d = new Date(parsedValue.year, parsedValue.month, parsedValue.day);
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    } catch {
      return value;
    }
  }, [parsedValue, value]);

  const isUp = direction === "up" || (direction !== "down" && openUpwards);
  const verticalClass = isUp ? "bottom-full mb-2" : "top-full mt-2";
  const horizontalClass = align === "right" ? "right-0" : "left-0";

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {/* Input Trigger Field */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full text-left flex items-center justify-between transition-all focus:outline-none cursor-pointer ${
          compact
            ? "rounded-lg px-2.5 py-1.5 text-xs"
            : "rounded-xl px-3.5 py-2.5 text-xs"
        } ${
          disabled
            ? "opacity-50 cursor-not-allowed bg-bg-void/50 border border-border-subtle"
            : isOpen
            ? "border border-accent-primary shadow-[0_0_12px_var(--accent-primary-dim)] bg-bg-void"
            : "border border-border-subtle hover:border-border-active bg-bg-void"
        } ${triggerClassName}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarIcon className="w-4 h-4 text-accent-text-light shrink-0" />
          {displayLabel ? (
            <span className="font-['Rajdhani'] font-bold text-text-primary truncate">
              {displayLabel}
            </span>
          ) : (
            <span className="font-['Rajdhani'] text-text-muted truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="p-1 rounded-md hover:bg-white/10 dark:hover:bg-white/10 text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
              title="Clear date"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-bg-abyss border border-border-subtle text-accent-text-light">
            {value ? "Selected" : "Pick Date"}
          </span>
        </div>
      </button>

      {/* Popover Calendar */}
      {isOpen && !disabled && (
        <div
          ref={popoverRef}
          className={`absolute ${horizontalClass} ${verticalClass} w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150`}
          style={{
            background: "var(--bg-abyss, #0d1117)",
            borderColor: "var(--border-subtle)",
            boxShadow: "0 16px 36px rgba(0, 0, 0, 0.5), 0 0 20px var(--accent-primary-dim, rgba(124, 58, 237, 0.15))",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          {/* Month / Year Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors focus:outline-none cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold font-['Rajdhani'] tracking-wider text-text-primary uppercase">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors focus:outline-none cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {DAY_LABELS.map((d) => (
              <span
                key={d}
                className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted py-1"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, idx) => {
              let cellStyle =
                "h-8 sm:h-9 text-xs font-['Rajdhani'] font-bold rounded-lg flex items-center justify-center transition-all cursor-pointer ";

              if (cell.isSelected) {
                cellStyle +=
                  "bg-accent-primary text-white shadow-[0_0_12px_var(--accent-primary)] scale-105 z-10";
              } else if (cell.isDisabled) {
                cellStyle += "text-text-muted/30 cursor-not-allowed";
              } else if (!cell.isCurrentMonth) {
                cellStyle += "text-text-muted/50 hover:bg-white/5 hover:text-text-primary";
              } else if (cell.isToday) {
                cellStyle +=
                  "border border-accent-primary/60 text-accent-text-light hover:bg-accent-primary/20";
              } else {
                cellStyle += "text-text-primary hover:bg-white/10 hover:text-accent-primary-light";
              }

              return (
                <button
                  key={`${cell.dateStr}-${idx}`}
                  type="button"
                  disabled={cell.isDisabled}
                  onClick={() => handleSelectDate(cell.dateStr, cell.isDisabled)}
                  className={cellStyle}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-border-subtle text-[11px] font-['Rajdhani'] font-bold">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const checkDisabled = Boolean(
                    (effectiveMin && todayStr < effectiveMin) || (maxDate && todayStr > maxDate)
                  );
                  handleSelectDate(todayStr, checkDisabled);
                }}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="Select Today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  const str = formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
                  handleSelectDate(str, false);
                }}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                +1 Wk
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + 1);
                  const str = formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
                  handleSelectDate(str, false);
                }}
                className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                +1 Mo
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {value && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2 py-1 rounded-md hover:bg-rose-500/20 text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded-md bg-accent-primary-dim hover:bg-accent-primary-mid text-accent-text-light transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
