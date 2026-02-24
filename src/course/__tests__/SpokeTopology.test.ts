import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateHubAndSpokeMap } from '../CourseGenerator';
import { RunStateManager } from '../../roguelike/RunState';

// Mock localStorage if needed (RunStateManager uses it)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('SpokeTopology', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('generates minimum 2 spokes for short run', () => {
    // RunLength 20 / 10 = 2
    const run = RunStateManager.startNewRun(20, 30, 'normal');
    generateHubAndSpokeMap(run);

    const hub = run.nodes.find(n => n.id === 'node_hub');
    // Hub connects to spokes + final boss. So 2 + 1 = 3 connections.
    expect(hub?.connectedTo.length).toBe(3);

    // Check nodes for spoke 0 and 1
    const spoke0Nodes = run.nodes.filter(n => n.id.startsWith('node_0_'));
    expect(spoke0Nodes.length).toBeGreaterThan(0);
    const spoke1Nodes = run.nodes.filter(n => n.id.startsWith('node_1_'));
    expect(spoke1Nodes.length).toBeGreaterThan(0);
    const spoke2Nodes = run.nodes.filter(n => n.id.startsWith('node_2_'));
    expect(spoke2Nodes.length).toBe(0);
  });

  it('generates maximum 8 spokes for very long run', () => {
    // RunLength 100 / 10 = 10 -> capped at 8
    const run = RunStateManager.startNewRun(100, 100, 'normal');
    generateHubAndSpokeMap(run);

    const hub = run.nodes.find(n => n.id === 'node_hub');
    expect(hub?.connectedTo.length).toBe(9); // 8 spokes + 1 final boss
  });

  it('generates correct spoke structure (4 linear + 6 island)', () => {
    const run = RunStateManager.startNewRun(10, 20, 'normal'); // 1 spoke? min 2
    generateHubAndSpokeMap(run);

    // Check spoke 0
    // Linear nodes: node_0_spoke_1 to node_0_spoke_4
    for (let k = 1; k <= 4; k++) {
      const node = run.nodes.find(n => n.id === `node_0_spoke_${k}`);
      expect(node).toBeDefined();
      expect(node?.type).toBe('standard');
    }

    // Island nodes
    const islandEntry = run.nodes.find(n => n.id === 'node_0_island_entry');
    expect(islandEntry).toBeDefined();

    const mid1 = run.nodes.find(n => n.id === 'node_0_island_mid_1');
    const mid2 = run.nodes.find(n => n.id === 'node_0_island_mid_2');
    expect(mid1).toBeDefined();
    expect(mid2).toBeDefined();

    const pre1 = run.nodes.find(n => n.id === 'node_0_island_pre_1');
    const pre2 = run.nodes.find(n => n.id === 'node_0_island_pre_2');
    expect(pre1).toBeDefined();
    expect(pre2).toBeDefined();

    // Check types for pre-boss nodes: exactly one shop
    const shopCount = [pre1, pre2].filter(n => n?.type === 'shop').length;
    expect(shopCount).toBe(1);

    const boss = run.nodes.find(n => n.id === 'node_0_boss');
    expect(boss).toBeDefined();
    expect(boss?.type).toBe('boss');
    expect(boss?.metadata?.spokeId).toBeDefined();

    // Check total nodes per spoke = 10
    const spoke0Nodes = run.nodes.filter(n => n.id.startsWith('node_0_'));
    expect(spoke0Nodes.length).toBe(10);
  });
});
