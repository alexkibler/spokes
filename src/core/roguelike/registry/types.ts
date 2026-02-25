// src/roguelike/registry/types.ts

import type { RunManager } from '../RunManager';

export type EquipmentSlot = 'helmet' | 'frame' | 'cranks' | 'pedals' | 'tires';

export const ALL_SLOTS: EquipmentSlot[] = ['helmet', 'frame', 'cranks', 'pedals', 'tires'];

export interface RunModifiers {
  /** Multiplicative power bonus. 1.0 = no bonus. Stacks multiplicatively. */
  powerMult: number;
  /** Additive drag reduction fraction. 0.0 = none, 0.99 = near vacuum. Capped at 0.99. */
  dragReduction: number;
  /** Multiplicative weight factor. 1.0 = normal, 0.01 = near weightless. Stacks multiplicatively, floored at 0.01. */
  weightMult: number;
  /** Multiplicative rolling-resistance factor. 1.0 = normal, <1.0 reduces Crr on all surfaces. Floored at 0.01. */
  crrMult: number;
}

export interface ItemDefinition {
  id: string;
  label: string;
  /** Undefined for consumables. */
  slot?: EquipmentSlot;
  rarity?: 'common' | 'uncommon' | 'rare';
  /** The modifier applied to RunModifiers when this item is equipped. */
  modifier?: Partial<RunModifiers>;
  description?: string; // Often useful
}

export type RewardRarity = 'common' | 'uncommon' | 'rare';

export interface RewardDefinition {
  id: string;
  label: string;
  description: string;
  rarity: RewardRarity;
  /** Set for equipment items — the slot this item occupies. */
  equipmentSlot?: EquipmentSlot;
  /** Optional: return false to exclude this reward from the pool this run */
  available?: (run: RunManager) => boolean;
  apply: (run: RunManager) => void;
  /** Optional: The modifiers this reward grants directly (for StatRewards) */
  statModifiers?: Partial<RunModifiers>;
  /** Optional: The item ID this reward grants (for ItemRewards). Defaults to reward ID if not specified but equipmentSlot is present. */
  itemId?: string;
}
