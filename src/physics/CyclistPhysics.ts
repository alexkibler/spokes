/**
 * CyclistPhysics.ts
 *
 * Pure physics module — no Phaser dependency.
 *
 * Steady-state power equation:
 *   P = (½ρCdA·v² + Crr·m·g·cos θ + m·g·sin θ) × v
 *
 * Solved via bisection (64 iterations, tolerance 0.001 m/s).
 */

export interface PhysicsConfig {
  /** Total system mass in kg (rider + bike) */
  massKg: number;
  /** Drag area coefficient (m²) */
  cdA: number;
  /** Rolling resistance coefficient */
  crr: number;
  /** Air density (kg/m³) */
  rhoAir: number;
  /** Road grade as decimal fraction (0 = flat, 0.05 = 5% climb) */
  grade: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  massKg: 83,    // 75 kg rider + 8 kg bike
  cdA: 0.325,
  crr: 0.005,
  rhoAir: 1.225, // sea level, 15°C
  grade: 0,
};

const G = 9.80665; // m/s²
const BISECT_ITERATIONS = 64;
const BISECT_TOLERANCE = 0.001; // m/s

/**
 * Compute the steady-state velocity (m/s) for a given power output.
 * Returns 0 for zero or negative power.
 */
export function powerToVelocityMs(
  powerW: number,
  config: PhysicsConfig = DEFAULT_PHYSICS,
): number {
  if (powerW <= 0) return 0;

  const { massKg, cdA, rhoAir, crr, grade } = config;
  const theta = Math.atan(grade);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // Resistance force as a function of velocity:
  //   F(v) = ½ρCdA·v² + Crr·m·g·cosθ + m·g·sinθ
  // Power:   P(v) = F(v) × v
  const powerAtV = (v: number): number => {
    const aeroForce = 0.5 * rhoAir * cdA * v * v;
    const rollingForce = crr * massKg * G * cosTheta;
    const gradeForce = massKg * G * sinTheta;
    return (aeroForce + rollingForce + gradeForce) * v;
  };

  // Bisection: find v in [lo, hi] such that powerAtV(v) ≈ powerW
  let lo = 0;
  let hi = 30; // 30 m/s ≈ 108 km/h — well above any realistic cycling speed

  // Ensure hi is a valid upper bound
  while (powerAtV(hi) < powerW) {
    hi *= 2;
  }

  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < BISECT_TOLERANCE) break;
    if (powerAtV(mid) < powerW) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/** Convert m/s to km/h */
export function msToKmh(ms: number): number {
  return ms * 3.6;
}
