import { describe, it, expect } from 'vitest';
import { KM_TO_MI, MI_TO_KM, formatFixed, isCloseToInteger } from '../UnitConversions';

describe('UnitConversions', () => {
  it('round-trips 3 miles through km without losing integer status', () => {
    const miles = 3.0;
    const km = miles * MI_TO_KM;
    const backToMiles = km * KM_TO_MI;
    
    expect(isCloseToInteger(backToMiles)).toBe(true);
    expect(formatFixed(backToMiles)).toBe("3");
  });

  it('formats decimals correctly', () => {
    expect(formatFixed(3.5)).toBe("3.5");
    expect(formatFixed(3.00000000004)).toBe("3");
    expect(formatFixed(2.99999999996)).toBe("3");
  });

  it('MI_TO_KM is precise', () => {
    // 1 mile is exactly 1.609344 km
    expect(MI_TO_KM).toBe(1.609344);
  });
});
