/**
 * RewardPool.ts
 *
 * Helper to pick rewards from the registry.
 */

import { RunManager } from './RunManager';
import type { RewardDefinition, RewardRarity } from './registry/types';

export type { RewardDefinition, RewardRarity };

/**
 * Picks `count` distinct rewards from the pool using weighted-random selection.
 * Excludes rewards whose `available()` predicate returns false.
 */
export function pickRewards(count: number, runManager: RunManager): RewardDefinition[] {
  return runManager.registry.getLootPool(count, runManager);
}
