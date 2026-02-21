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

export type NodeType = 'start' | 'standard' | 'hard' | 'shop' | 'event' | 'elite' | 'finish';

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number;
  col: number; // 0-6
  x: number; // Relative visualization (0-1)
  y: number; // Relative visualization (0-1)
  connectedTo: string[]; // IDs of nodes this node connects TO (next floor)
  eliteChallenge?: EliteChallenge; // Only set for 'elite' type nodes
}

export interface MapEdge {
  from: string;
  to: string;
  profile: CourseProfile;
  isCleared?: boolean; // True if the player has successfully traversed this edge at least once
}

export interface RunData {
  gold: number;
  inventory: string[];
  currentNodeId: string;
  visitedNodeIds: string[]; // Track all nodes the player has visited
  activeEdge: MapEdge | null; // The edge currently being traversed (or just finished)
  nodes: MapNode[];
  edges: MapEdge[];
  runLength: number; // Total floors
  totalDistanceKm: number; // Target total run distance
  difficulty: 'easy' | 'medium' | 'hard';
  ftpW: number; // Rider's Functional Threshold Power in watts
  weightKg: number; // Rider weight in kg (stored for save/load)
  units: Units; // Display preference (stored for save/load)
  fitWriter: FitWriter;
}

/** Global singleton or context-managed state for the current run */
export class RunStateManager {
  private static instance: RunData | null = null;

  static startNewRun(runLength: number, totalDistanceKm: number, difficulty: 'easy' | 'medium' | 'hard', ftpW = 200, weightKg = 68, units: Units = 'imperial'): RunData {
    SaveService.clear();
    this.instance = {
      gold: 0,
      inventory: [],
      currentNodeId: '', // Set by map generator
      visitedNodeIds: [],
      activeEdge: null,
      nodes: [],
      edges: [],
      runLength,
      totalDistanceKm,
      difficulty,
      ftpW,
      weightKg,
      units,
      fitWriter: new FitWriter(Date.now()),
    };
    this.persist();
    return this.instance;
  }

  static loadFromSave(saved: import('../services/SaveService').SavedRun): RunData {
    this.instance = {
      ...saved.runData,
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

  /** Saves current run state to localStorage. Called after every meaningful state change. */
  private static persist(): void {
    if (this.instance) {
      SaveService.save(this.instance, this.instance.weightKg, this.instance.units);
    }
  }
}
