/**
 * Universal 10-Tier Constellation Skill Tree Skeleton
 * 48 Nodes × 68 Edges — Generic structural placeholders only.
 * No custom names, perks, stat bonuses, or lore.
 */

import type { SkillBranch } from "@/lib/skill-tree";

export type NodeShape = 'circle' | 'hexagon' | 'diamond' | 'octagon' | 'apex_star';

export interface SkeletonNode {
  id: string;
  tier: number;
  x: number;   // Viewport coordinate 0–1000
  y: number;   // Viewport coordinate 0–1200
  shape: NodeShape;
  costSP: number;
  label: string;
  description: string;
}

// ─── 48-Node Coordinate Matrix ──────────────────────────────────

export const SKELETON_NODES: SkeletonNode[] = [
  // Tier 1 (Root Foundation)
  { id: 'N1_1', tier: 1, x: 500, y: 1100, shape: 'circle', costSP: 1, label: 'Node N1_1', description: 'Tier 1 Root Foundation' },

  // Tier 2 (Trunks — 3 primary branches)
  { id: 'N2_1', tier: 2, x: 280, y: 990, shape: 'hexagon', costSP: 1, label: 'Node N2_1', description: 'Tier 2 Node Placeholder' },
  { id: 'N2_2', tier: 2, x: 500, y: 990, shape: 'hexagon', costSP: 1, label: 'Node N2_2', description: 'Tier 2 Node Placeholder' },
  { id: 'N2_3', tier: 2, x: 720, y: 990, shape: 'hexagon', costSP: 1, label: 'Node N2_3', description: 'Tier 2 Node Placeholder' },

  // Tier 3 (6 nodes — branch subdivision)
  { id: 'N3_1', tier: 3, x: 180, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_1', description: 'Tier 3 Node Placeholder' },
  { id: 'N3_2', tier: 3, x: 340, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_2', description: 'Tier 3 Node Placeholder' },
  { id: 'N3_3', tier: 3, x: 440, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_3', description: 'Tier 3 Node Placeholder' },
  { id: 'N3_4', tier: 3, x: 560, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_4', description: 'Tier 3 Node Placeholder' },
  { id: 'N3_5', tier: 3, x: 660, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_5', description: 'Tier 3 Node Placeholder' },
  { id: 'N3_6', tier: 3, x: 820, y: 880, shape: 'hexagon', costSP: 1, label: 'Node N3_6', description: 'Tier 3 Node Placeholder' },

  // Tier 4 (8 nodes — widest spread)
  { id: 'N4_1', tier: 4, x: 120, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_1', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_2', tier: 4, x: 240, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_2', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_3', tier: 4, x: 360, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_3', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_4', tier: 4, x: 450, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_4', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_5', tier: 4, x: 550, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_5', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_6', tier: 4, x: 640, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_6', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_7', tier: 4, x: 760, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_7', description: 'Tier 4 Node Placeholder' },
  { id: 'N4_8', tier: 4, x: 880, y: 770, shape: 'hexagon', costSP: 2, label: 'Node N4_8', description: 'Tier 4 Node Placeholder' },

  // Tier 5 (Mid-Keystones — 6 nodes)
  { id: 'N5_1', tier: 5, x: 180, y: 660, shape: 'diamond', costSP: 2, label: 'Node N5_1', description: 'Tier 5 Keystone Placeholder' },
  { id: 'N5_2', tier: 5, x: 320, y: 660, shape: 'diamond', costSP: 2, label: 'Node N5_2', description: 'Tier 5 Keystone Placeholder' },
  { id: 'N5_3', tier: 5, x: 450, y: 660, shape: 'hexagon', costSP: 2, label: 'Node N5_3', description: 'Tier 5 Node Placeholder' },
  { id: 'N5_4', tier: 5, x: 550, y: 660, shape: 'hexagon', costSP: 2, label: 'Node N5_4', description: 'Tier 5 Node Placeholder' },
  { id: 'N5_5', tier: 5, x: 680, y: 660, shape: 'diamond', costSP: 2, label: 'Node N5_5', description: 'Tier 5 Keystone Placeholder' },
  { id: 'N5_6', tier: 5, x: 820, y: 660, shape: 'diamond', costSP: 2, label: 'Node N5_6', description: 'Tier 5 Keystone Placeholder' },

  // Tier 6 (8 nodes)
  { id: 'N6_1', tier: 6, x: 140, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_1', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_2', tier: 6, x: 260, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_2', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_3', tier: 6, x: 380, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_3', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_4', tier: 6, x: 460, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_4', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_5', tier: 6, x: 540, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_5', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_6', tier: 6, x: 620, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_6', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_7', tier: 6, x: 740, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_7', description: 'Tier 6 Node Placeholder' },
  { id: 'N6_8', tier: 6, x: 860, y: 550, shape: 'hexagon', costSP: 3, label: 'Node N6_8', description: 'Tier 6 Node Placeholder' },

  // Tier 7 (7 nodes — convergence)
  { id: 'N7_1', tier: 7, x: 180, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_1', description: 'Tier 7 Node Placeholder' },
  { id: 'N7_2', tier: 7, x: 300, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_2', description: 'Tier 7 Node Placeholder' },
  { id: 'N7_3', tier: 7, x: 420, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_3', description: 'Tier 7 Node Placeholder' },
  { id: 'N7_4', tier: 7, x: 500, y: 440, shape: 'octagon', costSP: 3, label: 'Node N7_4', description: 'Tier 7 Nexus Placeholder' },
  { id: 'N7_5', tier: 7, x: 580, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_5', description: 'Tier 7 Node Placeholder' },
  { id: 'N7_6', tier: 7, x: 700, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_6', description: 'Tier 7 Node Placeholder' },
  { id: 'N7_7', tier: 7, x: 820, y: 440, shape: 'hexagon', costSP: 3, label: 'Node N7_7', description: 'Tier 7 Node Placeholder' },

  // Tier 8 (5 nodes — funnel)
  { id: 'N8_1', tier: 8, x: 240, y: 330, shape: 'diamond', costSP: 4, label: 'Node N8_1', description: 'Tier 8 Keystone Placeholder' },
  { id: 'N8_2', tier: 8, x: 380, y: 330, shape: 'hexagon', costSP: 4, label: 'Node N8_2', description: 'Tier 8 Node Placeholder' },
  { id: 'N8_3', tier: 8, x: 500, y: 330, shape: 'hexagon', costSP: 4, label: 'Node N8_3', description: 'Tier 8 Node Placeholder' },
  { id: 'N8_4', tier: 8, x: 620, y: 330, shape: 'hexagon', costSP: 4, label: 'Node N8_4', description: 'Tier 8 Node Placeholder' },
  { id: 'N8_5', tier: 8, x: 760, y: 330, shape: 'diamond', costSP: 4, label: 'Node N8_5', description: 'Tier 8 Keystone Placeholder' },

  // Tier 9 (3 nodes — gate convergence)
  { id: 'N9_1', tier: 9, x: 320, y: 220, shape: 'diamond', costSP: 4, label: 'Node N9_1', description: 'Tier 9 Keystone Placeholder' },
  { id: 'N9_2', tier: 9, x: 500, y: 220, shape: 'octagon', costSP: 4, label: 'Node N9_2', description: 'Tier 9 Gate Nexus Placeholder' },
  { id: 'N9_3', tier: 9, x: 680, y: 220, shape: 'diamond', costSP: 4, label: 'Node N9_3', description: 'Tier 9 Keystone Placeholder' },

  // Tier 10 (Apex — 1 node)
  { id: 'N10_1', tier: 10, x: 500, y: 100, shape: 'apex_star', costSP: 5, label: 'Node N10_1', description: 'Tier 10 Apex Keystone (Unlocks Class Mastery)' },
];

// ─── 68-Edge Topology ───────────────────────────────────────────

export const SKELETON_EDGES: [string, string][] = [
  // Tier 1 → 2
  ['N1_1', 'N2_1'], ['N1_1', 'N2_2'], ['N1_1', 'N2_3'],
  // Tier 2 → 3
  ['N2_1', 'N3_1'], ['N2_1', 'N3_2'],
  ['N2_2', 'N3_2'], ['N2_2', 'N3_3'], ['N2_2', 'N3_4'], ['N2_2', 'N3_5'],
  ['N2_3', 'N3_5'], ['N2_3', 'N3_6'],
  // Tier 3 → 4
  ['N3_1', 'N4_1'], ['N3_1', 'N4_2'],
  ['N3_2', 'N4_2'], ['N3_2', 'N4_3'],
  ['N3_3', 'N4_3'], ['N3_3', 'N4_4'],
  ['N3_4', 'N4_5'], ['N3_4', 'N4_6'],
  ['N3_5', 'N4_6'], ['N3_5', 'N4_7'],
  ['N3_6', 'N4_7'], ['N3_6', 'N4_8'],
  // Tier 4 → 5
  ['N4_1', 'N5_1'], ['N4_2', 'N5_1'],
  ['N4_2', 'N5_2'], ['N4_3', 'N5_2'],
  ['N4_4', 'N5_3'], ['N4_5', 'N5_3'],
  ['N4_4', 'N5_4'], ['N4_5', 'N5_4'],
  ['N4_6', 'N5_5'], ['N4_7', 'N5_5'],
  ['N4_7', 'N5_6'], ['N4_8', 'N5_6'],
  // Tier 5 → 6
  ['N5_1', 'N6_1'], ['N5_1', 'N6_2'],
  ['N5_2', 'N6_2'], ['N5_2', 'N6_3'],
  ['N5_3', 'N6_3'], ['N5_3', 'N6_4'],
  ['N5_4', 'N6_5'], ['N5_4', 'N6_6'],
  ['N5_5', 'N6_6'], ['N5_5', 'N6_7'],
  ['N5_6', 'N6_7'], ['N5_6', 'N6_8'],
  // Tier 6 → 7
  ['N6_1', 'N7_1'], ['N6_2', 'N7_1'],
  ['N6_2', 'N7_2'], ['N6_3', 'N7_2'],
  ['N6_3', 'N7_3'], ['N6_4', 'N7_3'],
  ['N6_4', 'N7_4'], ['N6_5', 'N7_4'],
  ['N6_5', 'N7_5'], ['N6_6', 'N7_5'],
  ['N6_6', 'N7_6'], ['N6_7', 'N7_6'],
  ['N6_7', 'N7_7'], ['N6_8', 'N7_7'],
  // Tier 7 → 8
  ['N7_1', 'N8_1'], ['N7_2', 'N8_1'],
  ['N7_2', 'N8_2'], ['N7_3', 'N8_2'], ['N7_4', 'N8_2'],
  ['N7_4', 'N8_3'],
  ['N7_4', 'N8_4'], ['N7_5', 'N8_4'], ['N7_6', 'N8_4'],
  ['N7_6', 'N8_5'], ['N7_7', 'N8_5'],
  // Tier 8 → 9
  ['N8_1', 'N9_1'], ['N8_2', 'N9_1'],
  ['N8_2', 'N9_2'], ['N8_3', 'N9_2'], ['N8_4', 'N9_2'],
  ['N8_4', 'N9_3'], ['N8_5', 'N9_3'],
  // Tier 9 → 10
  ['N9_1', 'N10_1'], ['N9_2', 'N10_1'], ['N9_3', 'N10_1'],
];

// ─── Prerequisite Resolver ──────────────────────────────────────

/**
 * Build a map of nodeId → list of parent nodeIds that must be unlocked first.
 * For a node to be AVAILABLE, at least ONE of its parent edges must be unlocked.
 */
const _prereqCache = new Map<string, string[]>();

export function getPrerequisites(nodeId: string): string[] {
  if (_prereqCache.size === 0) {
    for (const node of SKELETON_NODES) {
      _prereqCache.set(node.id, []);
    }
    for (const [parent, child] of SKELETON_EDGES) {
      const list = _prereqCache.get(child);
      if (list) list.push(parent);
    }
  }
  return _prereqCache.get(nodeId) || [];
}

/**
 * Check if a node is available for unlock within a given class branch.
 * Root node (N1_1) is always available if not already unlocked.
 * Other nodes require at least ONE parent to be unlocked.
 */
export function isNodeAvailable(nodeId: string, unlockedSet: Set<string>): boolean {
  if (unlockedSet.has(nodeId)) return false; // Already unlocked
  const prereqs = getPrerequisites(nodeId);
  if (prereqs.length === 0) return true; // Root node
  return prereqs.some((parentId) => unlockedSet.has(parentId));
}

// ─── Helper Functions ───────────────────────────────────────────

export const ALL_SKILL_BRANCHES: SkillBranch[] = [
  "SCHOLAR",
  "ANALYST",
  "ENGINEER",
  "SCIENTIST",
  "RESEARCHER",
  "PSYCHOLOGIST",
  "STRATEGIST",
  "CREATIVE",
];

export function makeNodeKey(branch: SkillBranch, nodeId: string): string {
  return `${branch.toUpperCase()}_${nodeId.toUpperCase()}`;
}

export function parseNodeKey(nodeKey: string): { branch: SkillBranch; nodeId: string } | null {
  if (!nodeKey) return null;
  const parts = nodeKey.split("_");
  if (parts.length >= 2) {
    const branch = parts[0].toUpperCase() as SkillBranch;
    const nodeId = parts.slice(1).join("_").toUpperCase();
    if (ALL_SKILL_BRANCHES.includes(branch)) {
      return { branch, nodeId };
    }
  }
  return null;
}

export function avatarToClassBranch(avatar: string | null | undefined): SkillBranch {
  if (!avatar) return "SCHOLAR";
  const clean = avatar.toLowerCase().replace("class_", "").replace("avatar_", "");
  switch (clean) {
    case "analyst": return "ANALYST";
    case "engineer": return "ENGINEER";
    case "scientist": return "SCIENTIST";
    case "researcher": return "RESEARCHER";
    case "psychologist": return "PSYCHOLOGIST";
    case "strategist": return "STRATEGIST";
    case "creative": return "CREATIVE";
    case "scholar":
    default:
      return "SCHOLAR";
  }
}

// ─── Tier Shape Labels ──────────────────────────────────────────

export const TIER_SHAPE_LABELS: Record<number, string> = {
  1: 'Root Foundation',
  2: 'Trunk Branch',
  3: 'Sub-Branch',
  4: 'Pathway Node',
  5: 'Mid-Keystone',
  6: 'Specialization',
  7: 'Convergence',
  8: 'Upper Keystone',
  9: 'Gate Nexus',
  10: 'Apex Keystone',
};

export const TOTAL_NODES = SKELETON_NODES.length; // 48
export const TOTAL_EDGES = SKELETON_EDGES.length; // 68

// ─── Sequential Node Display Mapping (#01–#47 / APEX) ───────────

export const NODE_INDEX_MAP: Record<string, string> = SKELETON_NODES.reduce(
  (acc, node, index) => {
    if (node.id === "N10_1" || node.tier === 10) {
      acc[node.id] = "APEX";
    } else {
      const sequentialNum = String(index + 1).padStart(2, "0");
      acc[node.id] = `#${sequentialNum}`;
    }
    return acc;
  },
  {} as Record<string, string>
);

export function getNodeDisplayCode(nodeId: string): string {
  return NODE_INDEX_MAP[nodeId] || nodeId;
}

export function getNodeFullDisplayTitle(nodeId: string, title?: string): string {
  const code = getNodeDisplayCode(nodeId);
  return title ? `${code} · ${title}` : code;
}

