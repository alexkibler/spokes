import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCourseProfile } from '../CourseProfile';
import { generateHubAndSpokeMap } from '../CourseGenerator';
import { RunManager } from '../../roguelike/RunManager';

// ─── Mock Phaser ─────────────────────────────────────────────────────────────
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

// ─── Unit Tests: CourseProfile ───────────────────────────────────────────────

describe('generateCourseProfile (Unit)', () => {
  it('generates a valid profile for a standard distance', () => {
    const profile = generateCourseProfile(10, 0.05); // 10km
    expect(profile.totalDistanceM).toBeCloseTo(10000, 5);
    expect(profile.segments.length).toBeGreaterThan(1);
    
    // Should have some elevation change
    const grades = profile.segments.map(s => s.grade);
    const hasElevation = grades.some(g => g !== 0);
    expect(hasElevation).toBe(true);
  });

  it('generates a valid profile for a short distance (1km)', () => {
    const profile = generateCourseProfile(1.0, 0.05); // 1km
    expect(profile.totalDistanceM).toBeCloseTo(1000, 5);
    expect(profile.segments.length).toBeGreaterThan(1);
  });

  it('generates a valid profile for a very short distance (200m)', () => {
    const profile = generateCourseProfile(0.2, 0.05); // 200m
    expect(profile.totalDistanceM).toBeCloseTo(200, 5);
    expect(profile.segments.length).toBeGreaterThanOrEqual(3); // Start, Middle, End
  });

  it('applies the requested surface to all segments', () => {
    const profile = generateCourseProfile(5, 0.05, 'gravel');
    const allGravel = profile.segments.every(s => s.surface === 'gravel');
    expect(allGravel).toBe(true);
  });
});

// ─── Integration Tests: Procedural Map Generation ────────────────────────────

describe('generateHubAndSpokeMap (Integration)', () => {
  let runManager: RunManager;

  beforeEach(() => {
    runManager = new RunManager();
  });

  // Parameterized test cases for different run configurations
  const testCases = [
    { name: 'Short / Easy',   length: 2, dist: 20,  diff: 'easy' },
    { name: 'Medium / Normal', length: 4, dist: 100, diff: 'normal' },
    { name: 'Long / Hard',    length: 8, dist: 400, diff: 'hard' },
  ] as const;

  it.each(testCases)('generates a valid map for $name ($dist km)', ({ length, dist, diff }) => {
    const run = runManager.startNewRun(length, dist, diff);
    generateHubAndSpokeMap(run);

    const { nodes, edges } = run;

    // 1. Graph Integrity
    const startNodes = nodes.filter(n => n.type === 'start');
    const finishNodes = nodes.filter(n => n.type === 'finish');

    expect(startNodes).toHaveLength(1);
    expect(finishNodes.length).toBeGreaterThanOrEqual(1);

    // Orphan check: ensure every node is connected to at least one edge (from or to)
    const referencedNodes = new Set<string>();
    edges.forEach(e => {
      referencedNodes.add(e.from);
      referencedNodes.add(e.to);
    });

    nodes.forEach(node => {
      // Start node might only be 'from', finish only 'to', but must be in edge list.
      // Exception: if the graph has a single node (impossible here), it wouldn't be in edges.
      // But we expect a connected graph.
      expect(referencedNodes.has(node.id)).toBe(true);
    });

    // 2. Progression: Floor numbers must strictly increase along forward edges
    // Note: Some edges might be lateral (same floor) or backwards (player movement),
    // but the generated DAG edges usually go Forward (floor n -> n+1).
    // Let's verify that *generated* edges respect floor progression.
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);

      expect(fromNode).toBeDefined();
      expect(toNode).toBeDefined();

      if (fromNode && toNode) {
        // In this specific Hub-and-Spoke algorithm, edges typically go forward in floors.
        // There might be exceptions if we have "hub" structure, but generally:
        expect(toNode.floor).toBeGreaterThan(fromNode.floor);
      }
    });

    // 3. Edge Validity
    const nodeIds = new Set(nodes.map(n => n.id));
    edges.forEach(edge => {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    });

    // 4. Boss Placement
    const bossNodes = nodes.filter(n => n.type === 'boss');
    bossNodes.forEach(boss => {
      expect(boss.metadata).toBeDefined();
      expect(boss.metadata?.spokeId).toBeDefined();
    });

    // 5. Elite Nodes
    // Currently, the generator might not produce elite nodes.
    // This test ensures that IF they are produced, they are valid.
    const eliteNodes = nodes.filter(n => n.type === 'elite');
    if (eliteNodes.length > 0) {
      eliteNodes.forEach(elite => {
        expect(elite.eliteChallenge).toBeDefined();
        expect(elite.eliteCourseProfile).toBeDefined();
      });
    } else {
      // Explicitly note that no elite nodes were found (this is expected behavior for now)
      // but if the generator changes, this test covers it.
      expect(eliteNodes.length).toBe(0);
    }
  });

  it('guarantees connectivity from Start to Finish', () => {
    // Perform a BFS/DFS to ensure finish is reachable from start
    const run = runManager.startNewRun(3, 60, 'normal');
    generateHubAndSpokeMap(run);

    const { nodes, edges } = run;
    const startNode = nodes.find(n => n.type === 'start')!;
    const finishNode = nodes.find(n => n.type === 'finish')!;

    const adjacency = new Map<string, string[]>();
    edges.forEach(e => {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      adjacency.get(e.from)!.push(e.to);
    });

    const queue = [startNode.id];
    const visited = new Set<string>();
    visited.add(startNode.id);

    let reachable = false;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === finishNode.id) {
        reachable = true;
        break;
      }

      const neighbors = adjacency.get(current) || [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    expect(reachable).toBe(true);
  });
});
