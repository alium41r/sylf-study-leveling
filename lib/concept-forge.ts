/**
 * Academic Concept Forge Subsystem
 * Defines STEM discipline matrices (Physics, Mathematics, Computer Science, Chemistry),
 * progress delta calculation, core completion metrics, and strict subject normalization.
 */

export type ForgeDisciplineType = "PHYSICS" | "MATHEMATICS" | "COMPUTER_SCIENCE" | "CHEMISTRY";

export interface ForgeTopicDefinition {
  topicKey: string;
  name: string;
  subjectKey: string;
  targetProgress: number;
  structuralWeight: number;
}

export interface ForgeCoreDefinition {
  coreKey: string;
  name: string;
  description: string;
  discipline: ForgeDisciplineType;
  tier: number;
  rewardXp: number;
  rewardSylph: number;
  rewardSp: number;
  rewardBadgeKey?: string | null;
  rewardPedestalKey?: string | null;
  topics: ForgeTopicDefinition[];
}

export const FORGE_CORES: ForgeCoreDefinition[] = [
  // ==========================================
  // 1. PHYSICS REACTOR (physics-reactor)
  // ==========================================
  {
    coreKey: "physics-reactor",
    name: "Physics Reactor",
    description: "Foundational physical dynamics, Newtonian mechanics, energy conservation, and Maxwell electrodynamics.",
    discipline: "PHYSICS",
    tier: 1,
    rewardXp: 1000,
    rewardSylph: 500,
    rewardSp: 1,
    rewardBadgeKey: "badge_phys_master",
    rewardPedestalKey: "pedestal_cyber",
    topics: [
      {
        topicKey: "phys-kinematics",
        name: "Kinematics & Motion Dynamics",
        subjectKey: "Physics",
        targetProgress: 100,
        structuralWeight: 1.0,
      },
      {
        topicKey: "phys-forces",
        name: "Newtonian Mechanics & Force Fields",
        subjectKey: "Physics",
        targetProgress: 100,
        structuralWeight: 1.0,
      },
      {
        topicKey: "phys-energy",
        name: "Work, Energy & Conservative Systems",
        subjectKey: "Physics",
        targetProgress: 100,
        structuralWeight: 1.2,
      },
      {
        topicKey: "phys-electromagnetism",
        name: "Maxwell Electrodynamics",
        subjectKey: "Physics",
        targetProgress: 100,
        structuralWeight: 1.5,
      },
    ],
  },

  // ==========================================
  // 2. MATHEMATICS ENGINE (math-engine)
  // ==========================================
  {
    coreKey: "math-engine",
    name: "Mathematics Engine",
    description: "Analytical proof structures, differential calculus, linear algebra, ODEs, and discrete combinatorics.",
    discipline: "MATHEMATICS",
    tier: 1,
    rewardXp: 1200,
    rewardSylph: 600,
    rewardSp: 1,
    rewardBadgeKey: "badge_math_master",
    rewardPedestalKey: "pedestal_monarch",
    topics: [
      {
        topicKey: "math-calculus",
        name: "Differential & Integral Calculus",
        subjectKey: "Maths",
        targetProgress: 100,
        structuralWeight: 1.0,
      },
      {
        topicKey: "math-linear-algebra",
        name: "Vector Spaces & Matrices",
        subjectKey: "Maths",
        targetProgress: 100,
        structuralWeight: 1.2,
      },
      {
        topicKey: "math-differential-eq",
        name: "Ordinary Differential Equations",
        subjectKey: "Maths",
        targetProgress: 100,
        structuralWeight: 1.5,
      },
      {
        topicKey: "math-discrete",
        name: "Discrete Mathematics & Combinatorics",
        subjectKey: "Maths",
        targetProgress: 100,
        structuralWeight: 1.2,
      },
    ],
  },

  // ==========================================
  // 3. COMPUTER SCIENCE NETWORK (cs-network)
  // ==========================================
  {
    coreKey: "cs-network",
    name: "Computer Science Network",
    description: "Algorithmic complexity, data structures, low-level OS architectures, networking protocols, and database indexing.",
    discipline: "COMPUTER_SCIENCE",
    tier: 1,
    rewardXp: 1000,
    rewardSylph: 500,
    rewardSp: 1,
    rewardBadgeKey: "badge_cs_master",
    rewardPedestalKey: "pedestal_cyber",
    topics: [
      {
        topicKey: "cs-dsa",
        name: "Data Structures & Algorithmic Analysis",
        subjectKey: "Computer Science",
        targetProgress: 100,
        structuralWeight: 1.2,
      },
      {
        topicKey: "cs-systems",
        name: "Operating Systems & Memory Architecture",
        subjectKey: "Computer Science",
        targetProgress: 100,
        structuralWeight: 1.3,
      },
      {
        topicKey: "cs-networking",
        name: "Protocols, TCP/IP & Socket Architecture",
        subjectKey: "Computer Science",
        targetProgress: 100,
        structuralWeight: 1.0,
      },
      {
        topicKey: "cs-databases",
        name: "Relational Calculus & Indexing",
        subjectKey: "Computer Science",
        targetProgress: 100,
        structuralWeight: 1.1,
      },
    ],
  },

  // ==========================================
  // 4. CHEMISTRY LABORATORY (chemistry-lab)
  // ==========================================
  {
    coreKey: "chemistry-lab",
    name: "Chemistry Laboratory",
    description: "Stoichiometric equilibrium, thermodynamics, molecular orbital synthesis, and reaction kinetics.",
    discipline: "CHEMISTRY",
    tier: 1,
    rewardXp: 1000,
    rewardSylph: 500,
    rewardSp: 1,
    rewardBadgeKey: "badge_chem_master",
    rewardPedestalKey: "pedestal_shadow",
    topics: [
      {
        topicKey: "chem-stoichiometry",
        name: "Chemical Equilibrium & Stoichiometry",
        subjectKey: "Chemistry",
        targetProgress: 100,
        structuralWeight: 1.0,
      },
      {
        topicKey: "chem-thermodynamics",
        name: "Thermochemistry & Enthalpy",
        subjectKey: "Chemistry",
        targetProgress: 100,
        structuralWeight: 1.2,
      },
      {
        topicKey: "chem-organic",
        name: "Reaction Mechanisms & Synthesis",
        subjectKey: "Chemistry",
        targetProgress: 100,
        structuralWeight: 1.4,
      },
      {
        topicKey: "chem-kinetics",
        name: "Reaction Rates & Rate Laws",
        subjectKey: "Chemistry",
        targetProgress: 100,
        structuralWeight: 1.1,
      },
    ],
  },
];

/**
 * Pure calculation function for concept forge progress delta.
 * Delta = (Difficulty * 5 + floor(Minutes / 15)) * Weight (Clamped between 1 and 40).
 */
export function calculateForgeDelta(
  difficulty: number,
  durationMinutes: number,
  weight: number = 1.0
): number {
  const safeDifficulty = Math.max(1, Math.min(5, Math.round(difficulty)));
  const timeBlocks = Math.floor(Math.max(0, durationMinutes) / 15);
  const safeWeight = Math.max(0.1, weight);

  const rawDelta = Math.floor((safeDifficulty * 5 + timeBlocks) * safeWeight);
  return Math.max(1, Math.min(40, rawDelta));
}

/**
 * Pure function to calculate overall Forge Core % completion.
 */
export function getForgeCoreProgress(
  topics: Array<{ progress: number; targetProgress?: number }>
): number {
  if (!topics || topics.length === 0) return 0;

  let totalPct = 0;
  for (const t of topics) {
    const target = t.targetProgress && t.targetProgress > 0 ? t.targetProgress : 100;
    const progress = Math.max(0, Math.min(target, t.progress || 0));
    totalPct += (progress / target) * 100;
  }

  return Math.min(100, Math.floor(totalPct / topics.length));
}

/**
 * Strict Subject Normalization and topic matcher.
 * Matches user subject inputs and optional topic names to canonical ForgeTopic keys.
 */
export function matchSubjectToForgeTopic(
  subject: string,
  topicName?: string
): string | null {
  if (!subject || typeof subject !== "string") return null;

  const normalizedSubject = subject.trim().toLowerCase();
  const normalizedTopic = topicName ? topicName.trim().toLowerCase() : "";
  const combined = `${normalizedSubject} ${normalizedTopic}`.trim();

  // 1. Chemistry Laboratory
  if (
    /\b(chem|chemistry|organic chemistry|inorganic chemistry)\b/i.test(normalizedSubject) ||
    /\b(chem|chemistry)\b/i.test(combined)
  ) {
    if (/kinetic|rate|catalyst|law/i.test(combined)) {
      return "chem-kinetics";
    }
    if (/thermo|enthalpy|heat|equilibrium|entropy/i.test(combined)) {
      return "chem-thermodynamics";
    }
    if (/organic|synthesis|molecular|hydrocarbon/i.test(combined)) {
      return "chem-organic";
    }
    return "chem-stoichiometry";
  }

  // 2. Physics Reactor
  if (
    /\b(physics|physic|mechanics|mechanic|electrodynamics|electrodynamic)\b/i.test(normalizedSubject) ||
    /\b(physics|physic|mechanics)\b/i.test(combined)
  ) {
    if (/electro|magnetic|maxwell|circuit|field/i.test(combined)) {
      return "phys-electromagnetism";
    }
    if (/energy|work|power|conservative/i.test(combined)) {
      return "phys-energy";
    }
    if (/force|newton|gravity|momentum|friction/i.test(combined)) {
      return "phys-forces";
    }
    return "phys-kinematics";
  }

  // 3. Mathematics Engine
  if (
    /\b(math|maths|mathematics|calculus|algebra|statistics)\b/i.test(normalizedSubject) ||
    /\b(math|maths|mathematics)\b/i.test(combined)
  ) {
    if (/linear|matrix|vector|eigen/i.test(combined)) {
      return "math-linear-algebra";
    }
    if (/diff|differential|ode|pde|integral/i.test(combined)) {
      return "math-differential-eq";
    }
    if (/discrete|combinatoric|graph|logic|set/i.test(combined)) {
      return "math-discrete";
    }
    return "math-calculus";
  }

  // 4. Computer Science Network
  if (
    /\b(cs|computer science|programming|software|algorithm|algorithms|code|coding)\b/i.test(normalizedSubject) ||
    /\b(computer science|programming|software)\b/i.test(combined)
  ) {
    if (/system|os|memory|kernel|architecture/i.test(combined)) {
      return "cs-systems";
    }
    if (/network|tcp|ip|socket|protocol|http/i.test(combined)) {
      return "cs-networking";
    }
    if (/database|sql|query|index|relational/i.test(combined)) {
      return "cs-databases";
    }
    return "cs-dsa";
  }

  return null;
}
