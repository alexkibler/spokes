/**
 * CourseGenerator.ts
 *
 * Procedurally generates the Hub-and-Spoke map structure and course profiles.
 */

import { generateCourseProfile, type CourseProfile, type SurfaceType } from './CourseProfile';
import type { RunData, MapNode, MapEdge, NodeType } from '../roguelike/RunState';

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
  // Assume a "standard" run might do 2-4 spokes.
  // Let's make each spoke leg roughly (totalDistanceKm / 10) km long?
  // Or just fix them to reasonable values and use totalDistanceKm as a multiplier.
  const baseKm = Math.max(2, run.totalDistanceKm / 10);

  // 2. Generate Spokes
  SPOKE_IDS.forEach((spokeId) => {
    const config = SPOKE_CONFIG[spokeId];
    const angle = config.angle;
    const radiusStep = 0.12; // Visual distance step

    // Spoke Nodes: Start -> Shop -> Boss
    // The connection HUB -> Start is the "Hazard Edge"

    // Node 1: Spoke Start (Standard)
    const startId = `node_${spokeId}_start`;
    const startNode: MapNode = {
      id: startId,
      type: 'standard',
      floor: 1,
      col: 0, // Not strictly used for layout anymore
      x: 0.5 + Math.cos(angle) * radiusStep,
      y: 0.5 + Math.sin(angle) * radiusStep,
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(startNode);

    // Edge: Hub -> Start (Hazard Edge)
    // We generate the "BAD" profile by default.
    // Logic in MapScene/GameScene will override if player has item.
    edges.push({
      from: hubNode.id,
      to: startId,
      profile: generateCourseProfile(baseKm, config.hazardGrade, config.hazardSurface),
      isCleared: false
    });
    hubNode.connectedTo.push(startId);

    // Node 2: Shop
    const shopId = `node_${spokeId}_shop`;
    const shopNode: MapNode = {
      id: shopId,
      type: 'shop',
      floor: 2,
      col: 0,
      x: 0.5 + Math.cos(angle) * (radiusStep * 2),
      y: 0.5 + Math.sin(angle) * (radiusStep * 2),
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(shopNode);

    // Edge: Start -> Shop (Standard ride)
    edges.push({
      from: startId,
      to: shopId,
      profile: generateCourseProfile(baseKm, 0.05, 'asphalt'), // Standard easy/medium ride
      isCleared: false
    });
    startNode.connectedTo.push(shopId);

    // Node 3: Boss
    const bossId = `node_${spokeId}_boss`;
    const bossNode: MapNode = {
      id: bossId,
      type: 'boss',
      floor: 3,
      col: 0,
      x: 0.5 + Math.cos(angle) * (radiusStep * 3),
      y: 0.5 + Math.sin(angle) * (radiusStep * 3),
      connectedTo: [],
      metadata: { spokeId }
    };
    nodes.push(bossNode);

    // Edge: Shop -> Boss (Harder ride leading to boss)
    edges.push({
      from: shopId,
      to: bossId,
      profile: generateCourseProfile(baseKm * 1.5, 0.08, 'asphalt'),
      isCleared: false
    });
    shopNode.connectedTo.push(bossId);
  });

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
