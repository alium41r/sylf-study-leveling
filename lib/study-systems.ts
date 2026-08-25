// ============================================================
// Study Systems — single source of truth for exam boards, academic
// levels and subject accent colors. Consumed by BOTH the onboarding
// subject intake and the timer page's "Add Subject" form so every
// surface offers the exact same options (and the AI syllabus
// dissection always sees the same metadata vocabulary).
// ============================================================

export interface StudySystemOption {
  value: string;
  label: string;
}

// Exam boards across international, Pakistani and Indian systems.
export const EXAM_BOARDS: StudySystemOption[] = [
  { value: "CAIE", label: "CAIE — Cambridge International" },
  { value: "Edexcel", label: "Edexcel (Pearson)" },
  { value: "Oxford AQA International", label: "Oxford AQA International" },
  { value: "AQA", label: "AQA (UK)" },
  { value: "OCR", label: "OCR (UK)" },
  { value: "WJEC/Eduqas", label: "WJEC / Eduqas (Wales)" },
  { value: "CCEA", label: "CCEA (Northern Ireland)" },
  { value: "AP", label: "AP (College Board)" },
  { value: "IB", label: "IB (International Baccalaureate)" },
  { value: "FBISE", label: "FBISE — Federal Board (Pakistan)" },
  { value: "BISE Punjab", label: "BISE Punjab (Lahore)" },
  { value: "BISE Sindh", label: "BISE Sindh (Karachi)" },
  { value: "BISE KPK", label: "BISE KPK (Peshawar)" },
  { value: "BISE Balochistan", label: "BISE Balochistan (Quetta)" },
  { value: "AKU-EB", label: "AKU-EB (Aga Khan University)" },
  { value: "CBSE", label: "CBSE (India)" },
  { value: "CISCE", label: "CISCE — ICSE / ISC (India)" },
  { value: "NIOS", label: "NIOS (India — Open Schooling)" },
  { value: "State Board", label: "State Board (India)" },
  { value: "University", label: "University" },
  { value: "Other", label: "Other" },
];

// Academic levels spanning international, Pakistani (Matric/Intermediate)
// and Indian (Middle/Secondary/Senior Secondary) systems.
export const ACADEMIC_LEVELS: StudySystemOption[] = [
  { value: "A-Level", label: "A-Level" },
  { value: "AS-Level", label: "AS-Level" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "GCSE", label: "GCSE" },
  { value: "O-Level", label: "O-Level" },
  { value: "AP", label: "AP (Advanced Placement)" },
  { value: "IB HL", label: "IB Higher Level (HL)" },
  { value: "IB SL", label: "IB Standard Level (SL)" },
  { value: "Middle School", label: "Middle School (Class 6-8)" },
  { value: "Matric / SSC", label: "Matriculation / SSC (Class 9-10)" },
  { value: "Intermediate / HSSC", label: "Intermediate / HSSC (Class 11-12)" },
  { value: "High School", label: "High School" },
  { value: "University", label: "Undergraduate" },
  { value: "Other", label: "Other" },
];

// Subject accent colors (violet, cyan, pink, emerald, amber, blue, red, indigo).
export const ACCENT_COLORS = [
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
  "#10B981",
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#6366F1",
];

// Defaults for a brand-new custom subject.
export const DEFAULT_EXAM_BOARD = "CAIE";
export const DEFAULT_ACADEMIC_LEVEL = "A-Level";
export const DEFAULT_SUBJECT_COLOR = ACCENT_COLORS[0];
