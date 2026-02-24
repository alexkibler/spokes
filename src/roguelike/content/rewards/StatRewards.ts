import { RewardDefinition } from '../../registry/types';

export const PowerBoostCommon: RewardDefinition = {
  id: 'power_4',
  label: 'reward.pool.power_boost.label',
  description: 'reward.pool.power_boost.desc',
  rarity: 'common',
  apply: (run) => run.applyModifier({ powerMult: 1.04 }, 'POWER BOOST'),
};

export const AeroTweakCommon: RewardDefinition = {
  id: 'aero_2',
  label: 'reward.pool.aero_tweak.label',
  description: 'reward.pool.aero_tweak.desc',
  rarity: 'common',
  apply: (run) => run.applyModifier({ dragReduction: 0.02 }, 'AERO TWEAK'),
};

export const LighterLoadCommon: RewardDefinition = {
  id: 'weight_3',
  label: 'reward.pool.lighter_load.label',
  description: 'reward.pool.lighter_load.desc',
  rarity: 'common',
  apply: (run) => run.applyModifier({ weightMult: 0.97 }, 'LIGHTER LOAD'),
};

export const PowerSurgeUncommon: RewardDefinition = {
  id: 'power_7',
  label: 'reward.pool.power_surge.label',
  description: 'reward.pool.power_surge.desc',
  rarity: 'uncommon',
  apply: (run) => run.applyModifier({ powerMult: 1.07 }, 'POWER SURGE'),
};

export const AeroUpgradeUncommon: RewardDefinition = {
  id: 'aero_3',
  label: 'reward.pool.aero_upgrade.label',
  description: 'reward.pool.aero_upgrade.desc',
  rarity: 'uncommon',
  apply: (run) => run.applyModifier({ dragReduction: 0.03 }, 'AERO UPGRADE'),
};

export const WeightShedUncommon: RewardDefinition = {
  id: 'weight_6',
  label: 'reward.pool.weight_shed.label',
  description: 'reward.pool.weight_shed.desc',
  rarity: 'uncommon',
  apply: (run) => run.applyModifier({ weightMult: 0.94 }, 'WEIGHT SHED'),
};

export const OverdriveRare: RewardDefinition = {
  id: 'power_12',
  label: 'reward.pool.overdrive.label',
  description: 'reward.pool.overdrive.desc',
  rarity: 'rare',
  apply: (run) => run.applyModifier({ powerMult: 1.12 }, 'OVERDRIVE'),
};
