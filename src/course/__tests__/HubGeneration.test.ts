import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  generateHubAndSpokeMap, 
  computeNumSpokes,
  NODES_PER_SPOKE,
  KM_PER_SPOKE
} from '../CourseGenerator';
import { RunManager } from '../../roguelike/RunState';

// Mock Phaser.Events.EventEmitter to avoid loading Phaser in Node
vi.mock('phaser', () => {
  class EventEmitter {
    events: Record<string, Function[]> = {};
    emit(event: string, ...args: any[]) {
      if (this.events[event]) {
        this.events[event].forEach(fn => fn(...args));
      }
      return true;
    }
    on(event: string, fn: Function) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(fn);
      return this;
    }
    off() { return this; }
  }
  return {
    default: {
      Events: {
        EventEmitter
      }
    }
  };
});

// ─── computeNumSpokes ─────────────────────────────────────────────────────────

describe('computeNumSpokes', () => {
  it('returns minimum 2 for very short distances', () => {
    expect(computeNumSpokes(1)).toBe(2);
    expect(computeNumSpokes(10)).toBe(2);
    expect(computeNumSpokes(24)).toBe(2);
  });

  it('scales up with distance', () => {
    // Uses round(total / KM_PER_SPOKE)
    expect(computeNumSpokes(KM_PER_SPOKE * 1.5)).toBe(2);
    expect(computeNumSpokes(KM_PER_SPOKE * 2.5)).toBe(3);
    expect(computeNumSpokes(KM_PER_SPOKE * 3.5)).toBe(4);
    expect(computeNumSpokes(KM_PER_SPOKE * 5.0)).toBe(5);
  });

  it('returns maximum 8 for very long distances', () => {
    expect(computeNumSpokes(400)).toBe(8);
    expect(computeNumSpokes(1000)).toBe(8);
  });
});

// ─── generateHubAndSpokeMap ───────────────────────────────────────────────────

describe('generateHubAndSpokeMap', () => {
  let runManager: RunManager;

  beforeEach(() => {
    runManager = new RunManager();
  });

  it('generates a hub and final boss', () => {
    const run = runManager.startNewRun(2, 20, 'normal');
    generateHubAndSpokeMap(run);

    const hub = run.nodes.find(n => n.id === 'node_hub');
    expect(hub).toBeDefined();
    expect(hub?.type).toBe('start');

    const finalBoss = run.nodes.find(n => n.type === 'finish');
    expect(finalBoss).toBeDefined();
    expect(finalBoss?.id).toBe('node_final_boss');
  });

  it('generates 2 spokes for a 20 km run', () => {
    const run = runManager.startNewRun(2, 20, 'normal');
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

  it('generates exactly the expected nodes per spoke', () => {
    const run = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const numSpokes = computeNumSpokes(200);

    // Total nodes per biome = NODES_PER_SPOKE linear + 6 island
    const nodesPerBiome = NODES_PER_SPOKE + 6;

    // Total nodes = 1 hub + numSpokes*nodesPerBiome + 1 final boss
    expect(run.nodes.length).toBe(1 + numSpokes * nodesPerBiome + 1);
  });

  it('each island contains exactly 1 shop and 1 boss', () => {
    const run = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const numSpokes = computeNumSpokes(200);
    const shopNodes = run.nodes.filter(n => n.type === 'shop');
    const bossNodes = run.nodes.filter(n => n.type === 'boss');

    expect(shopNodes.length).toBe(numSpokes);
    expect(bossNodes.length).toBe(numSpokes);
  });

  it('island random nodes use only standard/event/hard types', () => {
    const run = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    // Random nodes are at floor: entry, mid, pre-boss.
    // Floor mappings:
    // Entry: NODES_PER_SPOKE + 1
    // Mid: NODES_PER_SPOKE + 2
    // Pre-boss: NODES_PER_SPOKE + 3
    const islandRandomNodes = run.nodes.filter(n =>
      n.floor >= NODES_PER_SPOKE + 1 && 
      n.floor <= NODES_PER_SPOKE + 3 && 
      n.type !== 'shop' &&
      n.type !== 'boss'
    );
    const allowedTypes = ['standard', 'event', 'hard'];
    islandRandomNodes.forEach(node => {
      expect(allowedTypes).toContain(node.type);
    });
  });

  it('all boss nodes have spokeId metadata', () => {
    const run = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const bossNodes = run.nodes.filter(n => n.type === 'boss');
    bossNodes.forEach(b => {
      expect(b.metadata).toBeDefined();
      expect(b.metadata?.spokeId).toBeDefined();
    });
  });

  it('sets runLength equal to the number of spokes', () => {
    const run = runManager.startNewRun(99, 100, 'normal');
    generateHubAndSpokeMap(run);

    const expected = computeNumSpokes(100);
    expect(run.runLength).toBe(expected);
  });

  it('scales up to 8 spokes for a 400 km run', () => {
    const run = runManager.startNewRun(8, 400, 'normal');
    generateHubAndSpokeMap(run);

    expect(run.runLength).toBe(8);
    const bossNodes = run.nodes.filter(n => n.type === 'boss');
    expect(bossNodes.length).toBe(8);
  });

  it('baseKm scales proportionally with totalDistanceKm', () => {
    const shortRun = runManager.startNewRun(2, 50, 'normal');
    generateHubAndSpokeMap(shortRun);

    const longRun = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(longRun);

    // Find the hub→s1 edge for a spoke in each run and compare distances
    const shortEdge = shortRun.edges.find(e => e.from === 'node_hub')!;
    const longEdge  = longRun.edges.find(e => e.from === 'node_hub')!;

    // Long run should have longer edge distances
    expect(longEdge.profile.totalDistanceM).toBeGreaterThan(shortEdge.profile.totalDistanceM);
  });

  it('all edges connect nodes that exist in the node list', () => {
    const run = runManager.startNewRun(4, 200, 'normal');
    generateHubAndSpokeMap(run);

    const nodeIds = new Set(run.nodes.map(n => n.id));
    run.edges.forEach(edge => {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    });
  });
});
