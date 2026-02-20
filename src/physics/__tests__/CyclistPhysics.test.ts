import { describe, it, expect } from 'vitest';
import {
  powerToVelocityMs,
  msToKmh,
  DEFAULT_PHYSICS,
} from '../CyclistPhysics';

describe('powerToVelocityMs', () => {
  it('returns 0 m/s for 0 W', () => {
    expect(powerToVelocityMs(0)).toBe(0);
  });

  it('returns 0 m/s for negative watts', () => {
    expect(powerToVelocityMs(-50)).toBe(0);
    expect(powerToVelocityMs(-0.001)).toBe(0);
  });

  it('returns between 10.0 and 10.4 m/s at 250 W (default config)', () => {
    const v = powerToVelocityMs(250);
    expect(v).toBeGreaterThan(10.0);
    expect(v).toBeLessThan(10.4);
  });

  it('is monotonically increasing: 100 W < 200 W < 300 W', () => {
    const v100 = powerToVelocityMs(100);
    const v200 = powerToVelocityMs(200);
    const v300 = powerToVelocityMs(300);
    expect(v100).toBeLessThan(v200);
    expect(v200).toBeLessThan(v300);
  });

  it('lower CdA produces higher speed at the same power', () => {
    const vDefault = powerToVelocityMs(250, DEFAULT_PHYSICS);
    const vLowDrag = powerToVelocityMs(250, { ...DEFAULT_PHYSICS, cdA: 0.2 });
    expect(vLowDrag).toBeGreaterThan(vDefault);
  });

  it('5% grade produces lower speed than flat at the same power', () => {
    const vFlat = powerToVelocityMs(250, DEFAULT_PHYSICS);
    const vClimb = powerToVelocityMs(250, { ...DEFAULT_PHYSICS, grade: 0.05 });
    expect(vClimb).toBeLessThan(vFlat);
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
