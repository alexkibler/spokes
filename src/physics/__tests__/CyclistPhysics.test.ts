import { describe, it, expect } from 'vitest';
import {
  calculateAcceleration,
  msToKmh,
  DEFAULT_PHYSICS,
} from '../CyclistPhysics';

describe('calculateAcceleration', () => {
  it('gives negative acceleration (deceleration) when coasting at 10 m/s on flat', () => {
    const acc = calculateAcceleration(0, 10, { ...DEFAULT_PHYSICS, grade: 0 });
    expect(acc).toBeLessThan(0);
  });

  it('gives positive acceleration when pedaling hard (400W) at low speed (5 m/s) on flat', () => {
    const acc = calculateAcceleration(400, 5, { ...DEFAULT_PHYSICS, grade: 0 });
    expect(acc).toBeGreaterThan(0);
  });

  it('gives positive acceleration when coasting downhill at low speed', () => {
    const acc = calculateAcceleration(0, 2, { ...DEFAULT_PHYSICS, grade: -0.05 });
    expect(acc).toBeGreaterThan(0);
  });

  it('gives near-zero acceleration at terminal velocity on a descent', () => {
    // For a 5% descent, terminal velocity is roughly 13.5 m/s for default physics
    const config = { ...DEFAULT_PHYSICS, grade: -0.05 };
    const vTerminal = 13.55; 
    const acc = calculateAcceleration(0, vTerminal, config);
    expect(acc).toBeCloseTo(0, 1);
  });
});

describe('msToKmh', () => {
  it('converts 0 m/s to 0 km/h', () => {
    expect(msToKmh(0)).toBe(0);
  });

  it('converts 10 m/s to 36 km/h', () => {
    expect(msToKmh(10)).toBeCloseTo(36, 5);
  });
});
