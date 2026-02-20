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

/**
 * Compute the forces and resulting acceleration (m/s²) for a given power and velocity.
 */
export function calculateAcceleration(
  powerW: number,
  currentVelocityMs: number,
  config: PhysicsConfig = DEFAULT_PHYSICS,
): number {
  const { massKg, cdA, rhoAir, crr, grade } = config;
  const theta = Math.atan(grade);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // F_propulsion = P / v
  // Avoid division by zero at standstill.
  // When starting from 0, we assume some minimal velocity or static torque,
  // but for simplicity, we'll gate v.
  const v = Math.max(currentVelocityMs, 0.1);
  const propulsionForce = powerW / v;

  // Resistance forces:
  // Drag = ½ρCdA·v²
  const aeroForce = 0.5 * rhoAir * cdA * currentVelocityMs * currentVelocityMs;
  // Rolling resistance = Crr·m·g·cosθ
  const rollingForce = crr * massKg * G * cosTheta;
  // Gravity = m·g·sinθ
  const gradeForce = massKg * G * sinTheta;

  // F_net = F_propulsion - (F_aero + F_rolling + F_grade)
  const netForce = propulsionForce - (aeroForce + rollingForce + gradeForce);

  return netForce / massKg;
}

/** Convert m/s to km/h */
export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/** Convert m/s to mph */
export function msToMph(ms: number): number {
  return ms * 2.23694;
}
