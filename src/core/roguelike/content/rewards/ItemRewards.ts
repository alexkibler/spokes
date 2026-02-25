import { RewardDefinition } from '../../registry/types';

export const TeleportReward: RewardDefinition = {
  id: 'teleport',
  label: 'item.teleport',
  description: 'reward.pool.teleport.desc',
  rarity: 'common',
  apply: (run) => run.addToInventory('teleport'),
};

export const DirtTiresReward: RewardDefinition = {
  id: 'dirt_tires',
  label: 'item.dirt_tires',
  description: 'reward.pool.dirt_tires.desc',
  rarity: 'uncommon',
  equipmentSlot: 'tires',
  apply: (run) => run.addToInventory('dirt_tires'),
};

export const AeroHelmetReward: RewardDefinition = {
  id: 'aero_helmet',
  label: 'item.aero_helmet',
  description: 'reward.pool.aero_helmet.desc',
  rarity: 'uncommon',
  equipmentSlot: 'helmet',
  apply: (run) => run.addToInventory('aero_helmet'),
};

export const CarbonFrameReward: RewardDefinition = {
  id: 'carbon_frame',
  label: 'item.carbon_frame',
  description: 'reward.pool.carbon_frame.desc',
  rarity: 'rare',
  equipmentSlot: 'frame',
  apply: (run) => run.addToInventory('carbon_frame'),
};

export const AntigravPedalsReward: RewardDefinition = {
  id: 'antigrav_pedals',
  label: 'item.antigrav_pedals',
  description: 'reward.pool.antigrav_pedals.desc',
  rarity: 'rare',
  equipmentSlot: 'pedals',
  apply: (run) => run.addToInventory('antigrav_pedals'),
};

export const TailwindReward: RewardDefinition = {
  id: 'tailwind',
  label: 'item.tailwind',
  description: 'reward.pool.tailwind.desc',
  rarity: 'rare',
  available: (run) => !(run.getRun()?.inventory.includes('tailwind') ?? false),
  apply: (run) => run.addToInventory('tailwind'),
};
