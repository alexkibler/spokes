/**
 * RewardPool.ts
 *
 * Defines the pool of rewards offered to the player after clearing a ride segment.
 * Rewards are selected with weighted rarity and applied immediately on pick.
 */

import { RunStateManager } from './RunState';
import type { EquipmentSlot } from './ItemRegistry';

export type RewardRarity = 'common' | 'uncommon' | 'rare';

export interface RewardDefinition {
  id: string;
  label: string;
  description: string;
  rarity: RewardRarity;
  /** Set for equipment items — the slot this item occupies. */
  equipmentSlot?: EquipmentSlot;
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
    label: 'reward.pool.power_boost.label',
    description: 'reward.pool.power_boost.desc',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.04 }, 'POWER BOOST'),
  },
  {
    id: 'aero_2',
    label: 'reward.pool.aero_tweak.label',
    description: 'reward.pool.aero_tweak.desc',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ dragReduction: 0.02 }, 'AERO TWEAK'),
  },
  {
    id: 'weight_3',
    label: 'reward.pool.lighter_load.label',
    description: 'reward.pool.lighter_load.desc',
    rarity: 'common',
    apply: () => RunStateManager.applyModifier({ weightMult: 0.97 }, 'LIGHTER LOAD'),
  },
  {
    id: 'gold_20',
    label: 'reward.pool.coin_cache.label',
    description: 'reward.pool.coin_cache.desc',
    rarity: 'common',
    apply: () => RunStateManager.addGold(20),
  },
  {
    id: 'teleport',
    label: 'item.teleport',
    description: 'reward.pool.teleport.desc',
    rarity: 'common',
    apply: () => RunStateManager.addToInventory('teleport'),
  },

  {
    id: 'dirt_tires',
    label: 'item.dirt_tires',
    description: 'reward.pool.dirt_tires.desc',
    rarity: 'uncommon',
    equipmentSlot: 'tires',
    apply: () => RunStateManager.addToInventory('dirt_tires'),
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'power_7',
    label: 'reward.pool.power_surge.label',
    description: 'reward.pool.power_surge.desc',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.07 }, 'POWER SURGE'),
  },
  {
    id: 'aero_3',
    label: 'reward.pool.aero_upgrade.label',
    description: 'reward.pool.aero_upgrade.desc',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ dragReduction: 0.03 }, 'AERO UPGRADE'),
  },
  {
    id: 'weight_6',
    label: 'reward.pool.weight_shed.label',
    description: 'reward.pool.weight_shed.desc',
    rarity: 'uncommon',
    apply: () => RunStateManager.applyModifier({ weightMult: 0.94 }, 'WEIGHT SHED'),
  },
  {
    id: 'gold_40',
    label: 'reward.pool.gold_cache.label',
    description: 'reward.pool.gold_cache.desc',
    rarity: 'uncommon',
    apply: () => RunStateManager.addGold(40),
  },
  {
    id: 'aero_helmet',
    label: 'item.aero_helmet',
    description: 'reward.pool.aero_helmet.desc',
    rarity: 'uncommon',
    equipmentSlot: 'helmet',
    apply: () => RunStateManager.addToInventory('aero_helmet'),
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: 'carbon_frame',
    label: 'item.carbon_frame',
    description: 'reward.pool.carbon_frame.desc',
    rarity: 'rare',
    equipmentSlot: 'frame',
    apply: () => RunStateManager.addToInventory('carbon_frame'),
  },
  {
    id: 'power_12',
    label: 'reward.pool.overdrive.label',
    description: 'reward.pool.overdrive.desc',
    rarity: 'rare',
    apply: () => RunStateManager.applyModifier({ powerMult: 1.12 }, 'OVERDRIVE'),
  },
  {
    id: 'antigrav_pedals',
    label: 'item.antigrav_pedals',
    description: 'reward.pool.antigrav_pedals.desc',
    rarity: 'rare',
    equipmentSlot: 'pedals',
    apply: () => RunStateManager.addToInventory('antigrav_pedals'),
  },
  {
    id: 'tailwind',
    label: 'item.tailwind',
    description: 'reward.pool.tailwind.desc',
    rarity: 'rare',
    available: () => !(RunStateManager.getRun()?.inventory.includes('tailwind') ?? false),
    apply: () => RunStateManager.addToInventory('tailwind'),
  },
  {
    id: 'gold_75',
    label: 'reward.pool.treasure_trove.label',
    description: 'reward.pool.treasure_trove.desc',
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
