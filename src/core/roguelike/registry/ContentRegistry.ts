// src/roguelike/registry/ContentRegistry.ts

import type { RunManager } from '../RunManager';
import { ItemDefinition, RewardDefinition, RewardRarity } from './types';

const RARITY_WEIGHTS: Record<RewardRarity, number> = {
  common: 60,
  uncommon: 30,
  rare: 10,
};

export class ContentRegistry {
  private items = new Map<string, ItemDefinition>();
  private rewards = new Map<string, RewardDefinition>();

  public registerItem(def: ItemDefinition): void {
    if (this.items.has(def.id)) {
      console.warn(`[ContentRegistry] Overwriting item definition for ${def.id}`);
    }
    this.items.set(def.id, def);
  }

  public registerReward(def: RewardDefinition): void {
    if (this.rewards.has(def.id)) {
      console.warn(`[ContentRegistry] Overwriting reward definition for ${def.id}`);
    }
    this.rewards.set(def.id, def);
  }

  public getItem(id: string): ItemDefinition | undefined {
    return this.items.get(id);
  }

  public getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  public getReward(id: string): RewardDefinition | undefined {
    return this.rewards.get(id);
  }

  /**
   * Picks `count` distinct rewards from the pool using weighted-random selection.
   * Excludes rewards whose `available()` predicate returns false.
   */
  public getLootPool(count: number, runManager: RunManager): RewardDefinition[] {
    const pool = Array.from(this.rewards.values()).filter(r => !r.available || r.available(runManager));
    const results: RewardDefinition[] = [];
    const used = new Set<string>();

    // Safety break if we request more unique rewards than available
    if (pool.length <= count) {
      return pool;
    }

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
}
