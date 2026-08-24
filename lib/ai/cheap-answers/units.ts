// ============================================================
// Cheap Answers — unit conversion (static factors only)
// ============================================================
// Length, mass and time convert via exact fixed factors; Celsius ↔
// Fahrenheit via formula. Currency and anything with volatile rates
// deliberately escalate to the LLM — never guess.
// ============================================================

interface Unit {
  key: string;
  aliases: string[];
  category: "length" | "mass" | "time";
  /** Value in the category's base unit. */
  factor: number;
}

const UNITS: Unit[] = [
  // Length — base: meters
  { key: "cm", aliases: ["cm", "centimeter", "centimeters", "centimetre", "centimetres"], category: "length", factor: 0.01 },
  { key: "m", aliases: ["m", "meter", "meters", "metre", "metres"], category: "length", factor: 1 },
  { key: "km", aliases: ["km", "kilometer", "kilometers", "kilometre", "kilometres"], category: "length", factor: 1000 },
  { key: "in", aliases: ["in", "inch", "inches"], category: "length", factor: 0.0254 },
  { key: "ft", aliases: ["ft", "foot", "feet"], category: "length", factor: 0.3048 },
  { key: "mi", aliases: ["mi", "mile", "miles"], category: "length", factor: 1609.344 },
  // Mass — base: kilograms
  { key: "g", aliases: ["g", "gram", "grams"], category: "mass", factor: 0.001 },
  { key: "kg", aliases: ["kg", "kilogram", "kilograms"], category: "mass", factor: 1 },
  { key: "lb", aliases: ["lb", "lbs", "pound", "pounds"], category: "mass", factor: 0.45359237 },
  { key: "oz", aliases: ["oz", "ounce", "ounces"], category: "mass", factor: 0.028349523125 },
  // Time — base: minutes
  { key: "min", aliases: ["min", "mins", "minute", "minutes"], category: "time", factor: 1 },
  { key: "hr", aliases: ["hr", "hrs", "hour", "hours"], category: "time", factor: 60 },
  { key: "day", aliases: ["day", "days"], category: "time", factor: 1440 },
  { key: "week", aliases: ["week", "weeks"], category: "time", factor: 10080 },
];

function findUnit(word: string): Unit | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  return UNITS.find((u) => u.aliases.includes(w)) || null;
}

// "convert 5 km to miles" | "how many cm in 2 m" | "5 miles in km"
const CONVERT_RE =
  /^(?:convert\s+)?([\d.]+)\s+([a-z]+)\s+(?:to|in|into)\s+([a-z]+)$/i;
const HOW_MANY_RE =
  /^how many\s+([a-z]+)\s+(?:are\s+)?in\s+([\d.]+)\s+([a-z]+)$/i;

function fmt(n: number): string {
  const rounded = Math.round(n * 1e4) / 1e4;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
}

export function tryUnitConversion(raw: string): string | null {
  // Temperature is formula-based, handled separately below.
  const temp = tryTemperature(raw);
  if (temp !== null) return temp;

  let value: number, from: Unit | null, to: Unit | null;

  let m = raw.trim().match(CONVERT_RE);
  if (m) {
    value = parseFloat(m[1]);
    from = findUnit(m[2]);
    to = findUnit(m[3]);
  } else {
    m = raw.trim().match(HOW_MANY_RE);
    if (!m) return null;
    value = parseFloat(m[2]);
    from = findUnit(m[3]);
    to = findUnit(m[1]);
  }

  if (!Number.isFinite(value) || !from || !to) return null;
  if (from.category !== to.category) return null; // cross-category → LLM
  if (from.key === to.key) return `**${fmt(value)}** ${to.key} (same unit).`;

  const result = (value * from.factor) / to.factor;
  return `**${fmt(result)}** ${to.key}`;
}

const C_TO_F_RE = /^([\d.]+)\s*(?:°?\s*c|celsius|c)\s+(?:to|in)\s+(?:°?\s*f|fahrenheit|f)$/i;
const F_TO_C_RE = /^([\d.]+)\s*(?:°?\s*f|fahrenheit|f)\s+(?:to|in)\s+(?:°?\s*c|celsius|c)$/i;

function tryTemperature(raw: string): string | null {
  let m = raw.trim().match(C_TO_F_RE);
  if (m) {
    const c = parseFloat(m[1]);
    if (!Number.isFinite(c)) return null;
    return `**${fmt(c * 9 / 5 + 32)}** °F`;
  }
  m = raw.trim().match(F_TO_C_RE);
  if (m) {
    const f = parseFloat(m[1]);
    if (!Number.isFinite(f)) return null;
    return `**${fmt((f - 32) * 5 / 9)}** °C`;
  }
  return null;
}
