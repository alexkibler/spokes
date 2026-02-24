import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateHubAndSpokeMap } from '../CourseGenerator';
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

describe('generateHubAndSpokeMap', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('generates a hub, 4 spokes, and a final boss', () => {
    // Mock run data (runLength 40 -> 4 spokes)
    const run = RunStateManager.startNewRun(40, 20, 'normal');

    generateHubAndSpokeMap(run);

    expect(run.nodes.length).toBeGreaterThan(0);
    const hub = run.nodes.find(n => n.id === 'node_hub');
    expect(hub).toBeDefined();

    // Check spokes (Plains, Coast, Mountain, Forest)
    // New naming convention: node_{i}_spoke_1
    const spokeStarts = run.nodes.filter(n => n.id.match(/_spoke_1$/));
    expect(spokeStarts.length).toBe(4);

    // Check connections
    // Hub connects to 4 spoke starts + final boss = 5
    expect(hub?.connectedTo.length).toBe(5);

    // Check hazard edges
    const edgesFromHub = run.edges.filter(e => e.from === 'node_hub');
    expect(edgesFromHub.length).toBe(5);

    // Check Final Boss
    const finalBoss = run.nodes.find(n => n.type === 'finish');
    expect(finalBoss).toBeDefined();
    expect(finalBoss?.id).toBe('node_final_boss');

    // Check metadata on boss nodes
    const bosses = run.nodes.filter(n => n.type === 'boss');
    expect(bosses.length).toBe(4);
    bosses.forEach(b => {
        expect(b.metadata).toBeDefined();
        expect(b.metadata?.spokeId).toBeDefined();
    });
  });
});
