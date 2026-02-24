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
import type { RunData, MapNode, MapEdge, NodeType } from '../roguelike/RunState';

// ── Biome catalogue (ordered by priority of inclusion) ────────────────────────

export const SPOKE_IDS = [
  'plains', 'coast', 'mountain', 'forest',
  'desert', 'tundra', 'canyon', 'jungle',
] as const;

export type SpokeId = typeof SPOKE_IDS[number];

interface SpokeConfig {
  label: string;
  color: number;
  hazardSurface: SurfaceType;
  hazardGrade: number;
}

const SPOKE_CONFIG: Record<SpokeId, SpokeConfig> = {
  plains:   { label: 'Plains',   color: 0x88cc44, hazardSurface: 'asphalt', hazardGrade: 0.00 },
  coast:    { label: 'Coast',    color: 0x4488cc, hazardSurface: 'mud',     hazardGrade: 0.02 },
  mountain: { label: 'Mountain', color: 0xcc4444, hazardSurface: 'gravel',  hazardGrade: 0.15 },
  forest:   { label: 'Forest',   color: 0x228844, hazardSurface: 'dirt',    hazardGrade: 0.08 },
  desert:   { label: 'Desert',   color: 0xddaa44, hazardSurface: 'gravel',  hazardGrade: 0.06 },
  tundra:   { label: 'Tundra',   color: 0x88ccdd, hazardSurface: 'mud',     hazardGrade: 0.04 },
  canyon:   { label: 'Canyon',   color: 0xcc8844, hazardSurface: 'dirt',    hazardGrade: 0.10 },
  jungle:   { label: 'Jungle',   color: 0x44aa44, hazardSurface: 'mud',     hazardGrade: 0.05 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derive the number of biome spokes from the target run distance.
 * Min 2, Max 8.
 */
export function computeNumSpokes(totalDistanceKm: number): number {
  return Math.max(2, Math.min(8, Math.round(totalDistanceKm / 50)));
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

  // A typical full-run path per spoke: 4 spoke edges + 3 island edges = 7.
  // Plus 1 final-boss edge (2× baseKm).  Solve for baseKm so total ≈ totalDistanceKm.
  const typicalEdgesPerSpoke = 7;
  const typicalEdgesTotal = numSpokes * typicalEdgesPerSpoke + 2; // +2 for final boss (2× baseKm)
  const baseKm = Math.max(0.5, run.totalDistanceKm / typicalEdgesTotal);

  // Update runLength to equal the number of spokes so the final-boss
  // medal lock requires exactly one medal per biome.
  run.runLength = numSpokes;

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

  // Radial distances (in normalised [0,1] map space)
  const SPOKE_STEP   = 0.07;  // distance between consecutive spoke nodes
  const ISLAND_ENTRY = SPOKE_STEP * 4 + SPOKE_STEP * 0.8;  // entry just past s4
  const ISLAND_MID   = SPOKE_STEP * 4 + SPOKE_STEP * 1.6;  // fan-out row
  const ISLAND_PRE   = SPOKE_STEP * 4 + SPOKE_STEP * 2.4;  // converging node
  const ISLAND_BOSS  = SPOKE_STEP * 4 + SPOKE_STEP * 3.2;  // spoke tip

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

    const addEdge = (from: string, to: string, km: number, grade: number, surface: SurfaceType = 'asphalt') => {
      const edge: MapEdge = {
        from,
        to,
        profile: generateCourseProfile(km, grade, surface),
        isCleared: false,
      };
      edges.push(edge);
    };

    const findNode = (id: string) => nodes.find(n => n.id === id)!;

    // ── 2a. 4 Linear spoke nodes ────────────────────────────────────────────
    const spokeIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
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

    // ── 2b. 6-node Island mini-DAG ──────────────────────────────────────────
    const s4Id = spokeIds[3];
    const s4   = findNode(s4Id);

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

    const ieNode   = mkNode(ieId,   rTypes[0],  5, ISLAND_ENTRY,  0);
    const ilNode   = mkNode(ilId,   rTypes[1],  6, ISLAND_MID,   -0.05);
    const icNode   = mkNode(icId,   'shop',     6, ISLAND_MID,    0);
    const irNode   = mkNode(irId,   rTypes[2],  6, ISLAND_MID,    0.05);
    const ipNode   = mkNode(ipId,   rTypes[3],  7, ISLAND_PRE,   0);
    const bossNode = mkNode(bossId, 'boss',     8, ISLAND_BOSS,  0);

    nodes.push(ieNode, ilNode, icNode, irNode, ipNode, bossNode);

    // s4 → entry
    addEdge(s4Id, ieId, baseKm, 0.04);
    s4.connectedTo.push(ieId);

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

  edges.push({
    from: hubNode.id,
    to: finalBossNode.id,
    profile: generateCourseProfile(baseKm * 2, 0.10, 'asphalt'),
    isCleared: false,
  });
  hubNode.connectedTo.push(finalBossNode.id);

  run.nodes = nodes;
  run.edges = edges;
  run.currentNodeId = hubNode.id;
  run.visitedNodeIds = [hubNode.id];
}
