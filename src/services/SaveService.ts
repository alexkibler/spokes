/**
 * SaveService.ts
 *
 * Persists roguelike RunData to localStorage so the player can resume a run
 * after a page refresh. FitWriter is excluded from serialization and recreated
 * fresh on load.
 */

import type { RunData, MapNode, MapEdge } from '../roguelike/RunState';
import type { Units } from '../scenes/MenuScene';

const SAVE_KEY = 'paperPeloton_runSave';
const SCHEMA_VERSION = 1;

/** RunData fields that are safe to JSON-serialize (excludes fitWriter) */
export interface SerializedRunData {
  gold: number;
  inventory: string[];
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
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as SavedRun;
      if (parsed.version !== SCHEMA_VERSION) {
        console.warn('[SaveService] Save schema mismatch, discarding save.');
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  static clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  static hasSave(): boolean {
    return SaveService.load() !== null;
  }
}
