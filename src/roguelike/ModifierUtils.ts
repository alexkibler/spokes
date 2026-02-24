import { RunModifiers } from './registry/types';
import i18n from '../i18n';

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
