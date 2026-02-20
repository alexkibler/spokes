/**
 * RunState.ts
 * 
 * Defines the data structures for the roguelike progression system.
 * Tracks player progress, currency, and the procedurally generated map.
 */

import type { CourseSegment } from '../course/CourseProfile';
import { FitWriter } from '../fit/FitWriter';

export type NodeType = 'start' | 'standard' | 'hard' | 'shop' | 'finish';

export interface MapNode {
  id: string;
  type: NodeType;
  floor: number;
  col: number; // 0-6
  x: number; // Relative visualization (0-1)
  y: number; // Relative visualization (0-1)
  connectedTo: string[]; // IDs of nodes this node connects TO (next floor)
}

export interface MapEdge {
  from: string;
  to: string;
  segment: CourseSegment;
}

export interface RunData {
  gold: number;
  inventory: string[];
  currentNodeId: string;
  nodes: MapNode[];
  edges: MapEdge[];
  runLength: number; // Total floors
  difficulty: 'easy' | 'medium' | 'hard';
  fitWriter: FitWriter;
}

/** Global singleton or context-managed state for the current run */
export class RunStateManager {
  private static instance: RunData | null = null;

  static startNewRun(runLength: number, difficulty: 'easy' | 'medium' | 'hard'): RunData {
    this.instance = {
      gold: 0,
      inventory: [],
      currentNodeId: '', // Set by map generator
      nodes: [],
      edges: [],
      runLength,
      difficulty,
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
    }
  }

  static addGold(amount: number): void {
    if (this.instance) {
      this.instance.gold += amount;
    }
  }

  static spendGold(amount: number): boolean {
    if (this.instance && this.instance.gold >= amount) {
      this.instance.gold -= amount;
      return true;
    }
    return false;
  }

  static addToInventory(item: string): void {
    if (this.instance) {
      this.instance.inventory.push(item);
    }
  }
}
