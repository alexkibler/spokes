import { ItemDefinition } from '../../registry/types';

export const GoldCrank: ItemDefinition = {
  id: 'gold_crank',
  label: 'item.gold_crank',
  slot: 'cranks',
  rarity: 'rare',
  modifier: {
    powerMult: 1.25,
  },
};
