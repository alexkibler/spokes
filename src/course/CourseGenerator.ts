/**
 * CourseGenerator.ts
 *
 * Procedurally generates the Hub-and-Spoke map structure and course profiles.
 *
 * Structure per biome route (10 nodes total):
 *   Spoke  – 4 linear nodes away from the Hub
 *   Island – 6 interconnected nodes (mini-DAG) at the end of the spoke,
 *            containing exactly 1 shop and 1 boss; the other 4 are randomized.
 *
 * Number of spokes scales dynamically with totalDistanceKm (min 2, max 8).
 */

import { generateCourseProfile, type SurfaceType } from './CourseProfile';
import type { RunData, MapNode, MapEdge, NodeType } from '../roguelike/RunManager';
import { THEME } from '../theme';

// ── Configuration Constants ───────────────────────────────────────────────────

/** Number of linear nodes in the spoke, leading from the Hub to the Island entry. */
export const NODES_PER_SPOKE = 2;

/** Distance between consecutive nodes in the map's radial layout. */
export const SPOKE_STEP = 0.07;

/** Minimum number of spokes generated for any run. */
export const MIN_SPOKES = 2;

/** Maximum number of spokes generated for any run. */
export const MAX_SPOKES = 8;

/** Distance interval (km) to add a new spoke to the run. */
export const KM_PER_SPOKE = 20;

// ── Biome catalogue (ordered by priority of inclusion) ────────────────────────

export const SPOKE_IDS = [
  'plains', 'coast', 'mountain', 'forest',
  'desert', 'tundra', 'canyon', 'jungle',
] as const;

export type SpokeId = typeof SPOKE_IDS[number];

interface SpokeConfig {
  color: number;
  hazardSurface: SurfaceType;
  hazardGrade: number;
}

const SPOKE_CONFIG: Record<SpokeId, SpokeConfig> = {
  plains:   { color: THEME.colors.biomes.plains,   hazardSurface: 'asphalt', hazardGrade: 0.00 },
  coast:    { color: THEME.colors.biomes.coast,    hazardSurface: 'mud',     hazardGrade: 0.02 },
  mountain: { color: THEME.colors.biomes.mountain, hazardSurface: 'gravel',  hazardGrade: 0.15 },
  forest:   { color: THEME.colors.biomes.forest,   hazardSurface: 'dirt',    hazardGrade: 0.08 },
  desert:   { color: THEME.colors.biomes.desert,   hazardSurface: 'gravel',  hazardGrade: 0.06 },
  tundra:   { color: THEME.colors.biomes.tundra,   hazardSurface: 'mud',     hazardGrade: 0.04 },
  canyon:   { color: THEME.colors.biomes.canyon,   hazardSurface: 'dirt',    hazardGrade: 0.10 },
  jungle:   { color: THEME.colors.biomes.jungle,   hazardSurface: 'mud',     hazardGrade: 0.05 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derive the number of biome spokes from the target run distance.
 */
export function computeNumSpokes(totalDistanceKm: number): number {
  return Math.max(
    MIN_SPOKES,
    Math.min(MAX_SPOKES, Math.round(totalDistanceKm / KM_PER_SPOKE))
  );
}

/** Return a random non-shop, non-boss node type for island interior nodes. */
function randomIslandNodeType(): NodeType {
  const r = Math.random();
  if (r < 0.5) return 'standard';
  if (r < 0.8) return 'event';
  return 'hard';
}

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateHubAndSpokeMap(run: RunData): void {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  const numSpokes = computeNumSpokes(run.totalDistanceKm);

  // A typical full-run path per spoke: linear edges + island entry + island paths + island boss.
  // Weight: (NODES_PER_SPOKE) linear + 1 (entry) + 1 (mid) + 1 (pre) + 1.5 (boss) = NODES_PER_SPOKE + 4.5.
  // Plus 1 final-boss edge (2× baseKm). Solve for baseKm so total ≈ totalDistanceKm.
  const weightPerSpoke = NODES_PER_SPOKE + 4.5;
  const totalRunWeight = numSpokes * weightPerSpoke + 2;
  const baseKm = Math.max(0.1, run.totalDistanceKm / totalRunWeight);

  // Scale all grades by the chosen run difficulty.
  const diffScale = (run.difficulty === 'hard') ? 1.5 : (run.difficulty === 'easy' ? 0.7 : 1.0);

  // Update runLength to equal the number of spokes so the final-boss
  // medal lock requires exactly one medal per biome.
  run.runLength = numSpokes;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const addEdge = (from: string, to: string, km: number, baseMaxGrade: number, surface: SurfaceType = 'asphalt') => {
    const targetNode = nodes.find(n => n.id === to);
    let grade = baseMaxGrade * diffScale;

    // Node-type specific multipliers to ensure "Hard Rides" and "Bosses" feel distinct
    if (targetNode?.type === 'hard')   grade *= 1.5;
    if (targetNode?.type === 'boss')   grade *= 2.0;
    if (targetNode?.type === 'finish') grade *= 2.5;

    edges.push({
      from,
      to,
      profile: generateCourseProfile(km, grade, surface),
      isCleared: false,
    });
  };

  const findNode = (id: string) => nodes.find(n => n.id === id)!;

  // ── 1. Hub ─────────────────────────────────────────────────────────────────
  const hubNode: MapNode = {
    id: 'node_hub',
    type: 'start',
    floor: 0,
    col: 0,
    x: 0.5,
    y: 0.5,
    connectedTo: [],
  };
  nodes.push(hubNode);

  // ── 2. Spokes ──────────────────────────────────────────────────────────────
  const activeSpokes = SPOKE_IDS.slice(0, numSpokes);

  activeSpokes.forEach((spokeId, spokeIndex) => {
    const config = SPOKE_CONFIG[spokeId];

    // Evenly distribute spoke angles around the hub (clockwise from right).
    const angle = (2 * Math.PI * spokeIndex) / numSpokes;

    // Convert (radial, perpendicular) into (x, y) in normalised map space.
    // Perpendicular direction is 90° CCW from the radial: (-sinθ, cosθ).
    const pos = (radial: number, perp = 0) => ({
      x: 0.5 + Math.cos(angle) * radial + (-Math.sin(angle)) * perp,
      y: 0.5 + Math.sin(angle) * radial + (Math.cos(angle)) * perp,
    });

    // ── 2a. Linear spoke nodes ────────────────────────────────────────────
    const spokeIds: string[] = [];
    for (let i = 1; i <= NODES_PER_SPOKE; i++) {
      const nodeId = `node_${spokeId}_s${i}`;
      const nodePos = pos(SPOKE_STEP * i);

      const spokeNode: MapNode = {
        id: nodeId,
        type: 'standard',
        floor: i,
        col: 0,
        x: nodePos.x,
        y: nodePos.y,
        connectedTo: [],
        metadata: { spokeId },
      };
      nodes.push(spokeNode);
      spokeIds.push(nodeId);

      if (i === 1) {
        // Hub → s1: hazard edge (terrain determined by biome)
        addEdge(hubNode.id, nodeId, baseKm, config.hazardGrade, config.hazardSurface);
        hubNode.connectedTo.push(nodeId);
      } else {
        // s(i-1) → si: standard spoke leg
        const prevId = spokeIds[i - 2];
        addEdge(prevId, nodeId, baseKm, 0.04);
        findNode(prevId).connectedTo.push(nodeId);
      }
    }

    // ── 2b. Island mini-DAG ──────────────────────────────────────────
    const lastSpokeNodeId = spokeIds[NODES_PER_SPOKE - 1];
    const lastSpokeNode   = findNode(lastSpokeNodeId);

    // Island radial positions relative to the end of the spoke
    const ISLAND_ENTRY = SPOKE_STEP * NODES_PER_SPOKE + SPOKE_STEP * 0.8;
    const ISLAND_MID   = SPOKE_STEP * NODES_PER_SPOKE + SPOKE_STEP * 1.6;
    const ISLAND_PRE   = SPOKE_STEP * NODES_PER_SPOKE + SPOKE_STEP * 2.4;
    const ISLAND_BOSS  = SPOKE_STEP * NODES_PER_SPOKE + SPOKE_STEP * 3.2;

    // Draw 4 random types for the non-shop, non-boss island slots.
    const rTypes: NodeType[] = [
      randomIslandNodeType(),
      randomIslandNodeType(),
      randomIslandNodeType(),
      randomIslandNodeType(),
    ];

    // Island node IDs
    const ieId   = `node_${spokeId}_ie`;   // entry
    const ilId   = `node_${spokeId}_il`;   // left  branch
    const icId   = `node_${spokeId}_ic`;   // center (shop)
    const irId   = `node_${spokeId}_ir`;   // right branch
    const ipId   = `node_${spokeId}_ip`;   // pre-boss convergence
    const bossId = `node_${spokeId}_boss`; // spoke champion

    const mkNode = (id: string, type: NodeType, floor: number, radial: number, perp = 0): MapNode => ({
      id,
      type,
      floor,
      col: 0,
      ...pos(radial, perp),
      connectedTo: [],
      metadata: { spokeId },
    });

    const ieNode   = mkNode(ieId,   rTypes[0],  NODES_PER_SPOKE + 1, ISLAND_ENTRY,  0);
    const ilNode   = mkNode(ilId,   rTypes[1],  NODES_PER_SPOKE + 2, ISLAND_MID,   -0.05);
    const icNode   = mkNode(icId,   'shop',     NODES_PER_SPOKE + 2, ISLAND_MID,    0);
    const irNode   = mkNode(irId,   rTypes[2],  NODES_PER_SPOKE + 2, ISLAND_MID,    0.05);
    const ipNode   = mkNode(ipId,   rTypes[3],  NODES_PER_SPOKE + 3, ISLAND_PRE,   0);
    const bossNode = mkNode(bossId, 'boss',     NODES_PER_SPOKE + 4, ISLAND_BOSS,  0);

    nodes.push(ieNode, ilNode, icNode, irNode, ipNode, bossNode);

    // Last spoke node → entry
    addEdge(lastSpokeNodeId, ieId, baseKm, 0.04);
    lastSpokeNode.connectedTo.push(ieId);

    // entry → left / center(shop) / right
    addEdge(ieId, ilId, baseKm, 0.05);
    addEdge(ieId, icId, baseKm, 0.03);
    addEdge(ieId, irId, baseKm, 0.05);
    ieNode.connectedTo.push(ilId, icId, irId);

    // left / center / right → pre-boss
    addEdge(ilId, ipId, baseKm, 0.05, 'gravel');
    addEdge(icId, ipId, baseKm, 0.03);
    addEdge(irId, ipId, baseKm, 0.05, 'gravel');
    ilNode.connectedTo.push(ipId);
    icNode.connectedTo.push(ipId);
    irNode.connectedTo.push(ipId);

    // pre-boss → boss (harder effort)
    addEdge(ipId, bossId, baseKm * 1.5, 0.08);
    ipNode.connectedTo.push(bossId);
  });

  // ── 3. Final Boss ──────────────────────────────────────────────────────────
  // Place the final boss in the angular gap between the last and first spoke,
  // close to the hub so it is visually distinct from the biome spokes.
  const finalAngle = Math.PI * (2 * numSpokes - 1) / numSpokes;
  const finalDist  = 0.06;

  const finalBossNode: MapNode = {
    id: 'node_final_boss',
    type: 'finish',
    floor: 99,
    col: 0,
    x: 0.5 + Math.cos(finalAngle) * finalDist,
    y: 0.5 + Math.sin(finalAngle) * finalDist,
    connectedTo: [],
  };
  nodes.push(finalBossNode);

  addEdge(hubNode.id, finalBossNode.id, baseKm * 2, 0.10);
  hubNode.connectedTo.push(finalBossNode.id);

  run.nodes = nodes;
  run.edges = edges;
  run.currentNodeId = hubNode.id;
  run.visitedNodeIds = [hubNode.id];

  // ── 4. Finalise Stats ──────────────────────────────────────────────────────
  // We define total map distance as the sum of typical paths through every mandatory spoke plus the finale.
  run.stats.totalMapDistanceM = (numSpokes * weightPerSpoke + 2) * baseKm * 1000;

  console.log(
    `[MAP GEN] spokes: ${numSpokes}, nodes: ${nodes.length}, edges: ${edges.length}, ` +
    `total length: ${(run.stats.totalMapDistanceM / 1000).toFixed(1)}km ` +
    `(target path: ${run.totalDistanceKm}km)`
  );
}
