// ============================================================
// Cheap Answers — curated facts bank
// ============================================================
// A tiny, hand-verified constant table. Only EXACT phrase matches
// are answered — every other factual/definitional question ("what
// does X mean", history, people, etc.) escalates to the LLM. No
// guesses, ever.
// ============================================================

import { normalizeMessage } from "../message-intent";

interface Fact {
  keys: string[]; // normalized, lead-ins already stripped
  answer: string;
}

const FACTS: Fact[] = [
  { keys: ["pi", "value of pi", "what is pi", "whats pi"], answer: "π ≈ **3.14159265**." },
  { keys: ["e", "eulers number", "value of e", "what is e", "whats e"], answer: "e ≈ **2.71828183**." },
  { keys: ["golden ratio", "phi", "what is the golden ratio"], answer: "The golden ratio φ ≈ **1.61803399**." },
  { keys: ["speed of light", "what is the speed of light"], answer: "The speed of light is **299,792,458 m/s** (in a vacuum)." },
  { keys: ["speed of sound", "what is the speed of sound"], answer: "The speed of sound at sea level is ≈ **343 m/s** (~1,235 km/h)." },
  { keys: ["boiling point of water", "what is the boiling point of water"], answer: "Water boils at **100 °C (212 °F)** at sea level." },
  { keys: ["freezing point of water", "what is the freezing point of water"], answer: "Water freezes at **0 °C (32 °F)**." },
  { keys: ["absolute zero", "what is absolute zero"], answer: "Absolute zero is **−273.15 °C (0 K)**." },
  { keys: ["earths radius", "radius of the earth", "earth radius", "what is the radius of the earth"], answer: "Earth's mean radius is ≈ **6,371 km**." },
  { keys: ["earths circumference", "circumference of the earth"], answer: "Earth's circumference is ≈ **40,075 km** (equatorial)." },
  { keys: ["days in a week", "how many days in a week"], answer: "**7** days in a week." },
  { keys: ["days in a year", "how many days in a year"], answer: "**365** days in a common year (366 in a leap year)." },
  { keys: ["hours in a day", "how many hours in a day"], answer: "**24** hours in a day." },
  { keys: ["minutes in an hour", "how many minutes in an hour"], answer: "**60** minutes in an hour." },
  { keys: ["seconds in a minute", "how many seconds in a minute"], answer: "**60** seconds in a minute." },
  { keys: ["weeks in a year", "how many weeks in a year"], answer: "**52** weeks (and 1 day) in a year." },
  { keys: ["months in a year", "how many months in a year"], answer: "**12** months in a year." },
  { keys: ["inches in a foot", "how many inches in a foot"], answer: "**12** inches in a foot." },
  { keys: ["feet in a mile", "how many feet in a mile"], answer: "**5,280** feet in a mile." },
  { keys: ["meters in a kilometer", "how many meters in a kilometer"], answer: "**1,000** meters in a kilometer." },
  { keys: ["grams in a kilogram", "how many grams in a kilogram"], answer: "**1,000** grams in a kilogram." },
  { keys: ["planets in the solar system", "how many planets in the solar system"], answer: "**8** planets in the Solar System." },
  { keys: ["sides of a triangle", "how many sides does a triangle have"], answer: "A triangle has **3** sides." },
  { keys: ["sides of a square", "how many sides does a square have"], answer: "A square has **4** sides." },
];

const KEY_INDEX = new Map<string, Fact>();
for (const fact of FACTS) {
  for (const k of fact.keys) KEY_INDEX.set(k, fact);
}

export function tryFact(raw: string): string | null {
  const normalized = normalizeMessage(raw);
  const fact = KEY_INDEX.get(normalized);
  return fact ? fact.answer : null;
}
