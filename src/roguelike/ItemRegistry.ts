/**
 * ItemRegistry.ts
 *
 * Central source of truth for all item definitions.
 * Describes each item's equipment slot (if any) and the RunModifiers it
 * provides when equipped. Consumables have no slot and provide no passive
 * modifier; they are triggered through gameplay.
 */

import type { RunModifiers } from './RunState';
import i18n from '../i18n';

export type EquipmentSlot = 'helmet' | 'frame' | 'cranks' | 'pedals' | 'tires';

export interface ItemDef {
  id: string;
  label: string;
  /** Undefined for consumables. */
  slot?: EquipmentSlot;
  rarity?: 'common' | 'uncommon' | 'rare';
  /** The modifier applied to RunModifiers when this item is equipped. */
  modifier?: Partial<RunModifiers>;
}

export const ITEM_REGISTRY: Record<string, ItemDef> = {
  tailwind:        { id: 'tailwind',        label: 'item.tailwind',         rarity: 'rare' },
  teleport:        { id: 'teleport',        label: 'item.teleport',  rarity: 'common' },
  reroll_voucher:  { id: 'reroll_voucher',  label: 'item.reroll_voucher',   rarity: 'common' },
  aero_helmet:     { id: 'aero_helmet',     label: 'item.aero_helmet',      slot: 'helmet', rarity: 'uncommon', modifier: { dragReduction: 0.03 } },
  gold_crank:      { id: 'gold_crank',      label: 'item.gold_crank', slot: 'cranks', rarity: 'rare',     modifier: { powerMult: 1.25 } },
  antigrav_pedals: { id: 'antigrav_pedals', label: 'item.antigrav_pedals',  slot: 'pedals', rarity: 'rare',     modifier: { weightMult: 0.92 } },
  dirt_tires:      { id: 'dirt_tires',      label: 'item.dirt_tires',       slot: 'tires',  rarity: 'common',   modifier: { crrMult: 0.65 } },
  carbon_frame:    { id: 'carbon_frame',    label: 'item.carbon_frame',     slot: 'frame',  rarity: 'rare',     modifier: { weightMult: 0.88, dragReduction: 0.03 } },
};

export const SLOT_LABELS: Record<EquipmentSlot, string> = {
  helmet: 'HELMET',
  frame:  'FRAME',
  cranks: 'CRANKS',
  pedals: 'PEDALS',
  tires:  'TIRES',
};

export const ALL_SLOTS: EquipmentSlot[] = ['helmet', 'frame', 'cranks', 'pedals', 'tires'];

/** Returns human-readable modifier lines for display (e.g. in swap warnings). */
export function formatModifierLines(mod: Partial<RunModifiers>): string[] {
  const lines: string[] = [];
  if (mod.powerMult !== undefined) {
    const pct = Math.round((mod.powerMult - 1) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    lines.push(i18n.t('item.modifier.power', { val }));
  }
  if (mod.dragReduction !== undefined) {
    const pct = Math.round(mod.dragReduction * 100);
    lines.push(i18n.t('item.modifier.aero', { val: pct }));
  }
  if (mod.weightMult !== undefined) {
    const pct = Math.round((mod.weightMult - 1) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    lines.push(i18n.t('item.modifier.weight', { val }));
  }
  if (mod.crrMult !== undefined) {
    const pct = Math.round((mod.crrMult - 1) * 100);
    const val = (pct >= 0 ? '+' : '') + pct;
    lines.push(i18n.t('item.modifier.rolling', { val }));
  }
  return lines;
}
