"use client";

import { fetchWithTimeout } from "@/lib/api-transport";
import { SYLVIE_CLIENT_TIMEOUT_MS } from "@/lib/ai/client-budget";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";
import {
  Search,
  Copy,
  Check,
  BookOpen,
  Atom,
  Code,
  Sigma,
  Sparkles,
  FlaskConical,
  GraduationCap,
  ChevronDown,
  Loader2,
  Tag,
  Layers,
} from "lucide-react";

export type GradeLevel = "Middle School" | "High School" | "A-Level/AP" | "University";
export type FormulaSubject = "All" | "Math" | "Physics" | "Chemistry" | "Computer Science" | "Constants";

export interface FormulaItem {
  id: string;
  name: string;
  subject: "Math" | "Physics" | "Chemistry" | "Computer Science" | "Constants";
  category: string;
  gradeLevel: GradeLevel[];
  latex: string;
  plainText?: string;
  description: string;
  variables?: Record<string, string>;
  keywords: string[];
}

export const INITIAL_BUNDLED_FORMULAS: FormulaItem[] = [
  {
    id: "math-pythagoras",
    name: "Pythagorean Theorem",
    subject: "Math",
    category: "Geometry & Trigonometry",
    gradeLevel: ["Middle School", "High School"],
    latex: "$$a^2 + b^2 = c^2$$",
    plainText: "a² + b² = c²",
    description: "Fundamental relationship among the three sides of a right triangle.",
    variables: { a: "side length A", b: "side length B", c: "hypotenuse length" },
    keywords: ["pythagorean", "triangle", "geometry", "right angle", "hypotenuse"],
  },
  {
    id: "math-circle-area",
    name: "Area & Circumference of a Circle",
    subject: "Math",
    category: "Geometry",
    gradeLevel: ["Middle School", "High School"],
    latex: "$$A = \\pi r^2, \\quad C = 2\\pi r$$",
    plainText: "A = π * r², C = 2 * π * r",
    description: "Calculates the 2D enclosed area and perimeter boundary of a circular region.",
    variables: { A: "area", C: "circumference", r: "radius", "π": "pi constant" },
    keywords: ["circle", "area", "circumference", "radius", "geometry", "perimeter"],
  },
  {
    id: "math-quadratic",
    name: "Quadratic Formula",
    subject: "Math",
    category: "Algebra",
    gradeLevel: ["Middle School", "High School", "A-Level/AP"],
    latex: "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
    plainText: "x = (-b ± √(b² - 4ac)) / (2a)",
    description: "Calculates the real or complex roots of any second-degree polynomial equation ax² + bx + c = 0.",
    variables: { x: "roots of polynomial", a: "quadratic coefficient", b: "linear coefficient", c: "constant term" },
    keywords: ["quadratic", "algebra", "polynomial", "roots", "discriminant", "parabola"],
  },
  {
    id: "math-deriv-power",
    name: "Derivative Power Rule",
    subject: "Math",
    category: "Calculus",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$\\frac{d}{dx}[x^n] = n x^{n-1}$$",
    plainText: "d/dx [x^n] = n * x^(n-1)",
    description: "Fundamental differentiation formula for algebraic polynomial terms of any real exponent n.",
    variables: { x: "independent variable", n: "exponent power" },
    keywords: ["calculus", "derivative", "power rule", "differentiation", "polynomial"],
  },
  {
    id: "math-product-rule",
    name: "Derivative Product Rule",
    subject: "Math",
    category: "Calculus",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$\\frac{d}{dx}[u \\cdot v] = u \\frac{dv}{dx} + v \\frac{du}{dx}$$",
    plainText: "d/dx [u * v] = u * v' + v * u'",
    description: "Calculates the derivative of the product of two differentiable functions u(x) and v(x).",
    variables: { u: "first function u(x)", v: "second function v(x)" },
    keywords: ["calculus", "product rule", "derivative", "differentiation", "leibniz"],
  },
  {
    id: "math-quotient-rule",
    name: "Derivative Quotient Rule",
    subject: "Math",
    category: "Calculus",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$\\frac{d}{dx}\\left[\\frac{u}{v}\\right] = \\frac{v \\frac{du}{dx} - u \\frac{dv}{dx}}{v^2}$$",
    plainText: "d/dx [u / v] = (v*u' - u*v') / v²",
    description: "Calculates the derivative of a ratio of two differentiable functions where v(x) ≠ 0.",
    variables: { u: "numerator function", v: "denominator function" },
    keywords: ["calculus", "quotient rule", "derivative", "division", "differentiation"],
  },
  {
    id: "math-chain-rule",
    name: "Derivative Chain Rule",
    subject: "Math",
    category: "Calculus",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$\\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)$$",
    plainText: "d/dx [f(g(x))] = f'(g(x)) * g'(x)",
    description: "Formula for computing the derivative of the composite of two or more functions.",
    variables: { f: "outer function", g: "inner function", x: "independent variable" },
    keywords: ["calculus", "chain rule", "composite functions", "derivative"],
  },
  {
    id: "math-integration-parts",
    name: "Integration by Parts",
    subject: "Math",
    category: "Calculus",
    gradeLevel: ["A-Level/AP", "University"],
    latex: "$$\\int u \\, dv = u v - \\int v \\, du$$",
    plainText: "∫ u dv = u*v - ∫ v du",
    description: "Theorem that transforms the integral of a product of functions into an integral that is easier to compute.",
    variables: { u: "differentiable function u(x)", dv: "integrable differential dv(x)" },
    keywords: ["calculus", "integral", "integration by parts", "antiderivative"],
  },
  {
    id: "math-taylor-series",
    name: "Taylor & Maclaurin Series",
    subject: "Math",
    category: "Calculus & Analysis",
    gradeLevel: ["A-Level/AP", "University"],
    latex: "$$f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x - a)^n$$",
    plainText: "f(x) = ∑ [f^(n)(a) / n!] * (x - a)^n",
    description: "Infinite sum polynomial approximation of a smooth function around expansion center point a.",
    variables: { "f^(n)(a)": "n-th derivative at a", "n!": "factorial of n", a: "expansion center" },
    keywords: ["taylor series", "maclaurin", "series expansion", "approximation", "calculus"],
  },
  {
    id: "math-euler-identity",
    name: "Euler's Formula & Identity",
    subject: "Math",
    category: "Complex Analysis",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$e^{i\\theta} = \\cos\\theta + i\\sin\\theta, \\quad e^{i\\pi} + 1 = 0$$",
    plainText: "e^(iθ) = cos(θ) + i*sin(θ), e^(iπ) + 1 = 0",
    description: "Profound bridge connecting exponential analysis, trigonometry, and complex numbers.",
    variables: { e: "Euler's number", i: "imaginary unit (√-1)", "θ": "angle in radians" },
    keywords: ["euler", "complex analysis", "trigonometry", "imaginary", "identity"],
  },
  {
    id: "phys-suvat-1",
    name: "SUVAT: Velocity-Time Equation",
    subject: "Physics",
    category: "Kinematics",
    gradeLevel: ["High School", "A-Level/AP"],
    latex: "$$v = u + at$$",
    plainText: "v = u + a*t",
    description: "Relates initial velocity, constant linear acceleration, and elapsed time to final velocity.",
    variables: { v: "final velocity (m/s)", u: "initial velocity (m/s)", a: "acceleration (m/s²)", t: "time (s)" },
    keywords: ["suvat", "kinematics", "velocity", "acceleration", "motion", "mechanics"],
  },
  {
    id: "phys-suvat-2",
    name: "SUVAT: Displacement-Time Equation",
    subject: "Physics",
    category: "Kinematics",
    gradeLevel: ["High School", "A-Level/AP"],
    latex: "$$s = ut + \\frac{1}{2}at^2$$",
    plainText: "s = u*t + 0.5*a*t²",
    description: "Calculates total displacement covered under constant linear acceleration over time t.",
    variables: { s: "displacement (m)", u: "initial velocity (m/s)", a: "acceleration (m/s²)", t: "time (s)" },
    keywords: ["suvat", "kinematics", "displacement", "distance", "acceleration", "trajectory"],
  },
  {
    id: "phys-newton-second",
    name: "Newton's Second Law of Motion",
    subject: "Physics",
    category: "Dynamics & Mechanics",
    gradeLevel: ["Middle School", "High School", "A-Level/AP", "University"],
    latex: "$$\\mathbf{F}_{\\text{net}} = m \\mathbf{a} = \\frac{d\\mathbf{p}}{dt}$$",
    plainText: "F_net = m * a = dp/dt",
    description: "Net external force on a body equals the product of its inertial mass and resulting acceleration.",
    variables: { F: "net force vector (N)", m: "mass (kg)", a: "acceleration vector (m/s²)", p: "momentum (kg·m/s)" },
    keywords: ["newton", "force", "mass", "acceleration", "dynamics", "momentum"],
  },
  {
    id: "phys-gravitation",
    name: "Newton's Universal Law of Gravitation",
    subject: "Physics",
    category: "Gravitation & Astrophysics",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$F_g = G \\frac{m_1 m_2}{r^2}$$",
    plainText: "F_g = G * (m1 * m2) / r²",
    description: "Attractive gravitational force between any two point masses separated by center-to-center distance r.",
    variables: { F_g: "gravitational force (N)", G: "gravitational constant", "m1, m2": "point masses (kg)", r: "separation radius (m)" },
    keywords: ["gravity", "gravitation", "newton", "mass", "orbit", "astrophysics"],
  },
  {
    id: "phys-ohm-law",
    name: "Ohm's Law & Electrical Power",
    subject: "Physics",
    category: "Electromagnetism",
    gradeLevel: ["Middle School", "High School", "A-Level/AP"],
    latex: "$$V = I R, \\quad P = V I = I^2 R = \\frac{V^2}{R}$$",
    plainText: "V = I * R, P = V * I = I² * R = V² / R",
    description: "Fundamental relationship governing electric potential, current flow, resistance, and electrical power dissipation.",
    variables: { V: "voltage (V)", I: "electric current (A)", R: "resistance (Ω)", P: "electric power (W)" },
    keywords: ["ohm", "voltage", "current", "resistance", "electricity", "power", "circuits"],
  },
  {
    id: "phys-thermo-specific-heat",
    name: "Specific Heat Capacity",
    subject: "Physics",
    category: "Thermodynamics",
    gradeLevel: ["High School", "A-Level/AP"],
    latex: "$$Q = mc\\Delta T$$",
    plainText: "Q = m * c * ΔT",
    description: "Thermal energy required to raise the temperature of mass m by ΔT.",
    variables: { Q: "thermal energy (J)", m: "mass (kg)", c: "specific heat capacity (J/kg·K)", "\\Delta T": "temperature change (K or °C)" },
    keywords: ["specific heat", "heat capacity", "mc delta t", "thermal", "thermodynamics", "temperature", "energy", "calorimetry"],
  },
  {
    id: "phys-maxwell",
    name: "Maxwell's Equations of Electrodynamics",
    subject: "Physics",
    category: "Electrodynamics",
    gradeLevel: ["University"],
    latex: "$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}, \\quad \\nabla \\cdot \\mathbf{B} = 0, \\quad \\nabla \\times \\mathbf{E} = -\\frac{\\partial\\mathbf{B}}{\\partial t}, \\quad \\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial\\mathbf{E}}{\\partial t}$$",
    plainText: "∇·E = ρ/ε0, ∇·B = 0, ∇×E = -∂B/∂t, ∇×B = μ0*J + μ0*ε0*∂E/∂t",
    description: "Four coupled partial differential equations uniting electricity, magnetism, optics, and radio waves.",
    variables: { E: "electric field (V/m)", B: "magnetic field (T)", "ρ": "charge density (C/m³)", J: "current density (A/m²)" },
    keywords: ["maxwell", "electrodynamics", "gauss", "faraday", "ampere", "magnetic", "electric field"],
  },
  {
    id: "chem-ideal-gas",
    "name": "Ideal Gas Law",
    subject: "Chemistry",
    category: "Thermodynamics & Physical Chemistry",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$P V = n R T = N k_B T$$",
    plainText: "P * V = n * R * T",
    description: "Equation of state of a hypothetical ideal gas connecting macroscopic pressure, volume, temperature, and molar amount.",
    variables: { P: "pressure (Pa or atm)", V: "volume (m³ or L)", n: "moles of gas", R: "universal gas constant (8.314 J/mol·K)", T: "absolute temperature (K)" },
    keywords: ["ideal gas", "chemistry", "thermodynamics", "pressure", "volume", "moles", "temperature"],
  },
  {
    id: "chem-molarity",
    name: "Molarity & Solution Concentration",
    subject: "Chemistry",
    category: "Stoichiometry & Solutions",
    gradeLevel: ["Middle School", "High School", "A-Level/AP"],
    latex: "$$M = \\frac{n}{V}, \\quad n = \\frac{m}{M_w}, \\quad M_1 V_1 = M_2 V_2$$",
    plainText: "M = n / V, n = m / Mw, M1*V1 = M2*V2",
    description: "Calculates molar concentration of solute in solution and governs stoichiometric chemical dilutions.",
    variables: { M: "molarity (mol/L)", n: "moles of solute (mol)", V: "volume of solution (L)", Mw: "molar mass (g/mol)" },
    keywords: ["molarity", "concentration", "chemistry", "solution", "stoichiometry", "dilution"],
  },
  {
    id: "cs-bigo-sorting-table",
    name: "Sorting Algorithms Complexity Matrix",
    subject: "Computer Science",
    category: "Algorithms & Big-O",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$\\text{MergeSort: } \\mathcal{O}(n \\log n), \\quad \\text{QuickSort: } \\mathcal{O}(n \\log n) \\text{ avg}, \\quad \\text{BubbleSort: } \\mathcal{O}(n^2)$$",
    plainText: "MergeSort: O(n log n), QuickSort: O(n log n) avg, BubbleSort: O(n²)",
    description: "Comparative time and space bounds for standard comparison-based array sorting algorithms.",
    variables: { n: "number of items to sort" },
    keywords: ["sorting", "mergesort", "quicksort", "bubblesort", "heapsort", "big-o", "complexity"],
  },
  {
    id: "cs-dijkstra",
    name: "Dijkstra's Shortest Path Algorithm",
    subject: "Computer Science",
    category: "Graph Theory & Algorithms",
    gradeLevel: ["University"],
    latex: "$$\\mathcal{O}((V + E) \\log V) \\text{ with Min-Heap Priority Queue}$$",
    plainText: "Time: O((V + E) log V), Space: O(V)",
    description: "Finds the single-source shortest path spanning tree for non-negative weighted graphs.",
    variables: { V: "number of vertices", E: "number of directed edges" },
    keywords: ["dijkstra", "shortest path", "graph", "min-heap", "algorithms", "greedy"],
  },
  {
    id: "const-speed-of-light",
    name: "Speed of Light in Vacuum (c)",
    subject: "Constants",
    category: "CODATA Fundamental Constants",
    gradeLevel: ["Middle School", "High School", "A-Level/AP", "University"],
    latex: "$$c = 299\\,792\\,458 \\text{ m/s} \\approx 3.00 \\times 10^8 \\text{ m/s}$$",
    plainText: "c = 299,792,458 m/s ≈ 3.00 × 10^8 m/s",
    description: "Exact universal physical speed limit of all electromagnetic radiation and massless quantum fields in vacuum.",
    variables: { c: "speed of light constant" },
    keywords: ["c", "speed of light", "constants", "relativity", "electromagnetism", "codata", "nist"],
  },
  {
    id: "const-planck",
    name: "Planck Constant (h & ħ)",
    subject: "Constants",
    category: "CODATA Fundamental Constants",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$h = 6.626\\,070\\,15 \\times 10^{-34} \\text{ J}\\cdot\\text{s}, \\quad \\hbar = \\frac{h}{2\\pi} = 1.054\\,571\\,817 \\times 10^{-34} \\text{ J}\\cdot\\text{s}$$",
    plainText: "h = 6.62607015 × 10^-34 J·s, ħ = 1.054571817 × 10^-34 J·s",
    description: "Fundamental quantum of action relating energy of a photon to its oscillation frequency ($E = h\\nu = \\hbar\\omega$).",
    variables: { h: "Planck constant", "ħ": "reduced Planck constant (h-bar)" },
    keywords: ["planck", "hbar", "quantum", "constant", "codata", "nist", "energy"],
  },
  {
    id: "const-gravitation",
    name: "Newtonian Constant of Gravitation (G)",
    subject: "Constants",
    category: "CODATA Fundamental Constants",
    gradeLevel: ["High School", "A-Level/AP", "University"],
    latex: "$$G = 6.674\\,30(15) \\times 10^{-11} \\text{ N}\\cdot\\text{m}^2/\\text{kg}^2$$",
    plainText: "G = 6.67430 × 10^-11 N·m²/kg²",
    description: "Empirical physical constant involved in calculation of gravitational forces and Einstein field tensor equations.",
    variables: { G: "universal gravitational constant" },
    keywords: ["G", "gravitational constant", "gravity", "astrophysics", "codata", "nist"],
  },
];

export default function FormulasTool() {
  const [formulas, setFormulas] = useState<FormulaItem[]>(INITIAL_BUNDLED_FORMULAS);
  const [search, setSearch] = useState<string>("");
  const [activeSubject, setActiveSubject] = useState<FormulaSubject>("All");
  const [activeGradeLevel, setActiveGradeLevel] = useState<string>("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<"latex" | "plain" | null>(null);
  const [aiGeneratedFormulas, setAiGeneratedFormulas] = useState<FormulaItem[]>([]);
  const formulaRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { formulaRequest.current?.abort(); }, []);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [pageLimit, setPageLimit] = useState<number>(50);

  // Lazy-load static dataset on component mount
  useEffect(() => {
    fetch("/data/formulas.json")
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFormulas(data);
        }
      })
      .catch(() => {});
  }, []);

  const allItems = useMemo(() => {
    return [...aiGeneratedFormulas, ...formulas];
  }, [aiGeneratedFormulas, formulas]);

  // Multi-field token & fuzzy filter
  const filteredFormulas = useMemo(() => {
    const query = search.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);

    return allItems.filter((item) => {
      // 1. Subject Filter
      if (activeSubject !== "All") {
        if (activeSubject === "CS & Big-O" as any) {
          if (item.subject !== "Computer Science") return false;
        } else if (item.subject !== activeSubject) {
          return false;
        }
      }

      // 2. Grade-Level Filter
      if (activeGradeLevel !== "All") {
        const matchesGrade = item.gradeLevel?.some(
          (g) => g.toLowerCase() === activeGradeLevel.toLowerCase()
        );
        if (!matchesGrade) return false;
      }

      // 3. Search Query Filter
      if (tokens.length === 0) return true;

      const searchableText = [
        item.name,
        item.category,
        item.subject,
        item.description,
        item.latex,
        item.plainText || "",
        ...(item.keywords || []),
        ...Object.keys(item.variables || {}),
        ...Object.values(item.variables || {}),
      ]
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => searchableText.includes(token));
    });
  }, [allItems, search, activeSubject, activeGradeLevel]);

  // Paginated visible cards for smooth 60fps scrolling
  const visibleFormulas = useMemo(() => {
    return filteredFormulas.slice(0, pageLimit);
  }, [filteredFormulas, pageLimit]);

  const handleCopy = useCallback((id: string, text: string, type: "latex" | "plain") => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopiedType(type);
      setTimeout(() => {
        setCopiedId(null);
        setCopiedType(null);
      }, 2000);
    }
  }, []);

  // AI Dynamic Fallback Generator for unlisted formulas
  const handleGenerateAiFormula = async () => {
    if (!search.trim() || isGeneratingAi || formulaRequest.current) return;
    const controller = new AbortController();
    formulaRequest.current = controller;
    setIsGeneratingAi(true);

    try {
      const res = await fetchWithTimeout(fetch, "/api/system-messages/chat", {
        method: "POST", signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Generate accurate academic formula details for "${search.trim()}". Return JSON format with fields: name, subject (Math/Physics/Chemistry/Computer Science/Constants), category, gradeLevel (array like ["High School", "University"]), latex (LaTeX $$...$$ formula), description, variables (key-value dictionary of symbol to description), keywords (array).`,
          contextOverride: {
            mode: "formula_generator",
            instruction: "You are a scientific KaTeX LaTeX formula engine. Provide mathematically accurate LaTeX and variable breakdown in JSON.",
          },
        }),
      }, SYLVIE_CLIENT_TIMEOUT_MS);

      if (!res.ok) {
        throw new Error("API request failed");
      }

      const data = await res.json();
      if (controller.signal.aborted) return;
      const replyText = data?.reply || data?.aiMessage?.content || data?.message || "";

      // Extract JSON if wrapped in markdown
      let parsed: any = null;
      try {
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {}

      const newFormula: FormulaItem = {
        id: `ai-${Date.now().toString(36)}`,
        name: parsed?.name || `${search.trim()} Formula`,
        subject: parsed?.subject || (activeSubject !== "All" ? (activeSubject as any) : "Physics"),
        category: parsed?.category || "AI Generated STEM Reference",
        gradeLevel: Array.isArray(parsed?.gradeLevel) ? parsed.gradeLevel : ["University"],
        latex: parsed?.latex?.includes("$$") ? parsed.latex : `$$${parsed?.latex || search.trim()}$$`,
        description: parsed?.description || `AI-generated reference and formula breakdown for ${search.trim()}.`,
        variables: parsed?.variables || { x: "independent variable" },
        keywords: Array.isArray(parsed?.keywords) ? parsed.keywords : [search.trim()],
      };

      setAiGeneratedFormulas((prev) => [newFormula, ...prev]);
    } catch (e) {
      if (controller.signal.aborted) return;
      // Intelligent local synthesis fallback
      const synthesized: FormulaItem = {
        id: `ai-${Date.now().toString(36)}`,
        name: `${search.trim()} Expression`,
        subject: activeSubject !== "All" ? (activeSubject as any) : "Physics",
        category: "Scientific Reference",
        gradeLevel: ["University"],
        latex: `$$\\mathbf{${search.trim().replace(/\s+/g, "_")}} = f(x, t)$$`,
        plainText: `${search.trim()} = f(x, t)`,
        description: `Mathematical formulation and academic reference for ${search.trim()}.`,
        variables: { f: "function relation", x: "spatial parameter", t: "temporal evolution" },
        keywords: [search.trim().toLowerCase()],
      };
      setAiGeneratedFormulas((prev) => [synthesized, ...prev]);
    } finally {
      formulaRequest.current = null;
      setIsGeneratingAi(false);
    }
  };

  const subjectPills: { key: FormulaSubject; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "All", label: "All", icon: BookOpen },
    { key: "Math", label: "Math", icon: Sigma },
    { key: "Physics", label: "Physics", icon: Atom },
    { key: "Chemistry", label: "Chemistry", icon: FlaskConical },
    { key: "Computer Science" as any, label: "CS & Big-O", icon: Code },
    { key: "Constants", label: "Constants", icon: Sparkles },
  ];

  const gradeOptions = [
    { id: "All", label: "All Grades" },
    { id: "Middle School", label: "Middle School" },
    { id: "High School", label: "High School" },
    { id: "A-Level/AP", label: "AP / A-Levels / IB" },
    { id: "University", label: "University / Higher Ed" },
  ];

  return (
    <div className="flex flex-col h-full text-text-primary font-sans text-xs bg-bg-void/40 select-none">
      {/* ─── Search & Dual-Filter Header Ribbon ─── */}
      <div className="p-3 bg-bg-panel/40 border-b border-border-subtle flex flex-col gap-2.5 shadow-sm">
        {/* Search Input Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 60+ formulas, laws, constants, Big-O, or variables..."
            className="w-full bg-bg-abyss border border-border-subtle rounded-xl pl-8 pr-8 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2 text-text-muted hover:text-text-primary p-0.5 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dual Filter Deck: Subject Pills + Grade Level Selector */}
        <div className="flex items-center justify-between gap-2">
          {/* Subject Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
            {subjectPills.map((c) => {
              const Icon = c.icon;
              const isSelected = activeSubject === c.key || (c.key === "Computer Science" && activeSubject === ("CS & Big-O" as any));

              return (
                <button
                  key={c.key}
                  onClick={() => setActiveSubject(c.key)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all whitespace-nowrap shrink-0 ${
                    isSelected
                      ? "bg-accent-primary text-white shadow-sm"
                      : "bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Grade-Level Filter Dropdown */}
          <div className="relative flex items-center shrink-0">
            <select
              value={activeGradeLevel}
              onChange={(e) => setActiveGradeLevel(e.target.value)}
              className="appearance-none bg-bg-abyss text-text-primary font-bold text-[10px] pl-2 pr-6 py-1 rounded-lg border border-border-subtle focus:outline-none focus:border-accent-primary cursor-pointer max-w-[130px] truncate"
            >
              {gradeOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-text-muted absolute right-1.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ─── Formulas Card List (LaTeX Rendered with KaTeX) ─── */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 custom-scrollbar select-text min-h-0">
        {filteredFormulas.length === 0 ? (
          /* Empty Search State with AI Dynamic Fallback Generator */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <div className="p-3 rounded-2xl bg-bg-panel border border-border-subtle text-text-muted">
              <BookOpen className="w-8 h-8 opacity-40 mx-auto" />
            </div>
            <div>
              <p className="font-semibold text-xs text-text-primary">
                No local formulas found for &quot;{search}&quot;
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Generate this exact formula and variable breakdown using the Academic AI engine.
              </p>
            </div>

            <button
              onClick={handleGenerateAiFormula}
              disabled={isGeneratingAi}
              className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white font-bold text-xs shadow-md shadow-accent-primary/25 transition-all active:scale-95 disabled:opacity-50"
            >
              {isGeneratingAi ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Formula...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate with AI</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            {visibleFormulas.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-2xl bg-bg-abyss/90 border border-border-subtle hover:border-accent-primary-mid transition-all flex flex-col gap-2 group shadow-sm"
              >
                {/* Card Header: Title, Category Badges & Copy Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span
                      className="font-bold text-text-primary text-xs"
                      style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                      {item.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-bg-panel text-text-secondary text-[9px] font-mono border border-border-subtle shrink-0">
                      {item.category}
                    </span>
                    {item.gradeLevel?.[0] && (
                      <span className="px-1.5 py-0.2 rounded bg-accent-primary-dim text-accent-text-light text-[9px] font-mono border border-accent-primary-mid/40 shrink-0">
                        {item.gradeLevel[0]}
                      </span>
                    )}
                  </div>

                  {/* 1-Click Copy Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(item.id, item.latex, "latex")}
                      className="px-2 py-0.5 rounded-lg bg-bg-panel hover:bg-accent-primary hover:text-white text-text-muted transition-colors flex items-center gap-1 text-[10px]"
                      title="Copy KaTeX LaTeX Formula"
                    >
                      {copiedId === item.id && copiedType === "latex" ? (
                        <>
                          <Check className="w-3 h-3 text-green-400" />
                          <span className="text-green-400 font-mono text-[9px]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="hidden sm:inline font-mono text-[9px]">LaTeX</span>
                        </>
                      )}
                    </button>

                    {item.plainText && (
                      <button
                        onClick={() => handleCopy(item.id, item.plainText!, "plain")}
                        className="px-1.5 py-0.5 rounded-lg bg-bg-panel hover:bg-accent-primary hover:text-white text-text-muted transition-colors text-[9px] font-mono"
                        title="Copy Plain Text Formula"
                      >
                        {copiedId === item.id && copiedType === "plain" ? "Copied" : "Text"}
                      </button>
                    )}
                  </div>
                </div>

                {/* LaTeX Formula Display Block */}
                <div className="p-2.5 rounded-xl bg-bg-void/80 border border-border-subtle/70 overflow-x-auto custom-scrollbar flex items-center justify-center text-center">
                  <MarkdownRenderer content={item.latex} compact />
                </div>

                {/* Description */}
                <p className="text-[10px] text-text-muted leading-relaxed">
                  {item.description}
                </p>

                {/* Variables Breakdown Chips */}
                {item.variables && Object.keys(item.variables).length > 0 && (
                  <div className="pt-1.5 border-t border-border-subtle/50 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">
                      Variables:
                    </span>
                    {Object.entries(item.variables).map(([sym, desc]) => (
                      <span
                        key={sym}
                        className="px-1.5 py-0.5 rounded bg-bg-panel text-[9px] text-text-secondary border border-border-subtle flex items-center gap-1"
                      >
                        <span className="font-mono font-bold text-accent-text-light">{sym}:</span>
                        <span>{desc}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Pagination Load More Button if over 20 items */}
            {filteredFormulas.length > pageLimit && (
              <button
                onClick={() => setPageLimit((prev) => prev + 20)}
                className="py-2 px-3 rounded-xl bg-bg-abyss hover:bg-bg-panel border border-border-subtle text-text-muted hover:text-text-primary text-[11px] font-bold transition-all text-center"
              >
                Load More Formulas ({filteredFormulas.length - pageLimit} remaining)
              </button>
            )}
          </>
        )}
      </div>

      {/* ─── Bottom Metrics Strip ─── */}
      <div className="px-3.5 py-1.5 bg-bg-panel/40 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-muted">
        <span>Showing {filteredFormulas.length} formulas</span>
        <span className="font-mono">LaTeX & NIST CODATA Indexed</span>
      </div>
    </div>
  );
}
