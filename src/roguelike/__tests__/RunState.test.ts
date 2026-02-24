/**
 * RunManager.test.ts
 *
 * Unit tests for RunManager – the instance that manages
 * roguelike run data (gold, inventory, modifiers, edge traversal, stats).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunManager } from '../RunState';
import type { MapNode, MapEdge } from '../RunState';

// Mock Phaser.Events.EventEmitter to avoid loading Phaser in Node
vi.mock('phaser', () => {
  class EventEmitter {
    events: Record<string, Function[]> = {};
    emit(event: string, ...args: any[]) {
      if (this.events[event]) {
        this.events[event].forEach(fn => fn(...args));
      }
      return true;
    }
    on(event: string, fn: Function) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(fn);
      return this;
    }
    off() { return this; }
  }
  return {
    default: {
      Events: {
        EventEmitter
      }
    }
  };
});

function makeNode(id: string, type: MapNode['type'] = 'standard', floor = 0): MapNode {
  return { id, type, floor, col: 0, x: 0, y: 0, connectedTo: [] };
}

function makeEdge(from: string, to: string): MapEdge {
  return {
    from,
    to,
    profile: { segments: [], totalDistanceM: 100 },
  };
}

describe('RunManager', () => {
  let manager: RunManager;

  beforeEach(() => {
    manager = new RunManager();
  });

  describe('startNewRun', () => {
    it('creates a run with initial zero gold', () => {
      manager.startNewRun(3, 10, 'normal');
      expect(manager.getRun()?.gold).toBe(0);
    });

    it('sets the provided runLength', () => {
      manager.startNewRun(5, 20, 'hard');
      expect(manager.getRun()?.runLength).toBe(5);
    });

    it('sets the provided totalDistanceKm', () => {
      manager.startNewRun(3, 15, 'easy');
      expect(manager.getRun()?.totalDistanceKm).toBe(15);
    });

    it('sets the provided difficulty', () => {
      manager.startNewRun(3, 10, 'easy');
      expect(manager.getRun()?.difficulty).toBe('easy');
    });

    it('uses provided ftpW', () => {
      manager.startNewRun(3, 10, 'normal', 300);
      expect(manager.getRun()?.ftpW).toBe(300);
    });

    it('uses default ftpW of 200 when omitted', () => {
      manager.startNewRun(3, 10, 'normal');
      expect(manager.getRun()?.ftpW).toBe(200);
    });

    it('uses provided weightKg', () => {
      manager.startNewRun(3, 10, 'normal', 200, 70);
      expect(manager.getRun()?.weightKg).toBe(70);
    });

    it('uses default units of imperial when omitted', () => {
      manager.startNewRun(3, 10, 'normal');
      expect(manager.getRun()?.units).toBe('imperial');
    });

    it('uses provided units', () => {
      manager.startNewRun(3, 10, 'normal', 200, 68, 'metric');
      expect(manager.getRun()?.units).toBe('metric');
    });

    it('initialises empty inventory', () => {
      manager.startNewRun(3, 10, 'normal');
      expect(manager.getRun()?.inventory).toEqual([]);
    });

    it('initialises modifiers to neutral (1, 0, 1)', () => {
      manager.startNewRun(3, 10, 'normal');
      const m = manager.getRun()?.modifiers;
      expect(m?.powerMult).toBe(1.0);
      expect(m?.dragReduction).toBe(0.0);
      expect(m?.weightMult).toBe(1.0);
    });

    it('initialises stats to zero', () => {
      manager.startNewRun(3, 10, 'normal');
      const s = manager.getRun()?.stats;
      expect(s?.totalRiddenDistanceM).toBe(0);
      expect(s?.totalRecordCount).toBe(0);
      expect(s?.totalPowerSum).toBe(0);
      expect(s?.totalCadenceSum).toBe(0);
    });

    it('replaces a previous run entirely', () => {
      manager.startNewRun(3, 10, 'normal');
      manager.addGold(100);
      manager.startNewRun(5, 20, 'hard');
      expect(manager.getRun()?.gold).toBe(0);
    });

    it('emits save event', () => {
      const spy = vi.fn();
      manager.on('save', spy);
      manager.startNewRun(3, 10, 'normal');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it('returns null when no run has been started', () => {
      expect(manager.getRun()).toBeNull();
    });
  });

  describe('setCurrentNode', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('updates currentNodeId', () => {
      manager.setCurrentNode('node-1');
      expect(manager.getRun()?.currentNodeId).toBe('node-1');
    });

    it('adds the node to visitedNodeIds', () => {
      manager.setCurrentNode('node-1');
      expect(manager.getRun()?.visitedNodeIds).toContain('node-1');
    });

    it('does not add duplicates to visitedNodeIds', () => {
      manager.setCurrentNode('node-1');
      manager.setCurrentNode('node-1');
      const visited = manager.getRun()?.visitedNodeIds ?? [];
      expect(visited.filter(id => id === 'node-1')).toHaveLength(1);
    });

    it('accumulates multiple distinct node visits', () => {
      manager.setCurrentNode('a');
      manager.setCurrentNode('b');
      manager.setCurrentNode('c');
      expect(manager.getRun()?.visitedNodeIds).toEqual(['a', 'b', 'c']);
    });
  });

  describe('addGold', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('increases gold by the specified amount', () => {
      manager.addGold(50);
      expect(manager.getRun()?.gold).toBe(50);
    });

    it('accumulates multiple additions', () => {
      manager.addGold(30);
      manager.addGold(20);
      expect(manager.getRun()?.gold).toBe(50);
    });
  });

  describe('spendGold', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
      manager.addGold(100);
    });

    it('returns true and decreases gold when sufficient funds exist', () => {
      const result = manager.spendGold(40);
      expect(result).toBe(true);
      expect(manager.getRun()?.gold).toBe(60);
    });

    it('returns false and leaves gold unchanged when insufficient', () => {
      const result = manager.spendGold(200);
      expect(result).toBe(false);
      expect(manager.getRun()?.gold).toBe(100);
    });

    it('allows spending the exact available balance', () => {
      expect(manager.spendGold(100)).toBe(true);
      expect(manager.getRun()?.gold).toBe(0);
    });

    it('returns false when gold is 0', () => {
      manager.spendGold(100); // drain to 0
      expect(manager.spendGold(1)).toBe(false);
    });
  });

  describe('inventory', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('addToInventory appends an item', () => {
      manager.addToInventory('tailwind');
      expect(manager.getRun()?.inventory).toContain('tailwind');
    });

    it('addToInventory allows duplicate items', () => {
      manager.addToInventory('energy_gel');
      manager.addToInventory('energy_gel');
      const inv = manager.getRun()?.inventory ?? [];
      expect(inv.filter(i => i === 'energy_gel')).toHaveLength(2);
    });

    it('removeFromInventory removes the first occurrence and returns true', () => {
      manager.addToInventory('tailwind');
      const result = manager.removeFromInventory('tailwind');
      expect(result).toBe(true);
      expect(manager.getRun()?.inventory).not.toContain('tailwind');
    });

    it('removeFromInventory returns false for a missing item', () => {
      expect(manager.removeFromInventory('nonexistent')).toBe(false);
    });

    it('removeFromInventory removes only one occurrence when duplicates exist', () => {
      manager.addToInventory('gel');
      manager.addToInventory('gel');
      manager.removeFromInventory('gel');
      const inv = manager.getRun()?.inventory ?? [];
      expect(inv).toHaveLength(1);
      expect(inv[0]).toBe('gel');
    });
  });

  describe('getModifiers', () => {
    it('returns default modifiers when no run exists', () => {
      const m = manager.getModifiers();
      expect(m.powerMult).toBe(1.0);
      expect(m.dragReduction).toBe(0.0);
      expect(m.weightMult).toBe(1.0);
    });
  });

  describe('applyModifier', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('applies powerMult multiplicatively', () => {
      manager.applyModifier({ powerMult: 1.1 });
      expect(manager.getModifiers().powerMult).toBeCloseTo(1.1, 5);
      manager.applyModifier({ powerMult: 1.1 });
      expect(manager.getModifiers().powerMult).toBeCloseTo(1.21, 5);
    });

    it('applies dragReduction additively', () => {
      manager.applyModifier({ dragReduction: 0.1 });
      expect(manager.getModifiers().dragReduction).toBeCloseTo(0.1, 5);
      manager.applyModifier({ dragReduction: 0.2 });
      expect(manager.getModifiers().dragReduction).toBeCloseTo(0.3, 5);
    });

    it('caps dragReduction at 0.99', () => {
      manager.applyModifier({ dragReduction: 0.5 });
      manager.applyModifier({ dragReduction: 0.6 }); // would be 1.1 uncapped
      expect(manager.getModifiers().dragReduction).toBe(0.99);
    });

    it('applies weightMult multiplicatively', () => {
      manager.applyModifier({ weightMult: 0.9 });
      expect(manager.getModifiers().weightMult).toBeCloseTo(0.9, 5);
      manager.applyModifier({ weightMult: 0.9 });
      expect(manager.getModifiers().weightMult).toBeCloseTo(0.81, 5);
    });

    it('floors weightMult at 0.01', () => {
      manager.applyModifier({ weightMult: 0.001 });
      expect(manager.getModifiers().weightMult).toBeGreaterThanOrEqual(0.01);
    });

    it('allows partial modifier updates (only one field)', () => {
      manager.applyModifier({ powerMult: 1.2 });
      const m = manager.getModifiers();
      expect(m.powerMult).toBeCloseTo(1.2, 5);
      expect(m.dragReduction).toBe(0.0); // unchanged
      expect(m.weightMult).toBe(1.0);   // unchanged
    });
  });

  describe('recordSegmentStats', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('accumulates totalRiddenDistanceM', () => {
      manager.recordSegmentStats(1000, 60, 12000, 5400);
      manager.recordSegmentStats(500, 30, 6000, 2700);
      expect(manager.getRun()?.stats.totalRiddenDistanceM).toBe(1500);
    });

    it('accumulates totalRecordCount', () => {
      manager.recordSegmentStats(0, 10, 0, 0);
      manager.recordSegmentStats(0, 20, 0, 0);
      expect(manager.getRun()?.stats.totalRecordCount).toBe(30);
    });

    it('accumulates totalPowerSum', () => {
      manager.recordSegmentStats(0, 0, 10000, 0);
      manager.recordSegmentStats(0, 0, 5000, 0);
      expect(manager.getRun()?.stats.totalPowerSum).toBe(15000);
    });

    it('accumulates totalCadenceSum', () => {
      manager.recordSegmentStats(0, 0, 0, 8100);
      manager.recordSegmentStats(0, 0, 0, 900);
      expect(manager.getRun()?.stats.totalCadenceSum).toBe(9000);
    });
  });

  describe('setActiveEdge / completeActiveEdge', () => {
    beforeEach(() => {
      const run = manager.startNewRun(3, 10, 'normal');
      run.nodes = [
        makeNode('start', 'start', 0),
        makeNode('mid', 'standard', 1),
        makeNode('finish', 'finish', 2),
      ];
      run.edges = [
        makeEdge('start', 'mid'),
        makeEdge('mid', 'finish'),
      ];
      manager.setCurrentNode('start');
    });

    it('setActiveEdge stores the edge reference', () => {
      const edge = makeEdge('start', 'mid');
      manager.setActiveEdge(edge);
      expect(manager.getRun()?.activeEdge).toBe(edge);
    });

    it('setActiveEdge can be set to null', () => {
      manager.setActiveEdge(makeEdge('start', 'mid'));
      manager.setActiveEdge(null);
      expect(manager.getRun()?.activeEdge).toBeNull();
    });

    it('completeActiveEdge returns true when edge is newly cleared', () => {
      const run = manager.getRun()!;
      manager.setActiveEdge(run.edges[0]); // start → mid
      const result = manager.completeActiveEdge();
      expect(result).toBe(true);
    });

    it('completeActiveEdge advances currentNodeId to the destination', () => {
      const run = manager.getRun()!;
      manager.setActiveEdge(run.edges[0]); // start → mid
      manager.completeActiveEdge();
      expect(manager.getRun()?.currentNodeId).toBe('mid');
    });

    it('completeActiveEdge marks the edge as cleared', () => {
      const run = manager.getRun()!;
      manager.setActiveEdge(run.edges[0]);
      manager.completeActiveEdge();
      expect(run.edges[0].isCleared).toBe(true);
    });

    it('completeActiveEdge returns false when edge was already cleared', () => {
      const run = manager.getRun()!;
      manager.setActiveEdge(run.edges[0]);
      manager.completeActiveEdge(); // first clear → true
      // Now re-traverse the same edge
      manager.setActiveEdge(run.edges[0]);
      const result = manager.completeActiveEdge();
      expect(result).toBe(false);
    });

    it('completeActiveEdge returns false when activeEdge is null', () => {
      manager.setActiveEdge(null);
      expect(manager.completeActiveEdge()).toBe(false);
    });

    it('sets pendingNodeAction to "shop" when destination is a shop node', () => {
      const run = manager.getRun()!;
      run.nodes[1] = makeNode('mid', 'shop', 1);
      manager.setActiveEdge(run.edges[0]);
      manager.completeActiveEdge();
      expect(manager.getRun()?.pendingNodeAction).toBe('shop');
    });

    it('sets pendingNodeAction to "event" when destination is an event node', () => {
      const run = manager.getRun()!;
      run.nodes[1] = makeNode('mid', 'event', 1);
      manager.setActiveEdge(run.edges[0]);
      manager.completeActiveEdge();
      expect(manager.getRun()?.pendingNodeAction).toBe('event');
    });

    it('sets pendingNodeAction to null when destination is a standard node', () => {
      const run = manager.getRun()!;
      manager.setActiveEdge(run.edges[0]); // mid is 'standard'
      manager.completeActiveEdge();
      expect(manager.getRun()?.pendingNodeAction).toBeNull();
    });
  });

  describe('setPendingNodeAction', () => {
    beforeEach(() => {
      manager.startNewRun(3, 10, 'normal');
    });

    it('sets pendingNodeAction to shop', () => {
      manager.setPendingNodeAction('shop');
      expect(manager.getRun()?.pendingNodeAction).toBe('shop');
    });

    it('sets pendingNodeAction to null', () => {
      manager.setPendingNodeAction('shop');
      manager.setPendingNodeAction(null);
      expect(manager.getRun()?.pendingNodeAction).toBeNull();
    });
  });

  describe('loadFromSave', () => {
    it('restores gold from saved data', () => {
      manager.loadFromSave({
        version: 2,
        savedAt: new Date().toISOString(),
        runData: {
          gold: 77,
          inventory: [],
          equipped: {},
          currentNodeId: 'node-x',
          visitedNodeIds: ['node-x'],
          activeEdge: null,
          nodes: [],
          edges: [],
          runLength: 3,
          totalDistanceKm: 10,
          difficulty: 'normal',
          ftpW: 250,
          weightKg: 70,
          units: 'metric',
          isRealTrainerRun: false,
        },
      });
      expect(manager.getRun()?.gold).toBe(77);
    });

    it('restores inventory from saved data', () => {
      manager.loadFromSave({
        version: 2,
        savedAt: new Date().toISOString(),
        runData: {
          gold: 0,
          inventory: ['tailwind', 'gel'],
          equipped: {},
          currentNodeId: '',
          visitedNodeIds: [],
          activeEdge: null,
          nodes: [],
          edges: [],
          runLength: 3,
          totalDistanceKm: 10,
          difficulty: 'easy',
          ftpW: 200,
          weightKg: 68,
          units: 'imperial',
          isRealTrainerRun: false,
        },
      });
      expect(manager.getRun()?.inventory).toEqual(['tailwind', 'gel']);
    });

    it('initialises activeEdge to null regardless of saved data', () => {
      manager.loadFromSave({
        version: 2,
        savedAt: new Date().toISOString(),
        runData: {
          gold: 0,
          inventory: [],
          equipped: {},
          currentNodeId: '',
          visitedNodeIds: [],
          activeEdge: null,
          nodes: [],
          edges: [],
          runLength: 3,
          totalDistanceKm: 10,
          difficulty: 'normal',
          ftpW: 200,
          weightKg: 68,
          units: 'imperial',
          isRealTrainerRun: false,
        },
      });
      expect(manager.getRun()?.activeEdge).toBeNull();
    });

    it('creates a fresh FitWriter (not null)', () => {
      manager.loadFromSave({
        version: 2,
        savedAt: new Date().toISOString(),
        runData: {
          gold: 0,
          inventory: [],
          equipped: {},
          currentNodeId: '',
          visitedNodeIds: [],
          activeEdge: null,
          nodes: [],
          edges: [],
          runLength: 3,
          totalDistanceKm: 10,
          difficulty: 'normal',
          ftpW: 200,
          weightKg: 68,
          units: 'imperial',
          isRealTrainerRun: false,
        },
      });
      expect(manager.getRun()?.fitWriter).toBeDefined();
    });
  });
});
