// Sylf's checked syllabus catalog: topic lists the planner can trust without asking a model. Each entry follows the published specification's topic
// order and uses plain names a student recognises. Key points are written as things a student can check they can do. When a request matches an entry,
// planning needs no model call for the topic list, and none of the topics can come from the wrong paper. Content is data; matching is pure.
//
// Sources: Cambridge International AS & A Level Mathematics 9709 syllabus for examination from 2020 (topics 1.1–6.5) and Physics 9702 syllabus for
// examination from 2022 (AS topics 1–11, A Level topics 12–25), with paper lengths and marks from the same documents. Extend this file by adding
// entries to a family (or a family); the matcher and the planner need no change.
import { anchorTerms, matchScore, normalizeSyllabus, syllabusTerms, type StoredSyllabus, type Syllabus } from "../kernel";

export interface Entry {
  id: string;
  board: "CAIE";
  code: string;
  /** Entries with the same group share one topic list (Physics Papers 1 and 2), so naming both does not list every topic twice. */
  group?: string;
  /** Component number as students say it: "1" for Paper 1. */
  component: string;
  name: string;
  short: string;
  paper: { label: string; minutes: number; marks: number };
  /** Extra phrases that name this paper, e.g. "pure 1", "mechanics". */
  aliases: RegExp[];
  units: { title: string; weight: 1 | 2 | 3; difficulty: 1 | 2 | 3; points: string[] }[];
}

const ENTRIES: Entry[] = [
  {
    id: "caie-9709-p1", board: "CAIE", code: "9709", component: "1", name: "Cambridge International AS & A Level Mathematics (9709), Paper 1: Pure Mathematics 1", short: "Pure Mathematics 1",
    paper: { label: "Paper 1", minutes: 110, marks: 75 }, aliases: [/\bpure\s*(?:math(?:s|ematics)?\s*)?(?:1|one|i)\b/i, /\bp1\b/i],
    units: [
      { title: "Quadratics", weight: 2, difficulty: 1, points: ["Complete the square and read off the vertex and line of symmetry", "Use the discriminant b² − 4ac for two, one or no real roots", "Solve quadratic inequalities with a sketch", "Solve a linear and a quadratic equation simultaneously", "Solve equations that are quadratic in a function of x, e.g. in x² or √x", "Use the discriminant for a line that is tangent to a curve"] },
      { title: "Functions", weight: 2, difficulty: 2, points: ["Domain, range and whether a function is one-one", "Composite functions fg(x) and their domains", "Find an inverse function and state its domain", "Sketch a function and its inverse as reflections in y = x", "Transformations y = f(x) + a, f(x + a), af(x), f(ax) and combinations"] },
      { title: "Coordinate geometry", weight: 2, difficulty: 2, points: ["Equation of a line from a point and gradient or two points", "Parallel and perpendicular gradients, midpoints and distances", "Equation of a circle (x − a)² + (y − b)² = r², and its expanded form", "Find the centre and radius by completing the square", "Tangent to a circle is perpendicular to the radius", "Intersections of lines, curves and circles"] },
      { title: "Circular measure", weight: 1, difficulty: 1, points: ["Convert between radians and degrees", "Arc length s = rθ", "Sector area A = ½r²θ", "Areas of segments and shaded regions combining triangles and sectors"] },
      { title: "Trigonometry", weight: 2, difficulty: 2, points: ["Graphs of sin, cos and tan in degrees and radians", "Exact values for 30°, 45°, 60° and related angles", "Principal values of sin⁻¹, cos⁻¹ and tan⁻¹", "Identities tan θ ≡ sin θ / cos θ and sin²θ + cos²θ ≡ 1", "Prove identities and solve equations in a given interval"] },
      { title: "Series", weight: 2, difficulty: 2, points: ["Binomial expansion of (a + b)ⁿ for positive integer n", "Find a given term or coefficient in an expansion", "Arithmetic progressions: nth term and sum of n terms", "Geometric progressions: nth term and sum of n terms", "Sum to infinity and the condition |r| < 1"] },
      { title: "Differentiation", weight: 3, difficulty: 2, points: ["Differentiate xⁿ for rational n, sums and constant multiples", "Chain rule for composite functions", "Gradients, tangents and normals", "Increasing and decreasing functions", "Stationary points and their nature with the second derivative", "Connected rates of change"] },
      { title: "Integration", weight: 3, difficulty: 3, points: ["Integrate (ax + b)ⁿ for n ≠ −1, sums and constant multiples", "Find a curve's equation from dy/dx and a point", "Evaluate definite integrals", "Area under a curve and between a curve and a line", "Volumes of revolution about the x- or y-axis", "Simple improper integrals"] },
    ],
  },
  {
    id: "caie-9709-p2", board: "CAIE", code: "9709", component: "2", name: "Cambridge International AS Level Mathematics (9709), Paper 2: Pure Mathematics 2", short: "Pure Mathematics 2",
    paper: { label: "Paper 2", minutes: 75, marks: 50 }, aliases: [/\bpure\s*(?:math(?:s|ematics)?\s*)?(?:2|two|ii)\b/i, /\bp2\b/i],
    units: [
      { title: "Algebra", weight: 2, difficulty: 2, points: ["Modulus: sketch y = |ax + b| and solve modulus equations and inequalities", "Divide a polynomial by a linear or quadratic factor", "Factor theorem and remainder theorem"] },
      { title: "Logarithms and exponentials", weight: 2, difficulty: 2, points: ["Laws of logarithms and change of base", "Solve aˣ = b and equations in eˣ and ln x", "Graphs of eˣ and ln x", "Turn y = axⁿ or y = abˣ into a straight-line graph"] },
      { title: "Trigonometry", weight: 2, difficulty: 3, points: ["sec, cosec and cot and their identities", "Compound angle formulae sin(A ± B), cos(A ± B), tan(A ± B)", "Double angle formulae", "Express a sin θ + b cos θ as R sin(θ ± α) or R cos(θ ± α)"] },
      { title: "Differentiation", weight: 2, difficulty: 2, points: ["Derivatives of eˣ, ln x, sin x, cos x, tan x", "Product and quotient rules", "Parametric differentiation", "Implicit differentiation"] },
      { title: "Integration", weight: 2, difficulty: 2, points: ["Integrate eᵃˣ⁺ᵇ, 1/(ax + b), sin, cos and sec²", "Use trigonometric identities to integrate", "Trapezium rule and whether it over- or under-estimates"] },
      { title: "Numerical solution of equations", weight: 1, difficulty: 2, points: ["Locate a root by a change of sign", "Iteration xₙ₊₁ = F(xₙ) to a given accuracy", "Rearrange an equation into an iterative form"] },
    ],
  },
  {
    id: "caie-9709-p3", board: "CAIE", code: "9709", component: "3", name: "Cambridge International A Level Mathematics (9709), Paper 3: Pure Mathematics 3", short: "Pure Mathematics 3",
    paper: { label: "Paper 3", minutes: 110, marks: 75 }, aliases: [/\bpure\s*(?:math(?:s|ematics)?\s*)?(?:3|three|iii)\b/i, /\bp3\b/i],
    units: [
      { title: "Algebra", weight: 2, difficulty: 2, points: ["Modulus equations and inequalities", "Polynomial division, factor and remainder theorems", "Partial fractions, including repeated and quadratic factors", "Binomial expansion of (1 + x)ⁿ for rational n and when it is valid"] },
      { title: "Logarithms and exponentials", weight: 2, difficulty: 2, points: ["Laws of logarithms and solving exponential equations", "Equations and inequalities in eˣ and ln x", "Linear graphs from y = axⁿ and y = abˣ"] },
      { title: "Trigonometry", weight: 2, difficulty: 3, points: ["sec, cosec and cot and their identities", "Compound and double angle formulae", "R sin(θ ± α) and R cos(θ ± α), with maximum and minimum values", "Prove identities and solve equations"] },
      { title: "Differentiation", weight: 2, difficulty: 2, points: ["Derivatives of exponential, log and trig functions", "Product and quotient rules", "Parametric and implicit differentiation", "Tangents, normals and stationary points from these"] },
      { title: "Integration", weight: 3, difficulty: 3, points: ["Standard integrals, including using trig identities", "Integration using partial fractions", "Integration by substitution", "Integration by parts", "Trapezium rule"] },
      { title: "Numerical solution of equations", weight: 1, difficulty: 2, points: ["Change of sign to locate a root", "Iteration xₙ₊₁ = F(xₙ) and convergence", "Show a root lies in an interval"] },
      { title: "Vectors", weight: 2, difficulty: 3, points: ["Vector equation of a line r = a + tb", "Whether two lines are parallel, intersect or are skew", "Scalar product and the angle between two lines", "Perpendicular distance from a point to a line"] },
      { title: "Differential equations", weight: 2, difficulty: 3, points: ["Form a differential equation from a description", "Solve by separating variables", "Use initial conditions to find a particular solution", "Interpret the solution in context"] },
      { title: "Complex numbers", weight: 2, difficulty: 3, points: ["Arithmetic with complex numbers and conjugates", "Modulus and argument, and the Argand diagram", "Square roots and roots of polynomials with real coefficients", "Loci on an Argand diagram: |z − a| = r, arg(z − a) = θ, |z − a| = |z − b|"] },
    ],
  },
  {
    id: "caie-9709-p4", board: "CAIE", code: "9709", component: "4", name: "Cambridge International AS & A Level Mathematics (9709), Paper 4: Mechanics", short: "Mechanics",
    paper: { label: "Paper 4", minutes: 75, marks: 50 }, aliases: [/\bmechanics\b/i, /\bm1\b/i],
    units: [
      { title: "Forces and equilibrium", weight: 3, difficulty: 2, points: ["Resolve forces into components", "Equilibrium of a particle under coplanar forces", "Friction: F ≤ μR and limiting friction", "Forces on inclined planes", "Newton's third law and normal reaction"] },
      { title: "Kinematics", weight: 2, difficulty: 2, points: ["Displacement, velocity and acceleration graphs", "Constant acceleration equations (suvat)", "Variable acceleration using calculus", "Area under a velocity–time graph"] },
      { title: "Momentum", weight: 1, difficulty: 1, points: ["Momentum = mv", "Conservation of momentum in direct collisions", "Particles that coalesce"] },
      { title: "Newton's laws of motion", weight: 3, difficulty: 3, points: ["F = ma for a particle, including on slopes", "Connected particles over a pulley or in a line", "Tension and thrust", "Motion with friction"] },
      { title: "Energy, work and power", weight: 2, difficulty: 2, points: ["Work done by a force, including at an angle", "Kinetic and gravitational potential energy", "Work–energy principle with resistances", "Power = Fv and problems with a driving force"] },
    ],
  },
  {
    id: "caie-9709-p5", board: "CAIE", code: "9709", component: "5", name: "Cambridge International AS & A Level Mathematics (9709), Paper 5: Probability & Statistics 1", short: "Probability & Statistics 1",
    paper: { label: "Paper 5", minutes: 75, marks: 50 }, aliases: [/\b(?:prob(?:ability)?\s*(?:&|and)?\s*)?stat(?:s|istics)?\s*(?:1|one|i)\b/i, /\bs1\b/i],
    units: [
      { title: "Representation of data", weight: 2, difficulty: 1, points: ["Stem-and-leaf diagrams, box plots, histograms and cumulative frequency graphs", "Median, quartiles and interquartile range", "Mean and standard deviation from raw and grouped data", "Use Σx and Σx² or coded sums", "Choose and compare measures of average and spread"] },
      { title: "Permutations and combinations", weight: 2, difficulty: 3, points: ["Arrangements with repeated letters", "Arrangements with conditions: together, apart, at the ends", "Selections using combinations", "Selections with restrictions"] },
      { title: "Probability", weight: 2, difficulty: 2, points: ["Tree diagrams and the addition and multiplication rules", "Mutually exclusive and independent events", "Conditional probability P(A | B)", "Venn diagrams and two-way tables"] },
      { title: "Discrete random variables", weight: 2, difficulty: 2, points: ["Probability distribution tables", "Expectation and variance of a discrete variable", "The binomial distribution, its mean and variance", "The geometric distribution and its mean"] },
      { title: "The normal distribution", weight: 3, difficulty: 2, points: ["Standardise with z = (x − μ)/σ and use tables", "Find μ or σ from given probabilities", "Normal approximation to the binomial with continuity correction", "Recognise when the approximation is valid"] },
    ],
  },
  {
    id: "caie-9709-p6", board: "CAIE", code: "9709", component: "6", name: "Cambridge International A Level Mathematics (9709), Paper 6: Probability & Statistics 2", short: "Probability & Statistics 2",
    paper: { label: "Paper 6", minutes: 75, marks: 50 }, aliases: [/\b(?:prob(?:ability)?\s*(?:&|and)?\s*)?stat(?:s|istics)?\s*(?:2|two|ii)\b/i, /\bs2\b/i],
    units: [
      { title: "The Poisson distribution", weight: 2, difficulty: 2, points: ["Conditions for a Poisson model", "Probabilities, mean and variance", "Poisson approximation to the binomial", "Normal approximation to the Poisson"] },
      { title: "Linear combinations of random variables", weight: 2, difficulty: 2, points: ["E(aX + b) and Var(aX + b)", "E and Var of aX ± bY for independent variables", "Sums of independent normal and Poisson variables"] },
      { title: "Continuous random variables", weight: 2, difficulty: 3, points: ["Probability density functions and their properties", "Probabilities by integration", "Mean, variance and median", "Find a constant in a pdf"] },
      { title: "Sampling and estimation", weight: 2, difficulty: 2, points: ["Random sampling and why it matters", "Distribution of the sample mean and the Central Limit Theorem", "Unbiased estimates of mean and variance", "Confidence intervals for a mean and a proportion"] },
      { title: "Hypothesis tests", weight: 3, difficulty: 3, points: ["Null and alternative hypotheses, one- and two-tailed", "Tests for a binomial or Poisson parameter", "Tests for a normal mean", "Critical regions and significance levels", "Type I and Type II errors"] },
    ],
  },
];


const PHYSICS_AS: Entry["units"] = [
  { title: "Physical quantities and units", weight: 1, difficulty: 1, points: ["SI base units and checking an equation is homogeneous", "Sensible estimates of physical quantities", "Add and resolve vectors", "Systematic and random errors, precision and accuracy", "Combine uncertainties in a result"] },
  { title: "Kinematics", weight: 2, difficulty: 2, points: ["Equations of motion for constant acceleration", "Displacement–time and velocity–time graphs: gradients and areas", "Projectile motion with independent horizontal and vertical motion", "Free fall and measuring g"] },
  { title: "Dynamics", weight: 2, difficulty: 2, points: ["Momentum and Newton's laws, F = Δp/Δt", "Weight, mass and resultant force F = ma", "Drag and terminal velocity", "Conservation of momentum in collisions and explosions", "Elastic collisions: relative speed of approach equals separation"] },
  { title: "Forces, density and pressure", weight: 2, difficulty: 2, points: ["Moments, couples and torque", "Equilibrium and the principle of moments", "Centre of gravity", "Density, pressure and Δp = ρgΔh", "Upthrust from pressure difference"] },
  { title: "Work, energy and power", weight: 2, difficulty: 2, points: ["Work done W = Fs cos θ and conservation of energy", "Kinetic energy ½mv² and ΔEp = mgΔh", "Power P = W/t and P = Fv", "Efficiency"] },
  { title: "Deformation of solids", weight: 1, difficulty: 2, points: ["Hooke's law and the spring constant", "Stress, strain and the Young modulus", "Elastic and plastic deformation", "Elastic potential energy from the area under a force–extension graph"] },
  { title: "Waves", weight: 2, difficulty: 2, points: ["Amplitude, phase difference, frequency and v = fλ", "Transverse and longitudinal waves", "Intensity is proportional to amplitude squared", "Doppler effect for sound", "The electromagnetic spectrum and polarisation (Malus's law)"] },
  { title: "Superposition", weight: 2, difficulty: 3, points: ["Stationary waves: nodes, antinodes and wavelength", "Diffraction and two-source interference", "Double slit λ = ax/D", "Diffraction grating d sin θ = nλ"] },
  { title: "Electricity", weight: 2, difficulty: 2, points: ["Current I = Q/t and I = Anvq", "Potential difference, power P = VI = I²R", "Resistance and resistivity R = ρL/A", "I–V characteristics of a resistor, filament lamp and diode", "Thermistors and light-dependent resistors"] },
  { title: "D.C. circuits", weight: 2, difficulty: 3, points: ["Electromotive force and internal resistance", "Kirchhoff's first and second laws", "Resistors in series and parallel", "Potential dividers and potentiometers"] },
  { title: "Particle physics", weight: 2, difficulty: 2, points: ["Alpha-particle scattering and the nuclear atom", "Nuclide notation, isotopes and conservation in decays", "Alpha, beta and gamma radiation and their properties", "Quarks, hadrons and leptons; quark make-up of protons and neutrons", "Beta decay in terms of quarks"] },
];

const PHYSICS: Entry[] = [
  { id: "caie-9702-p1", board: "CAIE", code: "9702", group: "9702-as", component: "1", name: "Cambridge International AS & A Level Physics (9702), Paper 1: Multiple Choice", short: "Paper 1", paper: { label: "Paper 1", minutes: 75, marks: 40 }, aliases: [/\b(?:mcqs?|multiple[\s-]choice)\b/i], units: PHYSICS_AS },
  { id: "caie-9702-p2", board: "CAIE", code: "9702", group: "9702-as", component: "2", name: "Cambridge International AS & A Level Physics (9702), Paper 2: AS Level Structured Questions", short: "Paper 2", paper: { label: "Paper 2", minutes: 75, marks: 60 }, aliases: [/\bstructured questions\b/i], units: PHYSICS_AS },
  {
    id: "caie-9702-p4", board: "CAIE", code: "9702", component: "4", name: "Cambridge International A Level Physics (9702), Paper 4: A Level Structured Questions", short: "Paper 4",
    paper: { label: "Paper 4", minutes: 120, marks: 100 }, aliases: [/\ba2\b/i],
    units: [
      { title: "Motion in a circle", weight: 1, difficulty: 2, points: ["Radians and angular speed ω = v/r", "Centripetal acceleration a = rω² = v²/r", "Centripetal force and what provides it"] },
      { title: "Gravitational fields", weight: 2, difficulty: 2, points: ["Newton's law of gravitation F = GMm/r²", "Field strength g = GM/r² and potential φ = −GM/r", "Orbits and geostationary satellites", "Gravitational potential energy"] },
      { title: "Temperature", weight: 1, difficulty: 1, points: ["Thermal equilibrium and thermodynamic temperature", "Specific heat capacity and specific latent heat", "Measuring them experimentally"] },
      { title: "Ideal gases", weight: 2, difficulty: 2, points: ["The mole and the Avogadro constant", "pV = nRT and pV = NkT", "Kinetic theory pV = ⅓Nm⟨c²⟩", "Mean kinetic energy 3/2 kT"] },
      { title: "Thermodynamics", weight: 1, difficulty: 2, points: ["Internal energy as kinetic plus potential", "First law ΔU = q + W", "Work done on a gas W = pΔV"] },
      { title: "Oscillations", weight: 2, difficulty: 2, points: ["Simple harmonic motion a = −ω²x", "Displacement, velocity and energy in SHM", "Damping and resonance"] },
      { title: "Electric fields", weight: 2, difficulty: 2, points: ["Coulomb's law and field strength E = Q/4πε₀r²", "Uniform fields E = ΔV/Δd and charged particles in them", "Electric potential and potential energy"] },
      { title: "Capacitance", weight: 2, difficulty: 2, points: ["C = Q/V and energy ½QV", "Capacitors in series and parallel", "Charging and discharging, time constant RC", "Exponential decay x = x₀e^(−t/RC)"] },
      { title: "Magnetic fields", weight: 3, difficulty: 3, points: ["Force on a current F = BIL sin θ and on a charge F = BQv", "Hall effect and velocity selection", "Fields of wires, coils and solenoids", "Electromagnetic induction: Faraday's and Lenz's laws"] },
      { title: "Alternating currents", weight: 1, difficulty: 2, points: ["Peak and root-mean-square values", "Mean power in a resistive load", "Rectification and smoothing with a capacitor"] },
      { title: "Quantum physics", weight: 2, difficulty: 2, points: ["Photon energy E = hf and the photoelectric effect hf = Φ + ½mv²max", "Wave-particle duality and the de Broglie wavelength", "Energy levels and line spectra"] },
      { title: "Nuclear physics", weight: 2, difficulty: 2, points: ["Mass defect and binding energy, E = mc²", "Binding energy per nucleon, fission and fusion", "Radioactive decay: activity, decay constant and half-life"] },
      { title: "Medical physics", weight: 2, difficulty: 2, points: ["Production and use of ultrasound, acoustic impedance", "X-rays: production, attenuation and CT scans", "PET scanning and annihilation"] },
      { title: "Astronomy and cosmology", weight: 2, difficulty: 2, points: ["Luminosity, radiant flux and standard candles", "Wien's law and the Stefan–Boltzmann law", "Redshift, Hubble's law and the expanding universe"] },
    ],
  },
];

interface Family { code: string; subject: string; edition: string; entries: Entry[]; named: (text: string) => boolean; fallback?: (text: string) => string | null }
// A family's subject test is strict: a variant with its own syllabus (Further Mathematics 9231, Additional Mathematics) is never this one.
const VARIANT = /\bfurther\b|\badditional\b|\badd\.?\s*math/i;
const FAMILIES: Family[] = [
  { code: "9709", subject: "Mathematics", edition: "for examination from 2020", entries: ENTRIES, named: (t) => !VARIANT.test(t) && (/\bmath(?:s|ematics)?\b/i.test(t) || (/\bpure\b|\bmechanics\b|\bstatistics\b/i.test(t) && !/\bphysics\b/i.test(t))) },
  { code: "9702", subject: "Physics", edition: "for examination from 2022", entries: PHYSICS, named: (t) => /\bphysics\b/i.test(t), fallback: (t) => (/\b(?:a2|a[\s-]?level\s+only)\b/i.test(t) ? null : /\bas[\s-]?levels?\b/i.test(t) ? "2" : null) },
];

export interface CatalogSubject { name?: string | null; code?: string | null; board?: string | null; level?: string | null }

const has = (re: RegExp, ...texts: (string | null | undefined)[]) => texts.some((t) => Boolean(t) && re.test(t!));

/**
 * Entries named by a request. Matches only when the board, the qualification and the paper are all clear, so an ambiguous request falls through to
 * the model rather than to the wrong topic list. "Paper 1 and 3" or "P1, P3" returns both, in that order.
 */
export function matchSyllabi(text: string, subject?: CatalogSubject | null): Entry[] {
  const all = `${text} ${subject?.name ?? ""}`;
  const boardNamed = has(/\b(?:caie|cie|cambridge)\b/i, all) || has(/\b(?:caie|cie|cambridge)\b/i, subject?.board);
  const levelNamed = has(/\b(?:a|as)[\s-]?levels?\b|\ba2\b/i, all) || has(/\b(?:a|as)[\s-]?level/i, subject?.level);
  const words: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6" };
  // "Paper 1", "Papers 1 and 3", "P1/P3", "paper one".
  const named = new Set<string>();
  for (const match of all.matchAll(/\bpapers?\s*((?:[1-6]|one|two|three|four|five|six)(?:\s*(?:,|&|and|\/|\+)\s*(?:paper\s*)?(?:[1-6]|one|two|three|four|five|six))*)/gi)) {
    for (const part of match[1].toLowerCase().split(/\s*(?:,|&|and|\/|\+|paper)\s*/)) { const n = words[part] ?? part; if (/^[1-6]$/.test(n)) named.add(n); }
  }
  for (const family of FAMILIES) {
    const coded = has(new RegExp(`\\b${family.code}\\b`), all, subject?.code);
    if (!coded && !(boardNamed && levelNamed && family.named(all))) continue;
    const found = new Set([...named].filter((n) => family.entries.some((e) => e.component === n)));
    for (const entry of family.entries) if (entry.aliases.some((re) => re.test(all))) found.add(entry.component);
    if (!found.size && family.fallback) { const fallback = family.fallback(all); if (fallback) found.add(fallback); }
    const entries = [...found].sort().map((component) => family.entries.find((e) => e.component === component)).filter((e): e is Entry => Boolean(e));
    if (entries.length) return entries;
  }
  return [];
}

// ── The catalog as a search index ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Each paper is indexed under its search terms (lib/planner/kernel, syllabusTerms) in an inverted index built once, so a request reaches the few
// papers that share a code or a subject word with it directly. The planner shows those to the model, which decides whether one is the syllabus asked
// for. `matchSyllabi` above stays as the strict fallback for when no model is available.

/** A catalog paper as a search result. */
export interface CatalogHit { entry: Entry; stored: StoredSyllabus; edition: string; score: number }

const INDEXED = FAMILIES.flatMap((family) => family.entries.map((entry) => {
  const stored: StoredSyllabus = { board: "Cambridge International", code: entry.code, qualification: "AS & A Level", subject: family.subject, papers: [entry.component], name: entry.name };
  return { entry, stored, edition: family.edition, terms: syllabusTerms(`${stored.board} ${stored.qualification} ${stored.subject} ${entry.code} Paper ${entry.component} ${entry.name}`) };
}));
const POSTINGS = new Map<string, number[]>();
INDEXED.forEach((item, index) => item.terms.forEach((term) => POSTINGS.set(term, [...(POSTINGS.get(term) ?? []), index])));

/** The catalog papers a request might mean, best first: only papers sharing a code or a subject word are scored at all. */
export function searchCatalog(request: readonly string[], limit = 6): CatalogHit[] {
  const hits = new Set<number>();
  for (const term of anchorTerms(request)) for (const index of POSTINGS.get(term) ?? []) hits.add(index);
  return [...hits].map((index) => ({ ...INDEXED[index], score: matchScore(request, INDEXED[index].terms) })).filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).slice(0, limit).map(({ entry, stored, edition, score }) => ({ entry, stored, edition, score }));
}

/** Catalog papers by id, in syllabus order. */
export const catalogEntries = (ids: readonly string[]): Entry[] => INDEXED.filter((item) => ids.includes(item.entry.id)).map((item) => item.entry);

/** A matched entry (or several papers of one exam) as the goal's syllabus. */
export function catalogSyllabus(entries: Entry[]): Syllabus | null {
  if (!entries.length) return null;
  // Papers that share a topic list contribute it once; distinct papers with a topic of the same name are told apart, "Trigonometry (P3)".
  const lists = entries.filter((e, i) => !e.group || entries.findIndex((x) => x.group === e.group) === i);
  const units = lists.flatMap((e) => e.units.map((u) => ({ ...u, title: lists.length > 1 && lists.filter((x) => x.units.some((y) => y.title === u.title)).length > 1 ? `${u.title} (${e.short.replace(/^Pure Mathematics /, "P")})` : u.title })));
  return normalizeSyllabus({
    source: "catalog", ref: entries.map((e) => e.id).join("+"),
    name: entries.length === 1 ? entries[0].name : `${entries[0].name.replace(/,\s*Paper.*$/, "")}, ${entries.map((e) => e.paper.label).join(" and ")}`,
    papers: entries.map((e) => e.paper), units, checked: false,
  });
}

/** Links each unit to the student's own syllabus node with the most words in common, when one clearly matches. */
export function linkTopics(syllabus: Syllabus, nodes: { id: number; title: string }[]): Syllabus {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !["and", "with", "from", "the", "of"].includes(w)));
  const used = new Set<number>();
  return {
    ...syllabus,
    units: syllabus.units.map((unit) => {
      if (unit.topic != null) return unit;
      const mine = words(unit.title);
      let best: { id: number; score: number } | null = null;
      for (const node of nodes) {
        if (used.has(node.id)) continue;
        const theirs = words(node.title);
        const score = [...mine].filter((w) => theirs.has(w) || [...theirs].some((x) => x.startsWith(w.slice(0, 6)) && w.length >= 6)).length;
        if (score > 0 && (!best || score > best.score)) best = { id: node.id, score };
      }
      if (!best) return unit;
      used.add(best.id);
      return { ...unit, topic: best.id };
    }),
  };
}

export const CATALOG_IDS = FAMILIES.flatMap((f) => f.entries.map((e) => e.id));
