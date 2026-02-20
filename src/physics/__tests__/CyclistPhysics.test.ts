import { describe, it, expect } from 'vitest';
import {
  powerToVelocityMs,
  calculateAcceleration,
  msToKmh,
  DEFAULT_PHYSICS,
} from '../CyclistPhysics';

describe('powerToVelocityMs', () => {
  it('returns near 0 m/s for 0 W on flat', () => {
    expect(powerToVelocityMs(0)).toBeCloseTo(0, 3);
  });

  it('returns near 0 m/s for negative watts on flat', () => {
    expect(powerToVelocityMs(-50)).toBeCloseTo(0, 3);
    expect(powerToVelocityMs(-0.001)).toBeCloseTo(0, 3);
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

  it('gives near-zero acceleration at terminal velocity', () => {
    const config = { ...DEFAULT_PHYSICS, grade: -0.05 };
    const vTerminal = powerToVelocityMs(0, config);
    const acc = calculateAcceleration(0, vTerminal, config);
    expect(acc).toBeCloseTo(0, 2);
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
