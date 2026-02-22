/**
 * RewardPool.ts
 *
 * Defines the pool of rewards offered to the player after clearing a ride segment.
 * Rewards are selected with weighted rarity and applied immediately on pick.
 */

import { RunStateManager } from './RunState';

export type RewardRarity = 'common' | 'uncommon' | 'rare';

export interface RewardDefinition {
  id: string;
  label: string;
  description: string;
  rarity: RewardRarity;
  /** Optional: return false to exclude this reward from the pool this run */
  available?: () => boolean;
  apply: () => void;
}

// Target: 200W FTP → ~500W by end of a full run (≈2.5× powerMult with optimal play)
// Assumes ~10 first-clear segments. Power-focused player + 1 gold crank ≈ 1.07^10 × 1.25 ≈ 2.46×

const POOL: RewardDefinition[] = [
  // ── Common ────────────────────────────────────────────────────────────────
  {
    id: 'power_4',
    label: 'POWER BOOST',
    description: '+4% permanent power\n(stacks)',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.04 }),
  },
  {
    id: 'aero_2',
    label: 'AERO TWEAK',
    description: '+2% drag reduction\n(stacks)',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ dragReduction: 0.02 }),
  },
  {
    id: 'weight_3',
    label: 'LIGHTER LOAD',
    description: '-3% rider weight\n(stacks)',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ weightMult: 0.97 }),
  },
  {
    id: 'gold_20',
    label: 'COIN CACHE',
    description: '+20 gold',
    rarity: 'common',
    apply: () => RunStateManager.addGold(20),
  },
  {
    id: 'teleport',
    label: 'TELEPORT SCROLL',
    description: 'Warp to any\nvisited node',
    rarity: 'common',
    apply: () => RunStateManager.addToInventory('teleport'),
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'power_7',
    label: 'POWER SURGE',
    description: '+7% permanent power\n(stacks)',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.07 }),
  },
  {
    id: 'aero_3',
    label: 'AERO UPGRADE',
    description: '+3% drag reduction\n(stacks)',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ dragReduction: 0.03 }),
  },
  {
    id: 'weight_6',
    label: 'WEIGHT SHED',
    description: '-6% rider weight\n(stacks)',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ weightMult: 0.94 }),
  },
  {
    id: 'gold_40',
    label: 'GOLD CACHE',
    description: '+40 gold',
    rarity: 'uncommon',
    apply: () => RunStateManager.addGold(40),
  },
  {
    id: 'aero_helmet',
    label: 'AERO HELMET',
    description: '+3% drag reduction\n(adds to inventory)',
    rarity: 'uncommon',
    apply: () => {
      RunStateManager.addToInventory('aero_helmet');
      RunStateManager.applyModifier({ dragReduction: 0.03 });
    },
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: 'power_12',
    label: 'OVERDRIVE',
    description: '+12% permanent power\n(stacks)',
    rarity: 'rare',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.12 }),
  },
  {
    id: 'antigrav_pedals',
    label: 'ANTIGRAV PEDALS',
    description: '-8% rider weight\n(stacks)',
    rarity: 'rare',
    apply: () => {
      RunStateManager.addToInventory('antigrav_pedals');
      RunStateManager.applyModifier({ weightMult: 0.92 });
    },
  },
  {
    id: 'tailwind',
    label: 'TAILWIND',
    description: '2× power toggle\nduring next ride',
    rarity: 'rare',
    available: () => !(RunStateManager.getRun()?.inventory.includes('tailwind') ?? false),
    apply: () => RunStateManager.addToInventory('tailwind'),
  },
  {
    id: 'gold_75',
    label: 'TREASURE TROVE',
    description: '+75 gold',
    rarity: 'rare',
    apply: () => RunStateManager.addGold(75),
  },
];

const RARITY_WEIGHTS: Record<RewardRarity, number> = {
  common: 60,
  uncommon: 30,
  rare: 10,
};

/**
 * Picks `count` distinct rewards from the pool using weighted-random selection.
 * Excludes rewards whose `available()` predicate returns false.
 */
export function pickRewards(count: number): RewardDefinition[] {
  const pool = POOL.filter(r => !r.available || r.available());
  const results: RewardDefinition[] = [];
  const used = new Set<string>();

  while (results.length < count) {
    const candidates = pool.filter(r => !used.has(r.id));
    if (candidates.length === 0) break;

    const totalWeight = candidates.reduce((sum, r) => sum + RARITY_WEIGHTS[r.rarity], 0);
    let rand = Math.random() * totalWeight;
    let picked = candidates[candidates.length - 1]; // fallback for float precision

    for (const r of candidates) {
      rand -= RARITY_WEIGHTS[r.rarity];
      if (rand <= 0) {
        picked = r;
        break;
      }
    }

    results.push(picked);
    used.add(picked.id);
  }

  return results;
}
