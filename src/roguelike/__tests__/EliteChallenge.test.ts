/**
 * EliteChallenge.test.ts
 *
 * Tests for the Elite node challenge system:
 *   - evaluateChallenge: returns true/false based on ChallengeMetrics
 *   - formatChallengeText: resolves {ftp_watts} placeholder
 *   - getRandomChallenge: returns a valid challenge from the pool
 *   - ELITE_CHALLENGES: pool sanity checks
 *   - grantChallengeReward: side-effects on RunManager (tested via integration)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  evaluateChallenge,
  formatChallengeText,
  getRandomChallenge,
  grantChallengeReward,
  ELITE_CHALLENGES,
  type EliteChallenge,
  type ChallengeMetrics,
} from '../EliteChallenge';
import { RunManager } from '../RunManager';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<ChallengeMetrics> = {}): ChallengeMetrics {
  return {
    avgPowerW:      200,
    peakPowerW:     300,
    ftpW:           200,
    everStopped:    false,
    elapsedSeconds: 120,
    ...overrides,
  };
}

// ─── ELITE_CHALLENGES pool ─────────────────────────────────────────────────────

describe('ELITE_CHALLENGES pool', () => {
  it('contains exactly 5 challenges', () => {
    expect(ELITE_CHALLENGES).toHaveLength(5);
  });

  it('every challenge has a unique id', () => {
    const ids = ELITE_CHALLENGES.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ELITE_CHALLENGES.length);
  });

  it('every challenge has a non-empty title', () => {
    ELITE_CHALLENGES.forEach(c => expect(c.title.length).toBeGreaterThan(0));
  });

  it('every challenge has a non-empty conditionText', () => {
    ELITE_CHALLENGES.forEach(c => expect(c.conditionText.length).toBeGreaterThan(0));
  });

  it('every challenge has a valid condition type', () => {
    const validTypes = new Set([
      'avg_power_above_ftp_pct',
      'peak_power_above_ftp_pct',
      'complete_no_stop',
      'time_under_seconds',
    ]);
    ELITE_CHALLENGES.forEach(c => {
      expect(validTypes.has(c.condition.type)).toBe(true);
    });
  });

  it('every challenge with a gold reward has a positive goldAmount', () => {
    ELITE_CHALLENGES.filter(c => c.reward.type === 'gold').forEach(c => {
      expect(c.reward.goldAmount).toBeGreaterThan(0);
    });
  });

  it('every challenge with an item reward has a non-empty item key', () => {
    ELITE_CHALLENGES.filter(c => c.reward.type === 'item').forEach(c => {
      expect(c.reward.item).toBeTruthy();
    });
  });
});

// ─── getRandomChallenge ───────────────────────────────────────────────────────

describe('getRandomChallenge', () => {
  it('returns an object that exists in ELITE_CHALLENGES', () => {
    const challenge = getRandomChallenge();
    const found = ELITE_CHALLENGES.find(c => c.id === challenge.id);
    expect(found).toBeDefined();
  });

  it('returns different challenges across many calls (probabilistic)', () => {
    // With 5 challenges, 50 calls should produce at least 2 different ones
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(getRandomChallenge().id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ─── evaluateChallenge – avg_power_above_ftp_pct ──────────────────────────────

describe('evaluateChallenge – avg_power_above_ftp_pct', () => {
  const challenge: EliteChallenge = {
    id: 'test_avg',
    title: 'Test',
    flavorText: '',
    conditionText: 'Avg power > 110% FTP',
    condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.10 },
    reward: { type: 'gold', goldAmount: 50, description: 'earn 50 gold' },
  };

  it('returns true when avgPowerW is clearly at the threshold', () => {
    // 200 * 1.10 = 220.00000000000003 in IEEE 754 floating point.
    // Use 221 to be unambiguously at/above the threshold.
    const metrics = makeMetrics({ avgPowerW: 221, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(true);
  });

  it('returns true when avgPowerW exceeds the threshold', () => {
    const metrics = makeMetrics({ avgPowerW: 250, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(true);
  });

  it('returns false when avgPowerW is below the threshold', () => {
    const metrics = makeMetrics({ avgPowerW: 219, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(false);
  });

  it('returns false when avgPowerW is zero', () => {
    const metrics = makeMetrics({ avgPowerW: 0, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(false);
  });

  it('uses a higher ftpMultiplier correctly (120%)', () => {
    const hardChallenge: EliteChallenge = {
      ...challenge,
      condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.20 },
    };
    expect(evaluateChallenge(hardChallenge, makeMetrics({ avgPowerW: 240, ftpW: 200 }))).toBe(true);
    expect(evaluateChallenge(hardChallenge, makeMetrics({ avgPowerW: 239, ftpW: 200 }))).toBe(false);
  });
});

// ─── evaluateChallenge – peak_power_above_ftp_pct ────────────────────────────

describe('evaluateChallenge – peak_power_above_ftp_pct', () => {
  const challenge: EliteChallenge = {
    id: 'test_peak',
    title: 'Test',
    flavorText: '',
    conditionText: 'Peak power > 150% FTP',
    condition: { type: 'peak_power_above_ftp_pct', ftpMultiplier: 1.50 },
    reward: { type: 'item', item: 'tailwind', description: 'receive a Tailwind' },
  };

  it('returns true when peakPowerW meets the threshold exactly', () => {
    const metrics = makeMetrics({ peakPowerW: 300, ftpW: 200 }); // 200 × 1.5 = 300
    expect(evaluateChallenge(challenge, metrics)).toBe(true);
  });

  it('returns true when peakPowerW exceeds the threshold', () => {
    const metrics = makeMetrics({ peakPowerW: 500, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(true);
  });

  it('returns false when peakPowerW is below the threshold', () => {
    const metrics = makeMetrics({ peakPowerW: 299, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(false);
  });

  it('is not influenced by avgPowerW', () => {
    // avgPower is sky-high but peak is low
    const metrics = makeMetrics({ avgPowerW: 1000, peakPowerW: 100, ftpW: 200 });
    expect(evaluateChallenge(challenge, metrics)).toBe(false);
  });
});

// ─── evaluateChallenge – complete_no_stop ─────────────────────────────────────

describe('evaluateChallenge – complete_no_stop', () => {
  const challenge: EliteChallenge = {
    id: 'test_no_stop',
    title: 'Test',
    flavorText: '',
    conditionText: 'Never stop',
    condition: { type: 'complete_no_stop' },
    reward: { type: 'gold', goldAmount: 40, description: 'earn 40 gold' },
  };

  it('returns true when everStopped is false', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ everStopped: false }))).toBe(true);
  });

  it('returns false when everStopped is true', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ everStopped: true }))).toBe(false);
  });
});

// ─── evaluateChallenge – time_under_seconds ───────────────────────────────────

describe('evaluateChallenge – time_under_seconds', () => {
  const challenge: EliteChallenge = {
    id: 'test_time',
    title: 'Test',
    flavorText: '',
    conditionText: 'Finish in under 3 minutes',
    condition: { type: 'time_under_seconds', timeLimitSeconds: 180 },
    reward: { type: 'gold', goldAmount: 80, description: 'earn 80 gold' },
  };

  it('returns true when elapsedSeconds is strictly less than the limit', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ elapsedSeconds: 179 }))).toBe(true);
  });

  it('returns false when elapsedSeconds equals the limit', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ elapsedSeconds: 180 }))).toBe(false);
  });

  it('returns false when elapsedSeconds exceeds the limit', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ elapsedSeconds: 240 }))).toBe(false);
  });

  it('returns true for a very short elapsed time', () => {
    expect(evaluateChallenge(challenge, makeMetrics({ elapsedSeconds: 1 }))).toBe(true);
  });
});

// ─── formatChallengeText ──────────────────────────────────────────────────────

describe('formatChallengeText', () => {
  it('substitutes {ftp_watts} with rounded threshold (110% of 200W = 220W)', () => {
    const challenge: EliteChallenge = {
      id: 'x',
      title: 'x',
      flavorText: '',
      conditionText: 'Avg power above 110% of your FTP ({ftp_watts} W).',
      condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.10 },
      reward: { type: 'gold', goldAmount: 10, description: '' },
    };
    expect(formatChallengeText(challenge, 200)).toBe('Avg power above 110% of your FTP (220 W).');
  });

  it('rounds the computed threshold (rounds half-up)', () => {
    const challenge: EliteChallenge = {
      id: 'x',
      title: 'x',
      flavorText: '',
      conditionText: '{ftp_watts}',
      condition: { type: 'avg_power_above_ftp_pct', ftpMultiplier: 1.5 },
      reward: { type: 'gold', goldAmount: 10, description: '' },
    };
    // 183 * 1.5 = 274.5 → rounds to 275
    expect(formatChallengeText(challenge, 183)).toBe('275');
  });

  it('does not replace {ftp_watts} for challenges without ftpMultiplier', () => {
    const challenge: EliteChallenge = {
      id: 'x',
      title: 'x',
      flavorText: '',
      conditionText: 'Complete without stopping. ({ftp_watts} placeholder should remain)',
      condition: { type: 'complete_no_stop' },
      reward: { type: 'gold', goldAmount: 10, description: '' },
    };
    const result = formatChallengeText(challenge, 200);
    expect(result).toContain('{ftp_watts}');
  });

  it('handles time_under_seconds challenge (no substitution)', () => {
    const challenge: EliteChallenge = {
      id: 'x',
      title: 'x',
      flavorText: '',
      conditionText: 'Finish in under 3 minutes.',
      condition: { type: 'time_under_seconds', timeLimitSeconds: 180 },
      reward: { type: 'gold', goldAmount: 10, description: '' },
    };
    expect(formatChallengeText(challenge, 250)).toBe('Finish in under 3 minutes.');
  });

  it('works for all pre-defined challenges without throwing', () => {
    ELITE_CHALLENGES.forEach(c => {
      expect(() => formatChallengeText(c, 200)).not.toThrow();
    });
  });
});

// ─── grantChallengeReward ─────────────────────────────────────────────────────

describe('grantChallengeReward', () => {
  let runManager: RunManager;

  beforeEach(() => {
    runManager = new RunManager();
    runManager.startNewRun(3, 10, 'normal');
  });

  it('adds gold to the run for a gold reward', () => {
    const challenge: EliteChallenge = {
      id: 'r_gold',
      title: 'Gold test',
      flavorText: '',
      conditionText: '',
      condition: { type: 'complete_no_stop' },
      reward: { type: 'gold', goldAmount: 60, description: 'earn 60 gold' },
    };
    const before = runManager.getRun()!.gold;
    grantChallengeReward(challenge, runManager);
    expect(runManager.getRun()!.gold).toBe(before + 60);
  });

  it('adds an item to inventory for an item reward', () => {
    const challenge: EliteChallenge = {
      id: 'r_item',
      title: 'Item test',
      flavorText: '',
      conditionText: '',
      condition: { type: 'complete_no_stop' },
      reward: { type: 'item', item: 'tailwind', description: 'receive a Tailwind' },
    };
    grantChallengeReward(challenge, runManager);
    expect(runManager.getRun()!.inventory).toContain('tailwind');
  });

  it('does not crash when reward.goldAmount is undefined', () => {
    const challenge: EliteChallenge = {
      id: 'r_bad_gold',
      title: 'Bad gold',
      flavorText: '',
      conditionText: '',
      condition: { type: 'complete_no_stop' },
      reward: { type: 'gold', description: 'nothing' },  // goldAmount missing
    };
    expect(() => grantChallengeReward(challenge, runManager)).not.toThrow();
  });
});
