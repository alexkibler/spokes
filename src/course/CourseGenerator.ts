/**
 * CourseGenerator.ts
 *
 * Procedurally generates the Hub-and-Spoke map structure and course profiles.
 */

import { generateCourseProfile, type SurfaceType } from './CourseProfile';
import type { RunData, MapNode, MapEdge } from '../roguelike/RunState';

export const SPOKE_IDS = ['plains', 'coast', 'mountain', 'forest'] as const;
export type SpokeId = typeof SPOKE_IDS[number];

const SPOKE_CONFIG: Record<SpokeId, {
  label: string;
  angle: number; // Visual angle in radians (0 = right, PI/2 = down, etc.)
  color: number;
  hazardSurface: SurfaceType;
  hazardGrade: number; // Max grade for hazard
}> = {
  plains:   { label: 'Plains',   angle: 0,           color: 0x88cc44, hazardSurface: 'asphalt', hazardGrade: 0.00 }, // No inherent hazard surface, but maybe wind? Using default for now.
  coast:    { label: 'Coast',    angle: Math.PI / 2, color: 0x4488cc, hazardSurface: 'mud',     hazardGrade: 0.02 }, // Mud hazard
  mountain: { label: 'Mountain', angle: -Math.PI / 2, color: 0xcc4444, hazardSurface: 'gravel',  hazardGrade: 0.15 }, // Steep grade hazard
  forest:   { label: 'Forest',   angle: Math.PI,     color: 0x228844, hazardSurface: 'dirt',    hazardGrade: 0.08 }, // Rough surface hazard
};

export function generateHubAndSpokeMap(run: RunData): void {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // 1. Create HUB
  const hubNode: MapNode = {
    id: 'node_hub',
    type: 'start', // 'start' acts as the Hub
    floor: 0,
    col: 0,
    x: 0.5,
    y: 0.5,
    connectedTo: [],
  };
  nodes.push(hubNode);

  // Scale distances
  // Map "runLength" (floors) to number of Spokes.
  // Example: Short (20) -> 2 spokes. Long (80) -> 8 spokes.
  const numSpokes = Math.max(2, Math.min(8, Math.round(run.runLength / 10)));

  // Each spoke path is roughly 8 edges deep (4 linear + ~4 island path).
  // Total edges in a full run = numSpokes * 8.
  const totalEdges = numSpokes * 8;
  const baseKm = Math.max(2, run.totalDistanceKm / totalEdges);

  // 2. Generate Spokes
  for (let i = 0; i < numSpokes; i++) {
    const spokeId = SPOKE_IDS[i % SPOKE_IDS.length];
    const config = SPOKE_CONFIG[spokeId];
    // Distribute spokes evenly around the circle
    const angle = (i * 2 * Math.PI) / numSpokes;
    const radiusStep = 0.08; // Tighter packing for more nodes

    // ── Spoke Part (4 Linear Nodes) ─────────────────────────────────────────
    // Node 1 is the "Hazard Entry" from Hub.

    let lastNodeId = hubNode.id;
    let currentRadius = radiusStep;

    // 4 Linear Nodes
    for (let k = 1; k <= 4; k++) {
      const nodeId = `node_${i}_spoke_${k}`;
      const isStart = k === 1;

      const node: MapNode = {
        id: nodeId,
        type: 'standard', // Could vary difficulty here
        floor: k,
        col: 0,
        x: 0.5 + Math.cos(angle) * currentRadius,
        y: 0.5 + Math.sin(angle) * currentRadius,
        connectedTo: [],
        metadata: { spokeId }
      };
      nodes.push(node);

      // Connect from previous
      edges.push({
        from: lastNodeId,
        to: nodeId,
        // First edge is hazard, others are standard
        profile: isStart
          ? generateCourseProfile(baseKm, config.hazardGrade, config.hazardSurface)
          : generateCourseProfile(baseKm, 0.05, 'asphalt'),
        isCleared: false
      });

      // Update previous node's connected list
      const prevNode = nodes.find(n => n.id === lastNodeId);
      if (prevNode) prevNode.connectedTo.push(nodeId);

      lastNodeId = nodeId;
      currentRadius += radiusStep;
    }

    // ── Island Part (6 Interconnected Nodes) ────────────────────────────────
    // Topology:
    //           /-> Mid1 -> Shop -\
    // Entry(5)                     -> Boss(10)
    //           \-> Mid2 -> Rand -/

    // Node 5: Island Entry
    const islandEntryId = `node_${i}_island_entry`;
    const islandEntry: MapNode = {
      id: islandEntryId,
      type: 'standard',
      floor: 5,
      col: 0,
      x: 0.5 + Math.cos(angle) * currentRadius,
      y: 0.5 + Math.sin(angle) * currentRadius,
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(islandEntry);

    // Connect Spoke End -> Island Entry
    edges.push({
      from: lastNodeId,
      to: islandEntryId,
      profile: generateCourseProfile(baseKm, 0.05, 'asphalt'),
      isCleared: false
    });
    const spokeEnd = nodes.find(n => n.id === lastNodeId);
    if (spokeEnd) spokeEnd.connectedTo.push(islandEntryId);

    currentRadius += radiusStep;

    // Island Width Angle Offset
    const widthOffset = 0.15 * (2 * Math.PI / numSpokes); // Spread island nodes a bit

    // Layer 1: Mid1 (Top) & Mid2 (Bottom)
    const mid1Id = `node_${i}_island_mid_1`;
    const mid2Id = `node_${i}_island_mid_2`;

    const mid1: MapNode = {
      id: mid1Id,
      type: 'event', // Mix it up
      floor: 6,
      col: 0,
      x: 0.5 + Math.cos(angle - widthOffset) * currentRadius,
      y: 0.5 + Math.sin(angle - widthOffset) * currentRadius,
      connectedTo: [],
      metadata: { spokeId }
    };
    const mid2: MapNode = {
      id: mid2Id,
      type: 'hard',
      floor: 6,
      col: 0,
      x: 0.5 + Math.cos(angle + widthOffset) * currentRadius,
      y: 0.5 + Math.sin(angle + widthOffset) * currentRadius,
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(mid1, mid2);

    // Connect Entry -> Mid1 & Mid2
    [mid1Id, mid2Id].forEach(target => {
      edges.push({ from: islandEntryId, to: target, profile: generateCourseProfile(baseKm, 0.06, 'asphalt'), isCleared: false });
      islandEntry.connectedTo.push(target);
    });

    currentRadius += radiusStep;

    // Layer 2: Pre-Boss (Shop & Random)
    const pre1Id = `node_${i}_island_pre_1`;
    const pre2Id = `node_${i}_island_pre_2`;

    // Randomize which is shop
    const isPre1Shop = Math.random() > 0.5;

    const pre1: MapNode = {
      id: pre1Id,
      type: isPre1Shop ? 'shop' : 'standard',
      floor: 7,
      col: 0,
      x: 0.5 + Math.cos(angle - widthOffset) * currentRadius,
      y: 0.5 + Math.sin(angle - widthOffset) * currentRadius,
      connectedTo: [],
      metadata: { spokeId }
    };
    const pre2: MapNode = {
      id: pre2Id,
      type: !isPre1Shop ? 'shop' : 'hard',
      floor: 7,
      col: 0,
      x: 0.5 + Math.cos(angle + widthOffset) * currentRadius,
      y: 0.5 + Math.sin(angle + widthOffset) * currentRadius,
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(pre1, pre2);

    // Connect Mid1 -> Pre1 & Pre2 (Cross connections)
    // Connect Mid2 -> Pre1 & Pre2
    // Actually let's just do parallel + cross? Or just full mesh?
    // Let's do Mid1 -> Pre1, Mid1 -> Pre2. And Mid2 -> Pre1, Mid2 -> Pre2.
    // This gives maximum choice.
    [mid1, mid2].forEach(mid => {
      [pre1Id, pre2Id].forEach(target => {
        edges.push({ from: mid.id, to: target, profile: generateCourseProfile(baseKm, 0.07, 'asphalt'), isCleared: false });
        mid.connectedTo.push(target);
      });
    });

    currentRadius += radiusStep;

    // Node 10: Boss
    const bossId = `node_${i}_boss`;
    const bossNode: MapNode = {
      id: bossId,
      type: 'boss',
      floor: 8,
      col: 0,
      x: 0.5 + Math.cos(angle) * currentRadius,
      y: 0.5 + Math.sin(angle) * currentRadius,
      connectedTo: [],
      metadata: { spokeId } // Critical for reward logic
    };
    nodes.push(bossNode);

    // Connect Pre1 & Pre2 -> Boss
    [pre1, pre2].forEach(pre => {
      edges.push({ from: pre.id, to: bossId, profile: generateCourseProfile(baseKm * 1.5, 0.10, 'asphalt'), isCleared: false });
      pre.connectedTo.push(bossId);
    });
  }

  // 3. Final Boss Node
  // Connected directly to Hub, but "locked" until medals are collected.
  // We place it visually in the center but slightly offset or distinct?
  // Maybe "above" the hub? Or just a special distinct star.
  // Let's put it at angle -PI/4 (top-right diagonal) but close.
  const finalAngle = -Math.PI / 4;
  const finalDist = 0.2; // Between hub and spoke starts

  const finalBossId = 'node_final_boss';
  const finalBossNode: MapNode = {
    id: finalBossId,
    type: 'finish',
    floor: 99,
    col: 0,
    x: 0.5 + Math.cos(finalAngle) * finalDist,
    y: 0.5 + Math.sin(finalAngle) * finalDist,
    connectedTo: [],
  };
  nodes.push(finalBossNode);

  // Edge: Hub -> Final Boss
  edges.push({
    from: hubNode.id,
    to: finalBossId,
    profile: generateCourseProfile(baseKm * 2, 0.10, 'asphalt'), // Grand Criterium approach
    isCleared: false
  });
  hubNode.connectedTo.push(finalBossId);

  // Connect spokes back to Hub?
  // The instructions say "Defeating a Spoke Boss ... teleports the player back to the HUB."
  // So we don't need explicit edges back.

  run.nodes = nodes;
  run.edges = edges;
  run.currentNodeId = hubNode.id;
  run.visitedNodeIds = [hubNode.id];
}
