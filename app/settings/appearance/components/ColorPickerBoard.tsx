"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  hexToRgb,
  rgbToHsv,
  hsvToHex,
  normalizeHex,
  isValidHex,
} from "@/lib/color-utils";
import { RotateCcw } from "lucide-react";

interface ColorPickerBoardProps {
  value: string;
  defaultValue: string;
  onChange: (hex: string) => void;
  label: string;
  description?: string;
  recentColors?: string[];
  presets?: { name: string; hex: string }[];
}

export function ColorPickerBoard({
  value,
  defaultValue,
  onChange,
  label,
  description,
  recentColors = [],
  presets = [],
}: ColorPickerBoardProps) {
  const normValue = normalizeHex(value, defaultValue);

  // Maintain internal HSV state for smooth dragging
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>(() => {
    const rgb = hexToRgb(normValue) || { r: 124, g: 58, b: 237 };
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });

  const [hexInput, setHexInput] = useState<string>(normValue.toUpperCase());
  const [isFocusedHex, setIsFocusedHex] = useState(false);
  const [prevValue, setPrevValue] = useState(normValue);

  // Sync internal HSV when external value changes (and user is not typing)
  if (normValue !== prevValue) {
    setPrevValue(normValue);
    if (!isFocusedHex) {
      const rgb = hexToRgb(normValue);
      if (rgb) {
        setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
        setHexInput(normValue.toUpperCase());
      }
    }
  }

  const satValRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const satValRafRef = useRef<number | null>(null);
  const hueRafRef = useRef<number | null>(null);

  // Clean up animation frames on unmount
  useEffect(() => {
    return () => {
      if (satValRafRef.current) cancelAnimationFrame(satValRafRef.current);
      if (hueRafRef.current) cancelAnimationFrame(hueRafRef.current);
    };
  }, []);

  // Handle 2D Saturation / Value board interaction with 60fps RAF throttling
  const updateSatVal = useCallback(
    (clientX: number, clientY: number) => {
      if (!satValRef.current) return;
      if (satValRafRef.current) cancelAnimationFrame(satValRafRef.current);

      satValRafRef.current = requestAnimationFrame(() => {
        if (!satValRef.current) return;
        const rect = satValRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

        const s = (x / rect.width) * 100;
        const v = (1 - y / rect.height) * 100;

        const nextHsv = { h: hsv.h, s, v };
        setHsv(nextHsv);
        const newHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
        setHexInput(newHex.toUpperCase());
        onChange(newHex);
      });
    },
    [hsv.h, onChange]
  );

  const handleSatValPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSatVal(e.clientX, e.clientY);
  };

  const handleSatValPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      updateSatVal(e.clientX, e.clientY);
    }
  };

  const handleSatValPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Handle 1D Hue bar interaction with 60fps RAF throttling
  const updateHue = useCallback(
    (clientX: number) => {
      if (!hueRef.current) return;
      if (hueRafRef.current) cancelAnimationFrame(hueRafRef.current);

      hueRafRef.current = requestAnimationFrame(() => {
        if (!hueRef.current) return;
        const rect = hueRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const h = (x / rect.width) * 360;

        const nextHsv = { ...hsv, h };
        setHsv(nextHsv);
        const newHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
        setHexInput(newHex.toUpperCase());
        onChange(newHex);
      });
    },
    [hsv, onChange]
  );

  const handleHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateHue(e.clientX);
  };

  const handleHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      updateHue(e.clientX);
    }
  };

  const handleHuePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Direct manual HEX entry
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setHexInput(raw);
    const withHash = raw.startsWith("#") ? raw : "#" + raw;
    if (isValidHex(withHash)) {
      const normalized = normalizeHex(withHash);
      const rgb = hexToRgb(normalized);
      if (rgb) {
        setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b, hsv.h));
        onChange(normalized);
      }
    }
  };

  const handleHexBlur = () => {
    setIsFocusedHex(false);
    const withHash = hexInput.startsWith("#") ? hexInput : "#" + hexInput;
    if (isValidHex(withHash)) {
      const normalized = normalizeHex(withHash);
      setHexInput(normalized.toUpperCase());
    } else {
      setHexInput(normValue.toUpperCase());
    }
  };

  const handleReset = () => {
    const resetHex = normalizeHex(defaultValue);
    const rgb = hexToRgb(resetHex);
    if (rgb) {
      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b, hsv.h));
      setHexInput(resetHex.toUpperCase());
      onChange(resetHex);
    }
  };

  // Keyboard navigation for accessible interaction
  const handleSatValKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let deltaS = 0;
    let deltaV = 0;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") deltaS = -step;
    else if (e.key === "ArrowRight") deltaS = step;
    else if (e.key === "ArrowUp") deltaV = step;
    else if (e.key === "ArrowDown") deltaV = -step;
    else return;

    e.preventDefault();
    const nextS = Math.max(0, Math.min(100, hsv.s + deltaS));
    const nextV = Math.max(0, Math.min(100, hsv.v + deltaV));
    const nextHsv = { ...hsv, s: nextS, v: nextV };
    setHsv(nextHsv);
    const newHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
    setHexInput(newHex.toUpperCase());
    onChange(newHex);
  };

  const handleHueKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let deltaH = 0;
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") deltaH = -step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") deltaH = step;
    else return;

    e.preventDefault();
    const nextH = (hsv.h + deltaH + 360) % 360;
    const nextHsv = { ...hsv, h: nextH };
    setHsv(nextHsv);
    const newHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
    setHexInput(newHex.toUpperCase());
    onChange(newHex);
  };

  const pureHueHex = hsvToHex(hsv.h, 100, 100);

  return (
    <div className="relative overflow-hidden flex flex-col gap-4 p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] backdrop-blur-xl shadow-lg transition-all">
      {/* Top subtle highlight */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--accent-primary-dim)] to-transparent opacity-60 pointer-events-none"
        aria-hidden="true"
      />

      {/* Header with Title and Reset */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold font-['Rajdhani'] uppercase tracking-wider text-[var(--text-primary)]">
            {label}
          </h3>
          {description && (
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed font-sans">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary-dim)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shrink-0 cursor-pointer shadow-xs"
          title="Reset to default color"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* 2D Saturation / Value Board: Multi-layered architecture with pure black base */}
      <div
        ref={satValRef}
        tabIndex={0}
        onPointerDown={handleSatValPointerDown}
        onPointerMove={handleSatValPointerMove}
        onPointerUp={handleSatValPointerUp}
        onKeyDown={handleSatValKeyDown}
        className="relative w-full h-44 sm:h-48 rounded-xl cursor-crosshair select-none touch-none shadow-inner border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] bg-black"
        aria-label={`${label} saturation and brightness board`}
        role="slider"
        aria-valuenow={Math.round(hsv.v)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`Saturation ${Math.round(hsv.s)}%, Brightness ${Math.round(hsv.v)}%`}
      >
        {/* Isolated gradient canvas layer with internal clipping */}
        <div className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none">
          {/* Base pure hue layer */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: pureHueHex }}
          />
          {/* Horizontal white saturation gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, #ffffff 0%, rgba(255, 255, 255, 0) 100%)",
            }}
          />
          {/* Vertical black brightness gradient with seamless 0% anchor */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #000000 0%, #000000 0.5%, rgba(0, 0, 0, 0) 100%)",
            }}
          />
        </div>

        {/* Thumb indicator — padded coordinate mapping to ensure full edge visibility without clipping */}
        <div
          className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.9),0_2px_8px_rgba(0,0,0,0.6)] pointer-events-none transition-transform"
          style={{
            left: `calc(10px + ${(Math.max(0, Math.min(100, hsv.s)) / 100)} * (100% - 20px))`,
            top: `calc(10px + ${(1 - Math.max(0, Math.min(100, hsv.v)) / 100)} * (100% - 20px))`,
            backgroundColor: normValue,
          }}
        />
      </div>

      {/* 1D Hue Spectrum Slider */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] font-['Rajdhani']">
          Hue Spectrum
        </label>
        <div
          ref={hueRef}
          tabIndex={0}
          onPointerDown={handleHuePointerDown}
          onPointerMove={handleHuePointerMove}
          onPointerUp={handleHuePointerUp}
          onKeyDown={handleHueKeyDown}
          className="relative w-full h-7 rounded-lg cursor-pointer select-none touch-none shadow-inner border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] bg-black"
          aria-label={`${label} hue slider`}
          role="slider"
          aria-valuenow={Math.round(hsv.h)}
          aria-valuemin={0}
          aria-valuemax={360}
        >
          {/* Continuous gradient spectrum layer */}
          <div
            className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
            }}
          />

          {/* Hue Thumb indicator — mapped so it never gets cut off at 0° or 360° */}
          <div
            className="absolute top-0 bottom-0 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.8)] pointer-events-none"
            style={{
              left: `calc(7px + ${(Math.max(0, Math.min(360, hsv.h)) / 360)} * (100% - 14px))`,
              backgroundColor: pureHueHex,
            }}
          />
        </div>
      </div>

      {/* Controls Bar: Current Swatch + HEX Input */}
      <div className="flex items-center gap-3 pt-1">
        {/* Visible preview swatch */}
        <div className="relative group shrink-0">
          <div
            className="w-11 h-11 rounded-xl border border-[var(--border-subtle)] shadow-sm transition-transform group-hover:scale-105"
            style={{ backgroundColor: normValue }}
            title={`Active Color: ${normValue}`}
          />
        </div>

        {/* HEX Input */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[var(--text-muted)] pointer-events-none">
            HEX
          </span>
          <input
            type="text"
            value={hexInput}
            onChange={handleHexChange}
            onFocus={() => setIsFocusedHex(true)}
            onBlur={handleHexBlur}
            maxLength={7}
            placeholder="#000000"
            className="w-full pl-12 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] bg-[var(--surface-2,var(--bg-shadow))] text-[var(--text-primary)] font-mono text-sm font-semibold uppercase tracking-wider outline-none transition-all shadow-inner"
            aria-label={`${label} hex code`}
          />
        </div>
      </div>

      {/* Curated Presets / Quick-picks if provided */}
      {presets.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]/50">
          <span className="text-xs uppercase tracking-wider font-semibold text-[var(--text-muted)] font-['Rajdhani']">
            Curated Swatches
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => {
              const isSelected = normValue.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    const norm = normalizeHex(preset.hex);
                    const rgb = hexToRgb(norm);
                    if (rgb) {
                      setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b, hsv.h));
                      setHexInput(norm.toUpperCase());
                      onChange(norm);
                    }
                  }}
                  className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] text-[var(--text-primary)] font-bold ring-1 ring-[var(--accent-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-2,var(--bg-shadow))] hover:border-[var(--accent-primary-mid)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                  title={`${preset.name} (${preset.hex})`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0 shadow-xs"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Colors if provided */}
      {recentColors.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-mono text-[var(--text-muted)] shrink-0 font-['Rajdhani'] uppercase tracking-wider">
            Recent:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {recentColors.map((color, idx) => (
              <button
                key={`${color}-${idx}`}
                type="button"
                onClick={() => {
                  const norm = normalizeHex(color);
                  const rgb = hexToRgb(norm);
                  if (rgb) {
                    setHsv(rgbToHsv(rgb.r, rgb.g, rgb.b, hsv.h));
                    setHexInput(norm.toUpperCase());
                    onChange(norm);
                  }
                }}
                className="w-6 h-6 rounded-md border border-[var(--border-subtle)] hover:scale-110 hover:border-white transition-all cursor-pointer shrink-0 shadow-xs"
                style={{ backgroundColor: color }}
                title={`Recent color: ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
