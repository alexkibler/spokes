/**
 * RewardPool.ts
 *
 * Defines the pool of rewards offered to the player after clearing a ride segment.
 * Rewards are selected with weighted rarity and applied immediately on pick.
 */

import { RunStateManager } from './RunState';
import { EQUIPMENT_DATABASE } from './Equipment';

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

const POOL: RewardDefinition[] = [
  // ── Common ────────────────────────────────────────────────────────────────
  {
    id: 'vented_helmet',
    label: 'VENTED HELMET',
    description: EQUIPMENT_DATABASE['vented_helmet'].description,
    rarity: 'common',
    apply: () => RunStateManager.equipItem('vented_helmet'),
  },
  {
    id: 'sneakers',
    label: 'SNEAKERS',
    description: EQUIPMENT_DATABASE['sneakers'].description,
    rarity: 'common',
    apply: () => RunStateManager.equipItem('sneakers'),
  },
  {
    id: 'puncture_proof_tires',
    label: 'COMMUTER TIRES',
    description: EQUIPMENT_DATABASE['puncture_proof_tires'].description,
    rarity: 'common',
    apply: () => RunStateManager.equipItem('puncture_proof_tires'),
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
    apply: () => RunStateManager.addPassiveItem('teleport'),
  },

  // ── Uncommon ──────────────────────────────────────────────────────────────
  {
    id: 'aero_helmet',
    label: 'AERO HELMET',
    description: EQUIPMENT_DATABASE['aero_helmet'].description,
    rarity: 'uncommon',
    apply: () => RunStateManager.equipItem('aero_helmet'),
  },
  {
    id: 'elite_skinsuit',
    label: 'ELITE SKINSUIT',
    description: EQUIPMENT_DATABASE['elite_skinsuit'].description,
    rarity: 'uncommon',
    apply: () => RunStateManager.equipItem('elite_skinsuit'),
  },
  {
    id: 'cycling_shoes',
    label: 'CYCLING SHOES',
    description: EQUIPMENT_DATABASE['cycling_shoes'].description,
    rarity: 'uncommon',
    apply: () => RunStateManager.equipItem('cycling_shoes'),
  },
  {
    id: 'shallow_carbon_rims',
    label: 'CLIMBING WHEELS',
    description: EQUIPMENT_DATABASE['shallow_carbon_rims'].description,
    rarity: 'uncommon',
    apply: () => RunStateManager.equipItem('shallow_carbon_rims'),
  },
  {
    id: 'aluminum_crit_frame',
    label: 'CRIT FRAME',
    description: EQUIPMENT_DATABASE['aluminum_crit_frame'].description,
    rarity: 'uncommon',
    apply: () => RunStateManager.equipItem('aluminum_crit_frame'),
  },
  {
    id: 'gold_40',
    label: 'GOLD CACHE',
    description: '+40 gold',
    rarity: 'uncommon',
    apply: () => RunStateManager.addGold(40),
  },

  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    id: 'carbon_frame',
    label: 'CARBON FRAME',
    description: EQUIPMENT_DATABASE['carbon_frame'].description,
    rarity: 'rare',
    apply: () => RunStateManager.equipItem('carbon_frame'),
  },
  {
    id: 'deep_aero_wheels',
    label: 'DEEP AERO WHEELS',
    description: EQUIPMENT_DATABASE['deep_aero_wheels'].description,
    rarity: 'rare',
    apply: () => RunStateManager.equipItem('deep_aero_wheels'),
  },
  {
    id: 'electronic_2x12',
    label: 'ELECTRONIC SHIFTING',
    description: EQUIPMENT_DATABASE['electronic_2x12'].description,
    rarity: 'rare',
    apply: () => RunStateManager.equipItem('electronic_2x12'),
  },
  {
    id: 'carbon_shoes',
    label: 'CARBON SHOES',
    description: EQUIPMENT_DATABASE['carbon_shoes'].description,
    rarity: 'rare',
    apply: () => RunStateManager.equipItem('carbon_shoes'),
  },
  {
    id: 'tailwind',
    label: 'TAILWIND',
    description: '2× power toggle\nduring next ride',
    rarity: 'rare',
    available: () => !(RunStateManager.getRun()?.passiveItems.includes('tailwind') ?? false),
    apply: () => RunStateManager.addPassiveItem('tailwind'),
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
