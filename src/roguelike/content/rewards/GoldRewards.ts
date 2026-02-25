import { RewardDefinition } from '../../registry/types';

export const Gold20Common: RewardDefinition = {
  id: 'gold_20',
  label: 'reward.pool.coin_cache.label',
  description: 'reward.pool.coin_cache.desc',
  rarity: 'common',
  apply: (run) => run.addGold(20),
};

export const Gold40Uncommon: RewardDefinition = {
  id: 'gold_40',
  label: 'reward.pool.gold_cache.label',
  description: 'reward.pool.gold_cache.desc',
  rarity: 'uncommon',
  apply: (run) => run.addGold(40),
};

export const Gold75Rare: RewardDefinition = {
  id: 'gold_75',
  label: 'reward.pool.treasure_trove.label',
  description: 'reward.pool.treasure_trove.desc',
  rarity: 'rare',
  apply: (run) => run.addGold(75),
};
