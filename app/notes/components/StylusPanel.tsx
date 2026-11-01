"use client";
import { useState } from "react";
import {
  stylusActionLabels,
  stylusActions,
  type StylusAction,
  type StylusCapabilities,
  type StylusMapping,
} from "@/lib/notes/stylus";
import CreativePanel from "./CreativePanel";
import s from "../Creative.module.css";
const buttons: {
  key: keyof StylusMapping;
  label: string;
  capability: keyof StylusCapabilities;
  hint: string;
}[] = [
  {
    key: "barrel",
    label: "Side / barrel button",
    capability: "barrelButton",
    hint: "S Pen button, Surface Pen and most Wacom pens. Hold it while writing.",
  },
  {
    key: "eraserEnd",
    label: "Eraser end",
    capability: "eraserEnd",
    hint: "Pens with a physical eraser tip.",
  },
];
export default function StylusPanel({
  mapping,
  capabilities,
  save,
  onClose,
}: {
  mapping: StylusMapping;
  capabilities: StylusCapabilities;
  save: (mapping: StylusMapping) => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(mapping);
  const change = (key: keyof StylusMapping, action: StylusAction) => {
    const next = { ...value, [key]: action };
    setValue(next);
    void save(next);
  };
  return (
    <CreativePanel title="Stylus buttons" onClose={onClose}>
      <p>
        {capabilities.pen
          ? "A pen was detected on this device."
          : "No pen detected yet. Touch the page with your stylus and reopen this panel."}
      </p>
      <div className={s.fields}>
        {buttons.map((button) => (
          <label key={button.key}>
            {button.label}
            <select
              aria-label={button.label}
              value={value[button.key]}
              onChange={(e) =>
                change(button.key, e.target.value as StylusAction)
              }
            >
              {stylusActions.map((action) => (
                <option key={action} value={action}>
                  {stylusActionLabels[action]}
                </option>
              ))}
            </select>
            <small>
              {capabilities[button.capability]
                ? "Detected on this device."
                : button.hint}
            </small>
          </label>
        ))}
      </div>
      <p>
        Pressure {capabilities.pressure ? "detected" : "not detected"} · tilt{" "}
        {capabilities.tilt ? "detected" : "not detected"}.
      </p>
      <p>
        Apple Pencil double-tap and squeeze, and Samsung Air Actions, are
        handled by iPadOS or Android and are not available to web apps, so they
        cannot be customised here. Apple Pencil has no barrel button.
      </p>
    </CreativePanel>
  );
}
