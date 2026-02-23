/**
 * ItemRegistry.ts
 *
 * Central source of truth for all item definitions.
 * Describes each item's equipment slot (if any) and the RunModifiers it
 * provides when equipped. Consumables have no slot and provide no passive
 * modifier; they are triggered through gameplay.
 */

import type { RunModifiers } from './RunState';

export type EquipmentSlot = 'helmet' | 'frame' | 'cranks' | 'pedals' | 'tires';

export interface ItemDef {
  id: string;
  label: string;
  /** Undefined for consumables. */
  slot?: EquipmentSlot;
  /** The modifier applied to RunModifiers when this item is equipped. */
  modifier?: Partial<RunModifiers>;
}

export const ITEM_REGISTRY: Record<string, ItemDef> = {
  tailwind:        { id: 'tailwind',        label: 'TAILWIND' },
  teleport:        { id: 'teleport',        label: 'TELEPORT SCROLL' },
  reroll_voucher:  { id: 'reroll_voucher',  label: 'REROLL VOUCHER' },
  aero_helmet:     { id: 'aero_helmet',     label: 'AERO HELMET',      slot: 'helmet', modifier: { dragReduction: 0.03 } },
  gold_crank:      { id: 'gold_crank',      label: 'SOLID GOLD CRANK', slot: 'cranks', modifier: { powerMult: 1.25 } },
  antigrav_pedals: { id: 'antigrav_pedals', label: 'ANTIGRAV PEDALS',  slot: 'pedals', modifier: { weightMult: 0.92 } },
  dirt_tires:      { id: 'dirt_tires',      label: 'DIRT TIRES',       slot: 'tires',  modifier: { crrMult: 0.65 } },
  carbon_frame:    { id: 'carbon_frame',    label: 'CARBON FRAME',     slot: 'frame',  modifier: { weightMult: 0.88, dragReduction: 0.03 } },
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
    lines.push(`Power: ${pct >= 0 ? '+' : ''}${pct}%`);
  }
  if (mod.dragReduction !== undefined) {
    const pct = Math.round(mod.dragReduction * 100);
    lines.push(`Aero: +${pct}%`);
  }
  if (mod.weightMult !== undefined) {
    const pct = Math.round((mod.weightMult - 1) * 100);
    lines.push(`Weight: ${pct >= 0 ? '+' : ''}${pct}%`);
  }
  if (mod.crrMult !== undefined) {
    const pct = Math.round((mod.crrMult - 1) * 100);
    lines.push(`Rolling resistance: ${pct >= 0 ? '+' : ''}${pct}%`);
  }
  return lines;
}
