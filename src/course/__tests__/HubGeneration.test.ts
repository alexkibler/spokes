import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateHubAndSpokeMap, computeNumSpokes } from '../CourseGenerator';
import { RunStateManager } from '../../roguelike/RunState';

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { store = {}; },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// ─── computeNumSpokes ─────────────────────────────────────────────────────────

describe('computeNumSpokes', () => {
  it('returns minimum 2 for very short distances', () => {
    expect(computeNumSpokes(1)).toBe(2);
    expect(computeNumSpokes(10)).toBe(2);
    expect(computeNumSpokes(24)).toBe(2);
  });

  it('scales up with distance', () => {
    expect(computeNumSpokes(75)).toBe(2);   // round(75/50)=2 -> clamp(2)=2
    expect(computeNumSpokes(125)).toBe(3);  // round(125/50)=3
    expect(computeNumSpokes(175)).toBe(4);  // round(175/50)=4 -> same as old default
    expect(computeNumSpokes(250)).toBe(5);
  });

  it('returns maximum 8 for very long distances', () => {
    expect(computeNumSpokes(400)).toBe(8);
    expect(computeNumSpokes(1000)).toBe(8);
  });
});

// ─── generateHubAndSpokeMap ───────────────────────────────────────────────────

describe('generateHubAndSpokeMap', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('generates a hub and final boss', () => {
    const run = RunStateManager.startNewRun(2, 20, 'normal');
    generateHubAndSpokeMap(run);

    const hub = run.nodes.find(n => n.id === 'node_hub');
    expect(hub).toBeDefined();
    expect(hub?.type).toBe('start');

    const finalBoss = run.nodes.find(n => n.type === 'finish');
    expect(finalBoss).toBeDefined();
    expect(finalBoss?.id).toBe('node_final_boss');
  });

  it('generates 2 spokes for a 20 km run', () => {
    const run = RunStateManager.startNewRun(2, 20, 'normal');
    generateHubAndSpokeMap(run);

    const numSpokes = computeNumSpokes(20); // 2
    expect(numSpokes).toBe(2);

    // Hub connects to numSpokes spoke-starts + final boss
    const hub = run.nodes.find(n => n.id === 'node_hub')!;
    expect(hub.connectedTo.length).toBe(numSpokes + 1);

    // Each spoke has 4 linear + 6 island = 10 nodes
    const bossNodes = run.nodes.filter(n => n.type === 'boss');
    expect(bossNodes.length).toBe(numSpokes);
  });

  it('generates exactly 10 nodes per spoke (4 linear + 6 island)', () => {
    const run = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const numSpokes = computeNumSpokes(200); // 4

    // Total nodes = 1 hub + numSpokes*10 + 1 final boss
    expect(run.nodes.length).toBe(1 + numSpokes * 10 + 1);
  });

  it('each island contains exactly 1 shop and 1 boss', () => {
    const run = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const numSpokes = computeNumSpokes(200);
    const shopNodes = run.nodes.filter(n => n.type === 'shop');
    const bossNodes = run.nodes.filter(n => n.type === 'boss');

    expect(shopNodes.length).toBe(numSpokes);
    expect(bossNodes.length).toBe(numSpokes);
  });

  it('island random nodes use only standard/event/hard types', () => {
    const run = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const islandRandomNodes = run.nodes.filter(n =>
      n.floor >= 5 && n.floor <= 7 && n.type !== 'shop'
    );
    const allowedTypes = ['standard', 'event', 'hard'];
    islandRandomNodes.forEach(node => {
      expect(allowedTypes).toContain(node.type);
    });
  });

  it('all boss nodes have spokeId metadata', () => {
    const run = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const bossNodes = run.nodes.filter(n => n.type === 'boss');
    bossNodes.forEach(b => {
      expect(b.metadata).toBeDefined();
      expect(b.metadata?.spokeId).toBeDefined();
    });
  });

  it('sets runLength equal to the number of spokes', () => {
    const run = RunStateManager.startNewRun(99, 100, 'normal');
    generateHubAndSpokeMap(run);

    const expected = computeNumSpokes(100);
    expect(run.runLength).toBe(expected);
  });

  it('scales up to 8 spokes for a 400 km run', () => {
    const run = RunStateManager.startNewRun(8, 400, 'normal');
    generateHubAndSpokeMap(run);

    expect(run.runLength).toBe(8);
    const bossNodes = run.nodes.filter(n => n.type === 'boss');
    expect(bossNodes.length).toBe(8);
  });

  it('baseKm scales proportionally with totalDistanceKm', () => {
    const shortRun = RunStateManager.startNewRun(2, 50, 'normal');
    generateHubAndSpokeMap(shortRun);

    const longRun = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(longRun);

    // Find the hub→s1 edge for a spoke in each run and compare distances
    const shortEdge = shortRun.edges.find(e => e.from === 'node_hub')!;
    const longEdge  = longRun.edges.find(e => e.from === 'node_hub')!;

    // Long run should have longer edge distances
    expect(longEdge.profile.totalDistanceM).toBeGreaterThan(shortEdge.profile.totalDistanceM);
  });

  it('all edges connect nodes that exist in the node list', () => {
    const run = RunStateManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const nodeIds = new Set(run.nodes.map(n => n.id));
    run.edges.forEach(edge => {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    });
  });
});
