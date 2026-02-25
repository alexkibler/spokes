import { describe, it, expect } from 'vitest';
import {
  calculateAcceleration,
  msToKmh,
  msToMph,
  DEFAULT_PHYSICS,
  type PhysicsModifiers,
} from '../CyclistPhysics';

// ─── calculateAcceleration – basic behaviour ──────────────────────────────────

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
    // For a 5% descent, terminal velocity is roughly 14.69 m/s for default physics
    const config = { ...DEFAULT_PHYSICS, grade: -0.05 };
    const vTerminal = 14.69;
    const acc = calculateAcceleration(0, vTerminal, config);
    expect(acc).toBeCloseTo(0, 1);
  });

  it('gives stronger deceleration on a climb than on flat at the same speed', () => {
    const speed = 8;
    const flat  = calculateAcceleration(0, speed, { ...DEFAULT_PHYSICS, grade:  0.00 });
    const climb = calculateAcceleration(0, speed, { ...DEFAULT_PHYSICS, grade:  0.08 });
    expect(climb).toBeLessThan(flat);
  });

  it('gives greater positive acceleration downhill than on flat at the same power', () => {
    const speed = 5;
    const flat     = calculateAcceleration(200, speed, { ...DEFAULT_PHYSICS, grade:  0.00 });
    const downhill = calculateAcceleration(200, speed, { ...DEFAULT_PHYSICS, grade: -0.05 });
    expect(downhill).toBeGreaterThan(flat);
  });

  it('treats zero velocity without division by zero', () => {
    expect(() => calculateAcceleration(200, 0, DEFAULT_PHYSICS)).not.toThrow();
    const acc = calculateAcceleration(200, 0, DEFAULT_PHYSICS);
    expect(isFinite(acc)).toBe(true);
  });

  it('handles negative velocity inputs and returns finite results', () => {
    const acc = calculateAcceleration(0, -1, DEFAULT_PHYSICS);
    expect(isFinite(acc)).toBe(true);
  });

  it('uses DEFAULT_PHYSICS when no config is supplied', () => {
    const acc = calculateAcceleration(200, 5);
    expect(isFinite(acc)).toBe(true);
  });
});

// ─── calculateAcceleration – modifiers ────────────────────────────────────────

describe('calculateAcceleration – modifiers', () => {
  const config = { ...DEFAULT_PHYSICS, grade: 0 };

  it('powerMult > 1 gives higher acceleration than no modifier', () => {
    const noMod: PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0 };
    const boost: PhysicsModifiers = { powerMult: 2.0, dragReduction: 0.0, weightMult: 1.0 };
    expect(calculateAcceleration(200, 5, config, boost))
      .toBeGreaterThan(calculateAcceleration(200, 5, config, noMod));
  });

  it('dragReduction > 0 reduces aero losses and increases acceleration at speed', () => {
    const noMod:    PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0 };
    const slippery: PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.5, weightMult: 1.0 };
    expect(calculateAcceleration(0, 10, config, slippery))
      .toBeGreaterThan(calculateAcceleration(0, 10, config, noMod));
  });

  it('weightMult < 1 reduces effective mass and improves acceleration', () => {
    const noMod:   PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0 };
    const lighter: PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 0.5 };
    expect(calculateAcceleration(200, 5, config, lighter))
      .toBeGreaterThan(calculateAcceleration(200, 5, config, noMod));
  });

  it('powerMult of 0 is equivalent to zero power input', () => {
    const zeroMod: PhysicsModifiers = { powerMult: 0.0, dragReduction: 0.0, weightMult: 1.0 };
    expect(calculateAcceleration(300, 5, config, zeroMod))
      .toBeCloseTo(calculateAcceleration(0, 5, config), 5);
  });

  it('neutral modifiers produce the same result as no modifiers', () => {
    const neutral: PhysicsModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0 };
    expect(calculateAcceleration(200, 8, config, neutral))
      .toBeCloseTo(calculateAcceleration(200, 8, config), 10);
  });
});

// ─── msToKmh ─────────────────────────────────────────────────────────────────

describe('msToKmh', () => {
  it('converts 0 m/s to 0 km/h', () => {
    expect(msToKmh(0)).toBe(0);
  });

  it('converts 10 m/s to 36 km/h', () => {
    expect(msToKmh(10)).toBeCloseTo(36, 5);
  });

  it('converts 1 m/s to 3.6 km/h', () => {
    expect(msToKmh(1)).toBeCloseTo(3.6, 5);
  });

  it('converts 100 km/h back to 100 km/h (round-trip)', () => {
    expect(msToKmh(100 / 3.6)).toBeCloseTo(100, 3);
  });

  it('handles negative velocity', () => {
    expect(msToKmh(-5)).toBeCloseTo(-18, 5);
  });
});

// ─── msToMph ──────────────────────────────────────────────────────────────────

describe('msToMph', () => {
  it('converts 0 m/s to 0 mph', () => {
    expect(msToMph(0)).toBe(0);
  });

  it('converts 1 m/s to ~2.23694 mph', () => {
    expect(msToMph(1)).toBeCloseTo(2.23694, 4);
  });

  it('converts 44.704 m/s to approximately 100 mph', () => {
    expect(msToMph(44.704)).toBeCloseTo(100, 1);
  });

  it('converts ~8.94 m/s to approximately 20 mph', () => {
    expect(msToMph(8.9408)).toBeCloseTo(20.0, 1);
  });

  it('handles negative velocity', () => {
    expect(msToMph(-10)).toBeCloseTo(-22.3694, 3);
  });

  it('km/h reading is always greater than mph reading for the same positive m/s input', () => {
    // 1 m/s = 3.6 km/h = 2.237 mph; km/h > mph for identical m/s
    for (const speed of [1, 5, 10, 20]) {
      expect(msToKmh(speed)).toBeGreaterThan(msToMph(speed));
    }
  });
});
