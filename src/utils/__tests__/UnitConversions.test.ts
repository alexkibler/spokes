import { describe, it, expect } from 'vitest';
import {
  KM_TO_MI,
  MI_TO_KM,
  LB_TO_KG,
  KG_TO_LB,
  formatFixed,
  isCloseToInteger,
} from '../UnitConversions';

// ─── Distance constants ───────────────────────────────────────────────────────

describe('UnitConversions – distance constants', () => {
  it('MI_TO_KM is exactly 1.609344', () => {
    expect(MI_TO_KM).toBe(1.609344);
  });

  it('KM_TO_MI is the reciprocal of MI_TO_KM', () => {
    expect(KM_TO_MI).toBeCloseTo(1 / 1.609344, 10);
  });

  it('round-trips 3 miles through km without losing integer status', () => {
    const miles = 3.0;
    const km = miles * MI_TO_KM;
    const backToMiles = km * KM_TO_MI;

    expect(isCloseToInteger(backToMiles)).toBe(true);
    expect(formatFixed(backToMiles)).toBe('3');
  });

  it('1 km converts to ~0.621371 miles', () => {
    expect(KM_TO_MI).toBeCloseTo(0.621371, 5);
  });

  it('10 km converts to ~6.21371 miles', () => {
    expect(10 * KM_TO_MI).toBeCloseTo(6.21371, 4);
  });

  it('MI_TO_KM × KM_TO_MI is very close to 1', () => {
    expect(MI_TO_KM * KM_TO_MI).toBeCloseTo(1, 12);
  });
});

// ─── Weight constants ─────────────────────────────────────────────────────────

describe('UnitConversions – weight constants', () => {
  it('LB_TO_KG is exactly 0.45359237', () => {
    expect(LB_TO_KG).toBe(0.45359237);
  });

  it('KG_TO_LB is the reciprocal of LB_TO_KG', () => {
    expect(KG_TO_LB).toBeCloseTo(1 / 0.45359237, 8);
  });

  it('LB_TO_KG × KG_TO_LB is very close to 1', () => {
    expect(LB_TO_KG * KG_TO_LB).toBeCloseTo(1, 12);
  });

  it('1 pound is approximately 0.4536 kg', () => {
    expect(LB_TO_KG).toBeCloseTo(0.4536, 3);
  });

  it('1 kg is approximately 2.2046 pounds', () => {
    expect(KG_TO_LB).toBeCloseTo(2.20462, 4);
  });

  it('68 kg converts to approximately 150 lb', () => {
    expect(68 * KG_TO_LB).toBeCloseTo(149.9, 0);
  });

  it('round-trips 70 kg through lb and back within floating-point precision', () => {
    const lb = 70 * KG_TO_LB;
    const backToKg = lb * LB_TO_KG;
    expect(backToKg).toBeCloseTo(70, 10);
  });
});

// ─── isCloseToInteger ─────────────────────────────────────────────────────────

describe('isCloseToInteger', () => {
  it('returns true for an exact integer', () => {
    expect(isCloseToInteger(3)).toBe(true);
    expect(isCloseToInteger(0)).toBe(true);
    expect(isCloseToInteger(-5)).toBe(true);
  });

  it('returns true for a value within the default tolerance (0.0001)', () => {
    expect(isCloseToInteger(3.00009)).toBe(true);
    expect(isCloseToInteger(2.99991)).toBe(true);
  });

  it('returns false for a value outside the default tolerance', () => {
    expect(isCloseToInteger(3.0002)).toBe(false);
    expect(isCloseToInteger(3.5)).toBe(false);
  });

  it('respects a custom tolerance', () => {
    expect(isCloseToInteger(3.05, 0.1)).toBe(true);   // within 0.1
    expect(isCloseToInteger(3.05, 0.01)).toBe(false);  // outside 0.01
  });

  it('handles floating point jitter like 3.0000000000000004', () => {
    expect(isCloseToInteger(3.0000000000000004)).toBe(true);
  });

  it('returns false for values near 0.5 (halfway between integers)', () => {
    expect(isCloseToInteger(0.4999)).toBe(false);
    expect(isCloseToInteger(1.4999)).toBe(false);
  });
});

// ─── formatFixed ─────────────────────────────────────────────────────────────

describe('formatFixed', () => {
  it('strips decimal for exact integers', () => {
    expect(formatFixed(3)).toBe('3');
    expect(formatFixed(0)).toBe('0');
  });

  it('formats decimals with default 1 decimal place', () => {
    expect(formatFixed(3.5)).toBe('3.5');
    expect(formatFixed(3.7)).toBe('3.7');
  });

  it('strips trailing digits for values that round to an integer', () => {
    expect(formatFixed(3.00000000004)).toBe('3');
    expect(formatFixed(2.99999999996)).toBe('3');
  });

  it('respects a custom decimal count', () => {
    expect(formatFixed(3.14159, 2)).toBe('3.14');
    expect(formatFixed(3.14159, 3)).toBe('3.142');
  });

  it('formats negative numbers correctly', () => {
    expect(formatFixed(-3.5)).toBe('-3.5');
    expect(formatFixed(-3.0)).toBe('-3');
  });

  it('works with zero decimal places (integer display)', () => {
    expect(formatFixed(3.7, 0)).toBe('4');
  });

  it('treats values very close to an integer as that integer', () => {
    expect(formatFixed(5.0000001)).toBe('5');
  });
});
