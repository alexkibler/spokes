import { ItemDefinition } from '../../registry/types';

export const AeroHelmet: ItemDefinition = {
  id: 'aero_helmet',
  label: 'item.aero_helmet',
  slot: 'helmet',
  rarity: 'uncommon',
  modifier: {
    dragReduction: 0.03,
  },
};
