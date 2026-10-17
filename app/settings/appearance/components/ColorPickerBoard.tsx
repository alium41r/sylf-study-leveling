"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  hexToRgb,
  rgbToHsv,
  hsvToHex,
  normalizeHex,
  isValidHex,
} from "@/lib/color-utils";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { getAccentForeground } from "@/lib/color-utils";
import styles from "./AppearanceSettingsScreen.module.css";

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
  const [expanded, setExpanded] = useState(false);
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
    <div className={styles.colorPicker}>
      <div className={styles.colorHeading}>
        <div>
          <h2>{label}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleReset}
          aria-label={`Reset ${label}`}
          title={`Reset ${label}`}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className={styles.swatches} aria-label={`${label} presets`}>
        {presets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            aria-label={preset.name}
            title={preset.name}
            aria-pressed={normValue.toLowerCase() === preset.hex.toLowerCase()}
            onClick={() => onChange(normalizeHex(preset.hex))}
            style={{
              background: preset.hex,
              color: getAccentForeground(preset.hex),
            }}
          >
            {normValue.toLowerCase() === preset.hex.toLowerCase() && (
              <Check size={16} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <div className={styles.hexRow}>
        <span
          className={styles.currentSwatch}
          style={{ background: normValue }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          onFocus={() => setIsFocusedHex(true)}
          onBlur={handleHexBlur}
          maxLength={7}
          aria-label={`${label} hex code`}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={`Custom ${label}`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Custom
        </button>
      </div>
      {expanded && (
        <div className={styles.customPicker}>
          <div
            ref={satValRef}
            tabIndex={0}
            onPointerDown={handleSatValPointerDown}
            onPointerMove={handleSatValPointerMove}
            onPointerUp={handleSatValPointerUp}
            onKeyDown={handleSatValKeyDown}
            className={styles.saturation}
            aria-label={`${label} saturation and brightness board`}
            role="slider"
            aria-valuenow={Math.round(hsv.v)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`Saturation ${Math.round(hsv.s)}%, Brightness ${Math.round(hsv.v)}%`}
          >
            <div
              className={styles.gradientClip}
              aria-hidden="true"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${pureHueHex}`,
              }}
            />
            <span
              className={styles.colorThumb}
              style={{
                left: `calc(10px + ${hsv.s / 100} * (100% - 20px))`,
                top: `calc(10px + ${1 - hsv.v / 100} * (100% - 20px))`,
                background: normValue,
              }}
            />
          </div>
          <div
            ref={hueRef}
            tabIndex={0}
            onPointerDown={handleHuePointerDown}
            onPointerMove={handleHuePointerMove}
            onPointerUp={handleHuePointerUp}
            onKeyDown={handleHueKeyDown}
            className={styles.hue}
            aria-label={`${label} hue slider`}
            role="slider"
            aria-valuenow={Math.round(hsv.h)}
            aria-valuemin={0}
            aria-valuemax={360}
          >
            <span
              style={{
                left: `calc(7px + ${hsv.h / 360} * (100% - 14px))`,
                background: pureHueHex,
              }}
            />
          </div>
          <p className={styles.pickerHint}>
            Arrow keys adjust color. Hold Shift for larger steps.
          </p>
        </div>
      )}
      {recentColors.length > 0 && (
        <div className={styles.recents}>
          <span>Recent</span>
          {recentColors.map((color, i) => (
            <button
              key={`${color}-${i}`}
              type="button"
              aria-label={`Recent ${label} ${color}`}
              title={color}
              style={{ background: color }}
              onClick={() => onChange(normalizeHex(color))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
