/**
 * SaveService.test.ts
 *
 * Unit tests for SaveService – persists roguelike RunData to localStorage.
 *
 * localStorage is stubbed with an in-memory Map so the tests run in node env.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveService } from '../SaveService';
import type { RunData } from '../../roguelike/RunState';
import { FitWriter } from '../../fit/FitWriter';

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear:      () => { store = {}; },
    // Expose raw store for inspection in tests
    _store: () => store,
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// ─── Minimal RunData fixture ──────────────────────────────────────────────────

function makeRunData(overrides: Partial<RunData> = {}): RunData {
  return {
    gold: 50,
    inventory: ['tailwind'],
    modifiers: { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 },
    modifierLog: [],
    currentNodeId: 'node-3',
    visitedNodeIds: ['node-1', 'node-2', 'node-3'],
    activeEdge: null,
    pendingNodeAction: null,
    nodes: [],
    edges: [],
    runLength: 4,
    totalDistanceKm: 20,
    difficulty: 'normal',
    ftpW: 220,
    weightKg: 72,
    units: 'metric',
    fitWriter: new FitWriter(Date.now()),
    stats: { totalRiddenDistanceM: 5000, totalRecordCount: 300, totalPowerSum: 60000, totalCadenceSum: 27000 },
    ...overrides,
  };
}

// ─── SaveService.save ─────────────────────────────────────────────────────────

describe('SaveService.save', () => {
  beforeEach(() => localStorageMock.clear());

  it('writes a key to localStorage', () => {
    SaveService.save(makeRunData(), 72, 'metric');
    const keys = Object.keys(localStorageMock._store());
    expect(keys.length).toBeGreaterThan(0);
  });

  it('stores gold correctly', () => {
    SaveService.save(makeRunData({ gold: 99 }), 72, 'metric');
    const saved = SaveService.load();
    expect(saved?.runData.gold).toBe(99);
  });

  it('stores inventory correctly', () => {
    SaveService.save(makeRunData({ inventory: ['gel', 'tailwind'] }), 72, 'metric');
    const saved = SaveService.load();
    expect(saved?.runData.inventory).toEqual(['gel', 'tailwind']);
  });

  it('stores currentNodeId correctly', () => {
    SaveService.save(makeRunData({ currentNodeId: 'xyz' }), 72, 'metric');
    expect(SaveService.load()?.runData.currentNodeId).toBe('xyz');
  });

  it('stores visitedNodeIds correctly', () => {
    SaveService.save(makeRunData({ visitedNodeIds: ['a', 'b'] }), 72, 'metric');
    expect(SaveService.load()?.runData.visitedNodeIds).toEqual(['a', 'b']);
  });

  it('always stores activeEdge as null (never persists mid-ride state)', () => {
    SaveService.save(makeRunData(), 72, 'metric');
    expect(SaveService.load()?.runData.activeEdge).toBeNull();
  });

  it('stores the correct schema version', () => {
    SaveService.save(makeRunData(), 72, 'metric');
    expect(SaveService.load()?.version).toBe(1);
  });

  it('stores a savedAt ISO date string', () => {
    SaveService.save(makeRunData(), 72, 'metric');
    const savedAt = SaveService.load()?.savedAt;
    expect(typeof savedAt).toBe('string');
    expect(() => new Date(savedAt!).getTime()).not.toThrow();
    expect(isNaN(new Date(savedAt!).getTime())).toBe(false);
  });

  it('stores difficulty correctly', () => {
    SaveService.save(makeRunData({ difficulty: 'hard' }), 72, 'metric');
    expect(SaveService.load()?.runData.difficulty).toBe('hard');
  });

  it('stores ftpW correctly', () => {
    SaveService.save(makeRunData({ ftpW: 300 }), 72, 'metric');
    expect(SaveService.load()?.runData.ftpW).toBe(300);
  });

  it('uses the supplied weightKg (not the one in RunData)', () => {
    const run = makeRunData({ weightKg: 99 }); // RunData.weightKg = 99
    SaveService.save(run, 75, 'imperial');      // explicit weightKg = 75
    expect(SaveService.load()?.runData.weightKg).toBe(75);
  });

  it('uses the supplied units', () => {
    SaveService.save(makeRunData({ units: 'metric' }), 68, 'imperial');
    expect(SaveService.load()?.runData.units).toBe('imperial');
  });

  it('overwrites a previous save with the new data', () => {
    SaveService.save(makeRunData({ gold: 10 }), 68, 'metric');
    SaveService.save(makeRunData({ gold: 200 }), 68, 'metric');
    expect(SaveService.load()?.runData.gold).toBe(200);
  });
});

// ─── SaveService.load ─────────────────────────────────────────────────────────

describe('SaveService.load', () => {
  beforeEach(() => localStorageMock.clear());

  it('returns null when no save exists', () => {
    expect(SaveService.load()).toBeNull();
  });

  it('returns the saved data after a successful save', () => {
    SaveService.save(makeRunData(), 72, 'metric');
    expect(SaveService.load()).not.toBeNull();
  });

  it('returns null when stored JSON is corrupted', () => {
    localStorageMock.setItem('paperPeloton_runSave', '{bad json}');
    expect(SaveService.load()).toBeNull();
  });

  it('returns null when schema version does not match', () => {
    // Manually store a save with a different version number
    const badSave = JSON.stringify({
      version: 99,
      savedAt: new Date().toISOString(),
      runData: { gold: 0 },
    });
    localStorageMock.setItem('paperPeloton_runSave', badSave);
    expect(SaveService.load()).toBeNull();
  });
});

// ─── SaveService.clear ────────────────────────────────────────────────────────

describe('SaveService.clear', () => {
  beforeEach(() => localStorageMock.clear());

  it('removes the save so load() returns null', () => {
    SaveService.save(makeRunData(), 68, 'metric');
    SaveService.clear();
    expect(SaveService.load()).toBeNull();
  });

  it('does not throw when no save exists', () => {
    expect(() => SaveService.clear()).not.toThrow();
  });
});

// ─── SaveService.hasSave ──────────────────────────────────────────────────────

describe('SaveService.hasSave', () => {
  beforeEach(() => localStorageMock.clear());

  it('returns false when no save exists', () => {
    expect(SaveService.hasSave()).toBe(false);
  });

  it('returns true after a successful save', () => {
    SaveService.save(makeRunData(), 68, 'metric');
    expect(SaveService.hasSave()).toBe(true);
  });

  it('returns false after clear()', () => {
    SaveService.save(makeRunData(), 68, 'metric');
    SaveService.clear();
    expect(SaveService.hasSave()).toBe(false);
  });
});
