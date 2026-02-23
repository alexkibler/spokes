/**
 * RunState.ts
 *
 * Defines the data structures for the roguelike progression system.
 * Tracks player progress, currency, and the procedurally generated map.
 */

import type { CourseProfile } from '../course/CourseProfile';
import type { EliteChallenge } from './EliteChallenge';
import { FitWriter } from '../fit/FitWriter';
import { SaveService } from '../services/SaveService';
import type { Units } from '../scenes/MenuScene';
import { ITEM_REGISTRY, type EquipmentSlot } from './ItemRegistry';

export type { EquipmentSlot };

export type NodeType = 'start' | 'standard' | 'hard' | 'shop' | 'event' | 'elite' | 'finish';

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
}

export interface MapEdge {
  from: string;
  to: string;
  profile: CourseProfile;
  isCleared?: boolean; // True if the player has successfully traversed this edge at least once
}

export interface RunModifiers {
  /** Multiplicative power bonus. 1.0 = no bonus. Stacks multiplicatively. */
  powerMult: number;
  /** Additive drag reduction fraction. 0.0 = none, 0.99 = near vacuum. Capped at 0.99. */
  dragReduction: number;
  /** Multiplicative weight factor. 1.0 = normal, 0.01 = near weightless. Stacks multiplicatively, floored at 0.01. */
  weightMult: number;
  /** Multiplicative rolling-resistance factor. 1.0 = normal, <1.0 reduces Crr on all surfaces. Floored at 0.01. */
  crrMult: number;
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
  // Cumulative ride stats across all completed segments
  stats: {
    totalRiddenDistanceM: number;
    totalRecordCount: number;
    totalPowerSum: number;
    totalCadenceSum: number;
  };
}

/** Global singleton or context-managed state for the current run */
export class RunStateManager {
  private static instance: RunData | null = null;

  // ── Dev mode — persists across scene transitions ─────────────────────────
  private static _devMode = false;
  static getDevMode(): boolean { return this._devMode; }
  static setDevMode(val: boolean): void { this._devMode = val; }

  static startNewRun(runLength: number, totalDistanceKm: number, difficulty: 'easy' | 'normal' | 'hard', ftpW = 200, weightKg = 68, units: Units = 'imperial'): RunData {
    SaveService.clear();
    this.instance = {
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
      stats: { totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
    };
    this.persist();
    return this.instance;
  }

  static loadFromSave(saved: import('../services/SaveService').SavedRun): RunData {
    this.instance = {
      modifiers: { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 }, // default for old saves
      modifierLog: [], // session-only, not persisted
      stats: { totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
      pendingNodeAction: null, // default for old saves
      ...saved.runData,
      activeEdge: null,
      fitWriter: new FitWriter(Date.now()),
    };
    // Re-apply modifiers from equipped items (modifiers are not persisted).
    for (const itemId of Object.values(this.instance.equipped)) {
      if (!itemId) continue;
      const def = ITEM_REGISTRY[itemId];
      if (def?.modifier) {
        this.applyModifier(def.modifier, `${def.label} (equipped)`);
      }
    }
    return this.instance;
  }

  static getRun(): RunData | null {
    return this.instance;
  }

  static setCurrentNode(nodeId: string): void {
    if (this.instance) {
      this.instance.currentNodeId = nodeId;
      if (!this.instance.visitedNodeIds.includes(nodeId)) {
        this.instance.visitedNodeIds.push(nodeId);
      }
      this.persist();
    }
  }

  static removeFromInventory(item: string): boolean {
    if (this.instance) {
      const idx = this.instance.inventory.indexOf(item);
      if (idx !== -1) {
        this.instance.inventory.splice(idx, 1);
        this.persist();
        return true;
      }
    }
    return false;
  }

  /** Sets the active edge. Does NOT persist — we intentionally skip saving mid-ride state. */
  static setActiveEdge(edge: MapEdge | null): void {
    if (this.instance) {
      this.instance.activeEdge = edge;
    }
  }

  /** Marks the currently active edge as cleared and advances currentNodeId to the destination. Returns true if it was newly cleared. */
  static completeActiveEdge(): boolean {
    if (this.instance && this.instance.activeEdge) {
      // Find the edge in the main list to update it persistently
      const edge = this.instance.edges.find(e =>
        e.from === this.instance!.activeEdge!.from &&
        e.to === this.instance!.activeEdge!.to
      );

      if (edge) {
        // Derive destination — whichever end of the edge isn't the origin
        const destination = edge.from === this.instance.currentNodeId
          ? edge.to
          : edge.from;
        this.instance.currentNodeId = destination;
        if (!this.instance.visitedNodeIds.includes(destination)) {
          this.instance.visitedNodeIds.push(destination);
        }

        // If destination is a shop or event, signal MapScene to open the overlay after the ride
        const destNode = this.instance.nodes.find(n => n.id === destination);
        this.instance.pendingNodeAction =
          (destNode?.type === 'shop' || destNode?.type === 'event') ? destNode.type : null;

        if (!edge.isCleared) {
          edge.isCleared = true;
          // Also update the active reference
          this.instance.activeEdge.isCleared = true;
          this.persist();
          return true;
        }
      }

      this.persist();
    }
    return false;
  }

  static setPendingNodeAction(action: 'shop' | 'event' | null): void {
    if (this.instance) {
      this.instance.pendingNodeAction = action;
    }
  }

  static setFtp(w: number): void {
    if (this.instance) {
      this.instance.ftpW = w;
      this.persist();
    }
  }

  static getLastFtp(): number {
    const { save } = SaveService.loadResult();
    return save?.runData.ftpW ?? 200;
  }

  static addGold(amount: number): void {
    if (this.instance) {
      this.instance.gold += amount;
      this.persist();
    }
  }

  static spendGold(amount: number): boolean {
    if (this.instance && this.instance.gold >= amount) {
      this.instance.gold -= amount;
      this.persist();
      return true;
    }
    return false;
  }

  static addToInventory(item: string): void {
    if (this.instance) {
      this.instance.inventory.push(item);
      this.persist();
    }
  }

  static getModifiers(): RunModifiers {
    return this.instance?.modifiers ?? { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 };
  }

  /**
   * Applies a modifier delta to the run's stacking bonuses.
   * - powerMult / weightMult: multiplicative
   * - dragReduction: additive, capped at 0.99
   */
  static applyModifier(delta: Partial<RunModifiers>, label?: string): void {
    if (!this.instance) return;
    const m = this.instance.modifiers;
    if (delta.powerMult !== undefined)    m.powerMult     = m.powerMult * delta.powerMult;
    if (delta.dragReduction !== undefined) m.dragReduction = Math.min(0.99, m.dragReduction + delta.dragReduction);
    if (delta.weightMult !== undefined)   m.weightMult    = Math.max(0.01, m.weightMult * delta.weightMult);
    if (delta.crrMult !== undefined)      m.crrMult       = Math.max(0.01, m.crrMult * delta.crrMult);
    if (label) this.instance.modifierLog.push({ label, ...delta });
    this.persist();
  }

  /** Reverses a previously-applied modifier delta (used when unequipping). */
  private static reverseModifier(delta: Partial<RunModifiers>): void {
    if (!this.instance) return;
    const m = this.instance.modifiers;
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
  static equipItem(itemId: string): boolean {
    if (!this.instance) return false;
    const def = ITEM_REGISTRY[itemId];
    if (!def?.slot) return false;

    const idx = this.instance.inventory.indexOf(itemId);
    if (idx === -1) return false;

    // Unequip whatever is currently in the slot (if anything).
    if (this.instance.equipped[def.slot]) {
      this.unequipItem(def.slot);
    }

    this.instance.inventory.splice(idx, 1);
    this.instance.equipped[def.slot] = itemId;
    if (def.modifier) {
      this.applyModifier(def.modifier, `${def.label} (equipped)`);
    }
    this.persist();
    return true;
  }

  /**
   * Removes the item in the given slot, reverses its modifier, and returns it to inventory.
   * Returns the item id, or undefined if the slot was empty.
   */
  static unequipItem(slot: EquipmentSlot): string | undefined {
    if (!this.instance) return undefined;
    const itemId = this.instance.equipped[slot];
    if (!itemId) return undefined;

    const def = ITEM_REGISTRY[itemId];
    if (def?.modifier) {
      this.reverseModifier(def.modifier);
      // Remove the corresponding modifierLog entry.
      const logLabel = `${def.label} (equipped)`;
      const logIdx = this.instance.modifierLog.findIndex(e => e.label === logLabel);
      if (logIdx !== -1) this.instance.modifierLog.splice(logIdx, 1);
    }

    delete this.instance.equipped[slot];
    this.instance.inventory.push(itemId);
    this.persist();
    return itemId;
  }

  static recordSegmentStats(distanceM: number, recordCount: number, powerSum: number, cadenceSum: number): void {
    if (!this.instance) return;
    const s = this.instance.stats;
    s.totalRiddenDistanceM += distanceM;
    s.totalRecordCount     += recordCount;
    s.totalPowerSum        += powerSum;
    s.totalCadenceSum      += cadenceSum;
    this.persist();
  }

  /** Saves current run state to localStorage. Called after every meaningful state change. */
  private static persist(): void {
    if (this.instance) {
      SaveService.save(this.instance, this.instance.weightKg, this.instance.units);
    }
  }
}
