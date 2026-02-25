/**
 * SaveManager.ts
 *
 * Manages persistence of roguelike runs using an injected storage provider.
 * Handles serialization, versioning, and content validation.
 */

import { IStorageProvider } from './storage/IStorageProvider';
import type { RunData, MapNode, MapEdge, EquipmentSlot } from '../roguelike/RunManager';
import type { ContentRegistry } from '../roguelike/registry/ContentRegistry';
import type { Units } from '../scenes/MenuScene';

const SAVE_KEY = 'paperPeloton_runSave';
const SCHEMA_VERSION = 4; // Bumped from 3 (old static service)

/** RunData fields that are safe to JSON-serialize (excludes fitWriter) */
export interface SerializedRunData {
  gold: number;
  inventory: string[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  currentNodeId: string;
  visitedNodeIds: string[];
  activeEdge: null; // always null — never save mid-ride state
  nodes: MapNode[];
  edges: MapEdge[];
  runLength: number;
  totalDistanceKm: number;
  difficulty: 'easy' | 'normal' | 'hard';
  ftpW: number;
  weightKg: number;
  units: Units;
  isRealTrainerRun: boolean;
}

export interface SavedRun {
  version: number;
  savedAt: string; // ISO date string
  runData: SerializedRunData;
}

export interface SaveResult {
  save: SavedRun | null;
  wasIncompatible: boolean;
}

export class SaveManager {
  private storage: IStorageProvider;
  private contentRegistry: ContentRegistry;

  constructor(storage: IStorageProvider, contentRegistry: ContentRegistry) {
    this.storage = storage;
    this.contentRegistry = contentRegistry;
  }

  /**
   * Persists the current run state.
   */
  async saveRun(run: RunData, settings?: { weightKg: number; units: Units }): Promise<void> {
    try {
      // Use settings if provided, otherwise fallback to run data
      const weightKg = settings?.weightKg ?? run.weightKg;
      const units = settings?.units ?? run.units;

      const serialized: SerializedRunData = {
        gold: run.gold,
        inventory: [...run.inventory],
        equipped: { ...run.equipped },
        currentNodeId: run.currentNodeId,
        visitedNodeIds: [...run.visitedNodeIds],
        activeEdge: null,
        nodes: run.nodes,
        edges: run.edges,
        runLength: run.runLength,
        totalDistanceKm: run.totalDistanceKm,
        difficulty: run.difficulty,
        ftpW: run.ftpW,
        weightKg,
        units,
        isRealTrainerRun: run.isRealTrainerRun,
      };

      const saved: SavedRun = {
        version: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        runData: serialized,
      };

      await this.storage.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn('[SaveManager] Failed to save run:', err);
    }
  }

  /**
   * Loads the saved run, validating schema version and content integrity.
   */
  async loadRun(): Promise<SavedRun | null> {
    const result = await this.loadResult();
    return result.save;
  }

  /**
   * Loads the save and reports incompatibility.
   */
  async loadResult(): Promise<SaveResult> {
    try {
      const raw = await this.storage.getItem(SAVE_KEY);
      if (!raw) return { save: null, wasIncompatible: false };

      const parsed = JSON.parse(raw) as SavedRun;

      // 1. Schema Version Check
      if (typeof parsed.version !== 'number' || parsed.version !== SCHEMA_VERSION) {
        console.warn(
          `[SaveManager] Save schema mismatch (saved v${parsed.version}, current v${SCHEMA_VERSION}). Discarding.`
        );
        await this.clearSave();
        return { save: null, wasIncompatible: true };
      }

      // 2. Content Validation (Pruning)
      // Validate Inventory
      parsed.runData.inventory = parsed.runData.inventory.filter((itemId) => {
        const exists = !!this.contentRegistry.getItem(itemId);
        if (!exists) {
          console.warn(`[SaveManager] Pruning missing item from inventory: ${itemId}`);
        }
        return exists;
      });

      // Validate Equipped
      const equipped = parsed.runData.equipped;
      for (const slot of Object.keys(equipped)) {
        const itemId = equipped[slot as EquipmentSlot];
        if (itemId && !this.contentRegistry.getItem(itemId)) {
          console.warn(`[SaveManager] Pruning missing item from slot ${slot}: ${itemId}`);
          delete equipped[slot as EquipmentSlot];
        }
      }

      return { save: parsed, wasIncompatible: false };
    } catch (err) {
      console.warn('[SaveManager] Failed to load save:', err);
      return { save: null, wasIncompatible: false };
    }
  }

  async clearSave(): Promise<void> {
    await this.storage.removeItem(SAVE_KEY);
  }

  async hasSave(): Promise<boolean> {
    const run = await this.loadRun();
    return run !== null;
  }
}
