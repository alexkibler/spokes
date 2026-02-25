/**
 * RunManager.ts
 *
 * Defines the data structures for the roguelike progression system.
 * Tracks player progress, currency, and the procedurally generated map.
 */

import type { CourseProfile } from '../course/CourseProfile';
import type { EliteChallenge } from './EliteChallenge';
import { FitWriter } from '../../fit/FitWriter';
import type { Units } from '../../scenes/MenuScene';
import Phaser from 'phaser';
import type { SavedRun } from '../../services/SaveManager';
import { ContentRegistry } from './registry/ContentRegistry';
import { EquipmentSlot, RunModifiers } from './registry/types';

export type { EquipmentSlot, RunModifiers };

export type NodeType = 'start' | 'standard' | 'hard' | 'shop' | 'event' | 'elite' | 'finish' | 'boss';

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number;
  col: number; // 0-6
  x: number; // Relative visualization (0-1)
  y: number; // Relative visualization (0-1)
  connectedTo: string[]; // IDs of nodes this node connects TO (next floor)
  eliteChallenge?: EliteChallenge;       // Only set for 'elite' type nodes
  eliteCourseProfile?: CourseProfile;   // Pre-generated course for the elite challenge
  metadata?: { spokeId?: string };       // Optional metadata (e.g., to identify the spoke for a boss)
}

export interface MapEdge {
  from: string;
  to: string;
  profile: CourseProfile;
  isCleared?: boolean; // True if the player has successfully traversed this edge at least once
}

/** One entry per modifier application; session-only (not persisted). */
export interface ModifierLogEntry {
  label: string;
  powerMult?: number;
  dragReduction?: number;
  weightMult?: number;
  crrMult?: number;
}

export interface RunData {
  gold: number;
  /** Unequipped items. Consumables always live here; equipment items live here when not in a slot. */
  inventory: string[];
  /** Equipment currently in each slot. Key = slot name, value = item id. */
  equipped: Partial<Record<EquipmentSlot, string>>;
  modifiers: RunModifiers;
  /** Session-only log of individual modifier applications, for the stats bar tooltip. */
  modifierLog: ModifierLogEntry[];
  currentNodeId: string;
  visitedNodeIds: string[]; // Track all nodes the player has visited
  activeEdge: MapEdge | null; // The edge currently being traversed (or just finished)
  /** Set when the player arrives at a shop/event node via riding — MapScene opens the overlay on load. */
  pendingNodeAction: 'shop' | 'event' | null;
  nodes: MapNode[];
  edges: MapEdge[];
  runLength: number; // Total floors
  totalDistanceKm: number; // Target total run distance
  difficulty: 'easy' | 'normal' | 'hard';
  ftpW: number; // Rider's Functional Threshold Power in watts
  weightKg: number; // Rider weight in kg (stored for save/load)
  units: Units; // Display preference (stored for save/load)
  fitWriter: FitWriter;
  /** True if any segment of this run was ridden with a real Bluetooth trainer. */
  isRealTrainerRun: boolean;
  // Cumulative ride stats across all completed segments
  stats: {
    totalMapDistanceM: number;
    totalRiddenDistanceM: number;
    totalRecordCount: number;
    totalPowerSum: number;
    totalCadenceSum: number;
  };
}

/** Context-managed state for the current run */
export class RunManager extends Phaser.Events.EventEmitter {
  private runData: RunData | null = null;

  constructor(public readonly registry: ContentRegistry, initialData?: RunData) {
    super();
    if (initialData) {
      this.runData = initialData;
    }
  }

  setRealTrainerRun(val: boolean): void {
    if (this.runData) this.runData.isRealTrainerRun = val;
  }

  startNewRun(runLength: number, totalDistanceKm: number, difficulty: 'easy' | 'normal' | 'hard', ftpW = 200, weightKg = 68, units: Units = 'imperial'): RunData {
    this.runData = {
      gold: 0,
      inventory: [],
      equipped: {},
      modifiers: { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 },
      modifierLog: [],
      currentNodeId: '', // Set by map generator
      visitedNodeIds: [],
      activeEdge: null,
      pendingNodeAction: null,
      nodes: [],
      edges: [],
      runLength,
      totalDistanceKm,
      difficulty,
      ftpW,
      weightKg,
      units,
      fitWriter: new FitWriter(Date.now()),
      isRealTrainerRun: false,
      stats: { totalMapDistanceM: 0, totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
    };
    return this.runData;
  }

  loadFromSave(saved: SavedRun): RunData {
    this.runData = {
      modifiers: { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 }, // default for old saves
      modifierLog: [], // session-only, not persisted
      stats: { totalMapDistanceM: 0, totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
      pendingNodeAction: null, // default for old saves
      ...saved.runData,
      isRealTrainerRun: saved.runData.isRealTrainerRun ?? false,
      activeEdge: null,
      fitWriter: new FitWriter(Date.now()),
    };
    // Re-apply modifiers from equipped items (modifiers are not persisted).
    for (const itemId of Object.values(this.runData.equipped)) {
      if (!itemId) continue;
      const def = this.registry.getItem(itemId);
      if (def?.modifier) {
        this.applyModifier(def.modifier, `${def.label} (equipped)`);
      }
    }
    return this.runData;
  }

  getRun(): RunData | null {
    return this.runData;
  }

  /**
   * Returns a reference to the underlying run data for saving.
   * Throws if no run is active.
   */
  exportData(): RunData {
    if (!this.runData) throw new Error('No active run to export');
    return this.runData;
  }

  setCurrentNode(nodeId: string): void {
    if (this.runData) {
      this.runData.currentNodeId = nodeId;
      if (!this.runData.visitedNodeIds.includes(nodeId)) {
        this.runData.visitedNodeIds.push(nodeId);
      }
    }
  }

  returnToHub(): void {
    if (this.runData) {
      this.runData.currentNodeId = 'node_hub';
      // Do NOT wipe visitedNodeIds
    }
  }

  removeFromInventory(item: string): boolean {
    if (this.runData) {
      const idx = this.runData.inventory.indexOf(item);
      if (idx !== -1) {
        this.runData.inventory.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  /** Sets the active edge. Does NOT persist — we intentionally skip saving mid-ride state. */
  setActiveEdge(edge: MapEdge | null): void {
    if (import.meta.env.DEV) console.log(`[SPOKES] setActiveEdge: ${edge ? `${edge.from}→${edge.to} isCleared=${edge.isCleared}` : 'null'}`);
    if (this.runData) {
      this.runData.activeEdge = edge;
    }
  }

  /** Marks the currently active edge as cleared and advances currentNodeId to the destination. Returns true if it was newly cleared. */
  completeActiveEdge(): boolean {
    const ae = this.runData?.activeEdge;
    if (import.meta.env.DEV) console.log(`[SPOKES] completeActiveEdge: activeEdge=${ae ? `${ae.from}→${ae.to} isCleared=${ae.isCleared}` : 'null'} currentNodeId=${this.runData?.currentNodeId}`);

    if (this.runData && this.runData.activeEdge) {
      // Find the edge in the main list to update it persistently
      const edge = this.runData.edges.find(e =>
        e.from === this.runData!.activeEdge!.from &&
        e.to === this.runData!.activeEdge!.to
      );

      if (import.meta.env.DEV) console.log(`[SPOKES] completeActiveEdge: edge in list found=${!!edge} wasCleared=${edge?.isCleared}`);

      if (edge) {
        // Derive destination — whichever end of the edge isn't the origin
        const destination = edge.from === this.runData.currentNodeId
          ? edge.to
          : edge.from;
        if (import.meta.env.DEV) console.log(`[SPOKES] completeActiveEdge: destination=${destination}`);
        this.runData.currentNodeId = destination;
        if (!this.runData.visitedNodeIds.includes(destination)) {
          this.runData.visitedNodeIds.push(destination);
        }

        // If destination is a shop or event, signal MapScene to open the overlay after the ride
        const destNode = this.runData.nodes.find(n => n.id === destination);
        this.runData.pendingNodeAction =
          (destNode?.type === 'shop' || destNode?.type === 'event') ? destNode.type : null;

        if (!edge.isCleared) {
          edge.isCleared = true;
          // Also update the active reference
          this.runData.activeEdge.isCleared = true;
          if (import.meta.env.DEV) console.log(`[SPOKES] completeActiveEdge: returning true (first clear)`);
          return true;
        } else {
          if (import.meta.env.DEV) console.log(`[SPOKES] completeActiveEdge: edge already cleared → returning false`);
        }
      }
    } else {
      if (import.meta.env.DEV) console.warn(`[SPOKES] completeActiveEdge: no activeEdge → returning false`);
    }
    return false;
  }

  setPendingNodeAction(action: 'shop' | 'event' | null): void {
    if (this.runData) {
      this.runData.pendingNodeAction = action;
    }
  }

  setFtp(w: number): void {
    if (this.runData) {
      this.runData.ftpW = w;
    }
  }

  addGold(amount: number): void {
    if (this.runData) {
      this.runData.gold += amount;
    }
  }

  spendGold(amount: number): boolean {
    if (this.runData && this.runData.gold >= amount) {
      this.runData.gold -= amount;
      return true;
    }
    return false;
  }

  addToInventory(item: string): void {
    if (this.runData) {
      this.runData.inventory.push(item);
    }
  }

  getModifiers(): RunModifiers {
    return this.runData?.modifiers ?? { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 };
  }

  /**
   * Applies a modifier delta to the run's stacking bonuses.
   * - powerMult / weightMult: multiplicative
   * - dragReduction: additive, capped at 0.99
   */
  applyModifier(delta: Partial<RunModifiers>, label?: string): void {
    if (!this.runData) return;
    const m = this.runData.modifiers;
    if (delta.powerMult !== undefined)    m.powerMult     = m.powerMult * delta.powerMult;
    if (delta.dragReduction !== undefined) m.dragReduction = Math.min(0.99, m.dragReduction + delta.dragReduction);
    if (delta.weightMult !== undefined)   m.weightMult    = Math.max(0.01, m.weightMult * delta.weightMult);
    if (delta.crrMult !== undefined)      m.crrMult       = Math.max(0.01, m.crrMult * delta.crrMult);
    if (label) this.runData.modifierLog.push({ label, ...delta });
  }

  /** Reverses a previously-applied modifier delta (used when unequipping). */
  private reverseModifier(delta: Partial<RunModifiers>): void {
    if (!this.runData) return;
    const m = this.runData.modifiers;
    if (delta.powerMult    !== undefined) m.powerMult     = m.powerMult / delta.powerMult;
    if (delta.dragReduction !== undefined) m.dragReduction = Math.max(0, m.dragReduction - delta.dragReduction);
    if (delta.weightMult   !== undefined) m.weightMult    = m.weightMult / delta.weightMult;
    if (delta.crrMult      !== undefined) m.crrMult       = m.crrMult / delta.crrMult;
  }

  /**
   * Equips an item from inventory into its designated slot, applying its modifier.
   * If the slot is already occupied, the existing item is unequipped first.
   * Returns false if the item is not in inventory or not equippable.
   */
  equipItem(itemId: string): boolean {
    if (!this.runData) return false;
    const def = this.registry.getItem(itemId);
    if (!def?.slot) return false;

    const idx = this.runData.inventory.indexOf(itemId);
    if (idx === -1) return false;

    // Unequip whatever is currently in the slot (if anything).
    if (this.runData.equipped[def.slot]) {
      this.unequipItem(def.slot);
    }

    this.runData.inventory.splice(idx, 1);
    this.runData.equipped[def.slot] = itemId;
    if (def.modifier) {
      this.applyModifier(def.modifier, `${def.label} (equipped)`);
    }
    return true;
  }

  /**
   * Removes the item in the given slot, reverses its modifier, and returns it to inventory.
   * Returns the item id, or undefined if the slot was empty.
   */
  unequipItem(slot: EquipmentSlot): string | undefined {
    if (!this.runData) return undefined;
    const itemId = this.runData.equipped[slot];
    if (!itemId) return undefined;

    const def = this.registry.getItem(itemId);
    if (def?.modifier) {
      this.reverseModifier(def.modifier);
      // Remove the corresponding modifierLog entry.
      const logLabel = `${def.label} (equipped)`;
      const logIdx = this.runData.modifierLog.findIndex(e => e.label === logLabel);
      if (logIdx !== -1) this.runData.modifierLog.splice(logIdx, 1);
    }

    delete this.runData.equipped[slot];
    this.runData.inventory.push(itemId);
    return itemId;
  }

  recordSegmentStats(distanceM: number, recordCount: number, powerSum: number, cadenceSum: number): void {
    if (!this.runData) return;
    const s = this.runData.stats;
    s.totalRiddenDistanceM += distanceM;
    s.totalRecordCount     += recordCount;
    s.totalPowerSum        += powerSum;
    s.totalCadenceSum      += cadenceSum;
  }
}
