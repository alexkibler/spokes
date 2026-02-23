/**
 * SaveService.ts
 *
 * Persists roguelike RunData to localStorage so the player can resume a run
 * after a page refresh. FitWriter is excluded from serialization and recreated
 * fresh on load.
 */

import type { RunData, MapNode, MapEdge, EquipmentSlot } from '../roguelike/RunState';
import type { Units } from '../scenes/MenuScene';

const SAVE_KEY = 'paperPeloton_runSave';

/**
 * Increment this whenever SerializedRunData gains a required field or its
 * shape changes in a backwards-incompatible way.  Old saves with a different
 * version are discarded and the player must start a fresh run.
 *
 * Future: replace the discard with a migration table keyed by (from, to) so
 * old saves can be transformed rather than thrown away. (see IDEAS.md)
 *
 * Version history:
 *   1 – initial schema
 *   2 – added equipped (Partial<Record<EquipmentSlot, string>>)
 *   3 – added isRealTrainerRun
 */
const SCHEMA_VERSION = 3;

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

export class SaveService {
  static save(run: RunData, weightKg: number, units: Units): void {
    try {
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

      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.warn('[SaveService] Failed to save run:', err);
    }
  }

  static load(): SavedRun | null {
    return SaveService.loadResult().save;
  }

  /**
   * Like load(), but also reports whether a save existed but was discarded
   * due to a schema version mismatch.  Use this when the caller needs to
   * surface a "your save was incompatible" message to the player.
   */
  static loadResult(): { save: SavedRun | null; wasIncompatible: boolean } {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { save: null, wasIncompatible: false };

      const parsed = JSON.parse(raw) as SavedRun;
      if (typeof parsed.version !== 'number' || parsed.version !== SCHEMA_VERSION) {
        console.warn(
          `[SaveService] Save schema mismatch (saved v${parsed.version}, current v${SCHEMA_VERSION}). Discarding.`,
        );
        SaveService.clear(); // remove the stale save so it doesn't surface again
        return { save: null, wasIncompatible: true };
      }

      return { save: parsed, wasIncompatible: false };
    } catch {
      return { save: null, wasIncompatible: false };
    }
  }

  static clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  static hasSave(): boolean {
    return SaveService.load() !== null;
  }
}
