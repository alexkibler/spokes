/**
 * CourseProfile.ts
 *
 * Defines a cycling course as an ordered list of grade segments.
 * Pure functions — no Phaser or Bluetooth dependency.
 *
 * Grade convention: decimal fraction (0.05 = 5% climb, -0.03 = 3% descent).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CourseSegment {
  /** Length of this segment in metres */
  distanceM: number;
  /** Road grade as a decimal fraction (0.05 = 5% climb, -0.03 = 3% descent) */
  grade: number;
}

export interface CourseProfile {
  segments: CourseSegment[];
  /** Sum of all segment distances in metres */
  totalDistanceM: number;
}

/** A pre-sampled (distance, elevation) pair used for graph rendering */
export interface ElevationSample {
  distanceM: number;
  /** Cumulative elevation gain/loss from course start, in metres */
  elevationM: number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildCourseProfile(segments: CourseSegment[]): CourseProfile {
  const totalDistanceM = segments.reduce((sum, s) => sum + s.distanceM, 0);
  return { segments, totalDistanceM };
}

// ─── Pure query functions ─────────────────────────────────────────────────────

/**
 * Return the road grade at the given distance along the course.
 * Wraps around when distanceM exceeds the total course length.
 */
export function getGradeAtDistance(
  profile: CourseProfile,
  distanceM: number,
): number {
  const wrapped = distanceM % profile.totalDistanceM;
  let remaining = wrapped;
  for (const segment of profile.segments) {
    // Use strict < so the boundary point belongs to the next segment
    if (remaining < segment.distanceM) return segment.grade;
    remaining -= segment.distanceM;
  }
  return 0;
}

/**
 * Return the cumulative elevation (metres) from the course start to
 * the given distance.  Wraps around when distanceM exceeds total length.
 */
export function getElevationAtDistance(
  profile: CourseProfile,
  distanceM: number,
): number {
  const wrapped = distanceM % profile.totalDistanceM;
  let remaining = wrapped;
  let elevation = 0;
  for (const segment of profile.segments) {
    const dist = Math.min(remaining, segment.distanceM);
    elevation += dist * segment.grade;
    if (remaining <= segment.distanceM) break;
    remaining -= segment.distanceM;
  }
  return elevation;
}

/**
 * Pre-sample the full elevation profile at a fixed distance step.
 * The returned array always starts at distance 0 and ends at totalDistanceM.
 */
export function buildElevationSamples(
  profile: CourseProfile,
  stepM = 100,
): ElevationSample[] {
  const samples: ElevationSample[] = [];
  for (let d = 0; d <= profile.totalDistanceM; d += stepM) {
    samples.push({ distanceM: d, elevationM: getElevationAtDistance(profile, d) });
  }
  // Always include the final point
  if (samples[samples.length - 1].distanceM < profile.totalDistanceM) {
    samples.push({
      distanceM: profile.totalDistanceM,
      elevationM: getElevationAtDistance(profile, profile.totalDistanceM),
    });
  }
  return samples;
}

// ─── Default course ───────────────────────────────────────────────────────────

/**
 * A 9.5 km course with two major climbs, a long descent, and rolling terrain.
 *
 * Grade summary:
 *   0–1 000 m  Flat start
 *   1–1 800 m  Gentle 3% rise
 *   1.8–2 km   Brief flat
 *   2–3.2 km   Moderate 6% climb
 *   3.2–3.8 km Steep 9% kick
 *   3.8–4.2 km 12% summit ramp
 *   4.2–5.7 km Long −4% descent
 *   5.7–6.2 km Valley floor (1%)
 *   6.2–7.2 km Second climb (5%)
 *   7.2–8 km   Second summit (8%)
 *   8–9 km     Fast −6% descent
 *   9–9.5 km   Flat finish
 */
export const DEFAULT_COURSE: CourseProfile = buildCourseProfile([
  { distanceM: 1000, grade:  0.03 },
  { distanceM:  800, grade:  0.03 },
  { distanceM:  200, grade:  0.00 },
  { distanceM: 1200, grade:  0.06 },
  { distanceM:  600, grade:  0.09 },
  { distanceM:  400, grade:  0.12 },
  { distanceM: 1500, grade: -0.04 },
  { distanceM:  500, grade:  0.01 },
  { distanceM: 1000, grade:  0.05 },
  { distanceM:  800, grade:  0.08 },
  { distanceM: 1000, grade: -0.06 },
  { distanceM:  500, grade:  0.00 },
]);
