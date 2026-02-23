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
import { EquipmentSlot, EquipmentStats, EQUIPMENT_DATABASE } from './Equipment';

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
  equipment: Record<EquipmentSlot, string>;
  passiveItems: string[];
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
      equipment: {
        head: 'foam_helmet',
        body: 'basic_kit',
        shoes: 'sneakers',
        frame: 'steel_frame',
        wheels: 'aluminum_box_wheels',
        tires: 'slicks',
        driveset: 'budget_3x7',
        cockpit: 'drop_bars',
      },
      passiveItems: [],
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
    // Migration helper: if save has inventory but no passiveItems/equipment
    const anySaved = saved.runData as any;
    const passiveItems = anySaved.passiveItems || anySaved.inventory || [];
    const equipment = anySaved.equipment || {
      head: 'foam_helmet',
      body: 'basic_kit',
      shoes: 'sneakers',
      frame: 'steel_frame',
      wheels: 'aluminum_box_wheels',
      tires: 'slicks',
      driveset: 'budget_3x7',
      cockpit: 'drop_bars',
    };

    this.instance = {
      modifiers: { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 }, // default for old saves
      modifierLog: [], // session-only, not persisted
      stats: { totalRiddenDistanceM: 0, totalRecordCount: 0, totalPowerSum: 0, totalCadenceSum: 0 },
      pendingNodeAction: null, // default for old saves
      ...saved.runData,
      equipment,
      passiveItems,
      activeEdge: null,
      fitWriter: new FitWriter(Date.now()),
    };
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

  static removePassiveItem(item: string): boolean {
    if (this.instance) {
      const idx = this.instance.passiveItems.indexOf(item);
      if (idx !== -1) {
        this.instance.passiveItems.splice(idx, 1);
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

  static addPassiveItem(item: string): void {
    if (this.instance) {
      this.instance.passiveItems.push(item);
      this.persist();
    }
  }

  static equipItem(itemId: string): void {
    if (!this.instance) return;
    const item = EQUIPMENT_DATABASE[itemId];
    if (!item) {
      console.warn(`[RunStateManager] Unknown item ${itemId}`);
      return;
    }
    this.instance.equipment[item.slot] = itemId;
    this.persist();
  }

  static getEffectiveEquipmentStats(): EquipmentStats {
    const stats: EquipmentStats = {
      mass_add: 0,
      cdA_add: 0,
      crr_add: 0,
      powerMult: 1.0,
    };

    if (!this.instance) return stats;

    for (const slot of Object.keys(this.instance.equipment) as EquipmentSlot[]) {
      const itemId = this.instance.equipment[slot];
      const item = EQUIPMENT_DATABASE[itemId];
      if (item && item.stats) {
        if (item.stats.mass_add) stats.mass_add = (stats.mass_add ?? 0) + item.stats.mass_add;
        if (item.stats.cdA_add) stats.cdA_add = (stats.cdA_add ?? 0) + item.stats.cdA_add;
        if (item.stats.crr_add) stats.crr_add = (stats.crr_add ?? 0) + item.stats.crr_add;
        if (item.stats.powerMult) stats.powerMult = (stats.powerMult ?? 1.0) * item.stats.powerMult;
      }
    }
    return stats;
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
