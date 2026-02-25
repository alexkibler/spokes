/**
 * SaveManager.test.ts
 *
 * Unit tests for SaveManager.
 * Tests schema versioning and content pruning logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager } from '../SaveManager';
import { IStorageProvider } from '../storage/IStorageProvider';
import { RunData } from '../../roguelike/RunManager';
import { FitWriter } from '../../fit/FitWriter';
import type { ContentRegistry } from '../../roguelike/registry/ContentRegistry';

const MOCK_ITEMS: Record<string, { id: string; label: string }> = {
  valid_item:   { id: 'valid_item',   label: 'Valid Item' },
  valid_helmet: { id: 'valid_helmet', label: 'Valid Helmet' },
};

const mockContentRegistry = {
  getItem: (id: string) => MOCK_ITEMS[id],
} as unknown as ContentRegistry;

// Mock Storage Provider
class MockStorageProvider implements IStorageProvider {
  store: Record<string, string> = {};
  async getItem(key: string): Promise<string | null> {
    return this.store[key] || null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.store[key] = value;
  }
  async removeItem(key: string): Promise<void> {
    delete this.store[key];
  }
}

describe('SaveManager', () => {
  let storage: MockStorageProvider;
  let manager: SaveManager;

  const validRunData: RunData = {
    gold: 100,
    inventory: ['valid_item'],
    equipped: { helmet: 'valid_helmet' },
    currentNodeId: 'node-1',
    visitedNodeIds: ['node-1'],
    activeEdge: null,
    nodes: [],
    edges: [],
    runLength: 5,
    totalDistanceKm: 20,
    difficulty: 'normal',
    ftpW: 200,
    weightKg: 70,
    units: 'metric',
    isRealTrainerRun: false,
    modifiers: { powerMult: 1, dragReduction: 0, weightMult: 1, crrMult: 1 }, // transient
    modifierLog: [], // transient
    pendingNodeAction: null, // transient
    stats: { totalMapDistanceM: 0, totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
    fitWriter: {} as FitWriter, // Mock fitWriter
  };

  beforeEach(() => {
    storage = new MockStorageProvider();
    manager = new SaveManager(storage, mockContentRegistry);
  });

  it('saves and loads a valid run', async () => {
    await manager.saveRun(validRunData);
    const loaded = await manager.loadRun();
    expect(loaded).not.toBeNull();
    expect(loaded?.runData.gold).toBe(100);
    expect(loaded?.version).toBe(4);
  });

  it('discards saves with mismatched schema version', async () => {
    const oldSave = {
      version: 1,
      savedAt: new Date().toISOString(),
      runData: { ...validRunData },
    };
    await storage.setItem('paperPeloton_runSave', JSON.stringify(oldSave));

    const result = await manager.loadResult();
    expect(result.save).toBeNull();
    expect(result.wasIncompatible).toBe(true);

    // Should clear the incompatible save
    expect(await storage.getItem('paperPeloton_runSave')).toBeNull();
  });

  it('prunes invalid items from inventory', async () => {
    const invalidInvRun = { ...validRunData, inventory: ['valid_item', 'deleted_item'] };
    await manager.saveRun(invalidInvRun);

    // Simulate invalid data by mocking storage retrieval?
    // saveRun saves what is passed. If we assume 'deleted_item' is NOT in registry (which it isn't in mock),
    // loadRun should prune it.

    const loaded = await manager.loadRun();
    expect(loaded?.runData.inventory).toContain('valid_item');
    expect(loaded?.runData.inventory).not.toContain('deleted_item');
  });

  it('prunes invalid items from equipped slots', async () => {
    const invalidEquipRun = { ...validRunData, equipped: { helmet: 'deleted_helmet', frame: 'valid_item' } };
    // valid_item is in registry. 'deleted_helmet' is not.
    // 'frame' slot has 'valid_item'. 'valid_item' exists in registry.
    // The validator checks existence in registry.

    await manager.saveRun(invalidEquipRun);

    const loaded = await manager.loadRun();
    expect(loaded?.runData.equipped.helmet).toBeUndefined();
    // 'valid_item' exists in the mock ContentRegistry, so it stays.
    // 'valid_item' is in registry.
    expect(loaded?.runData.equipped.frame).toBe('valid_item');
  });
});
