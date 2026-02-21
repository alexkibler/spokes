/**
 * CourseProfile.ts
 *
 * Defines a cycling course as an ordered list of grade segments.
 * Pure functions — no Phaser or Bluetooth dependency.
 *
 * Grade convention: decimal fraction (0.05 = 5% climb, -0.03 = 3% descent).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Road surface type for a segment.
 * Each surface increases rolling resistance (Crr) relative to asphalt baseline.
 */
export type SurfaceType = 'asphalt' | 'gravel' | 'dirt' | 'mud';

/**
 * Rolling resistance coefficient (Crr) per surface type.
 * Asphalt is the physics baseline (0.005); other surfaces multiply resistance.
 */
export const CRR_BY_SURFACE: Record<SurfaceType, number> = {
  asphalt: 0.005, // smooth tarmac — baseline
  gravel:  0.012, // packed gravel  — ~2.4× baseline
  dirt:    0.020, // dirt track     — ~4×   baseline
  mud:     0.040, // soft mud       — ~8×   baseline
};

export interface CourseSegment {
  /** Length of this segment in metres */
  distanceM: number;
  /** Road grade as a decimal fraction (0.05 = 5% climb, -0.03 = 3% descent) */
  grade: number;
  /** Road surface — defaults to 'asphalt' when absent */
  surface?: SurfaceType;
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
 * Return the road surface at the given distance along the course.
 * Wraps around when distanceM exceeds the total course length.
 * Segments without an explicit surface default to 'asphalt'.
 */
export function getSurfaceAtDistance(
  profile: CourseProfile,
  distanceM: number,
): SurfaceType {
  const wrapped = distanceM % profile.totalDistanceM;
  let remaining = wrapped;
  for (const segment of profile.segments) {
    if (remaining < segment.distanceM) return segment.surface ?? 'asphalt';
    remaining -= segment.distanceM;
  }
  return 'asphalt';
}

/** Return the rolling resistance coefficient for the given surface type. */
export function getCrrForSurface(surface: SurfaceType = 'asphalt'): number {
  return CRR_BY_SURFACE[surface];
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

// ─── Procedural generator ─────────────────────────────────────────────────────

/**
 * Procedurally generates a rolling course profile for the given distance and
 * maximum road grade.
 *
 * The algorithm creates alternating climb / descent segments whose cumulative
 * elevation is balanced back to ~zero at the end.
 *
 * @param distanceKm  Total course length in kilometres (5–200)
 * @param maxGrade    Maximum road grade as a decimal fraction (0.05 = 5 %)
 * @param surface     Surface type for the entire course (defaults to 'asphalt')
 */
export function generateCourseProfile(
  distanceKm: number,
  maxGrade: number,
  surface: SurfaceType = 'asphalt',
): CourseProfile {
  const totalM = distanceKm * 1000;

  // Flat bookends: 5 % of total length, clamped 50–1 500 m
  const flatEndM = Math.max(50, Math.min(1500, totalM * 0.05));

  const segments: CourseSegment[] = [{ distanceM: flatEndM, grade: 0, surface }];
  let budgetM  = totalM - 2 * flatEndM;
  let netElevM = 0; // running Σ(grade × length) to track elevation balance

  // Segment length: clamped 200–2 500 m
  const segMax = Math.min(2500, Math.max(200, totalM * 0.04));
  const segMin = Math.max(100, segMax * 0.35);

  // Grade magnitudes available (25 / 50 / 75 / 100 % of maxGrade)
  const mags = [
    maxGrade * 0.25,
    maxGrade * 0.50,
    maxGrade * 0.75,
    maxGrade,
  ];

  while (budgetM >= segMin) {
    // Pick a random segment length within budget
    const hi  = Math.min(segMax, budgetM - segMin);
    if (hi <= 0) break; // remaining budget too small for another segment
    const lo  = Math.min(segMin, hi);
    const len = lo + Math.random() * Math.max(0, hi - lo);

    // Mild elevation pressure to prevent extreme monotony (e.g. climbing forever).
    // The divisor uses 1.0 instead of 0.25 so pressure only kicks in strongly
    // when net elevation reaches a full maxGrade×totalM — allowing edges to be
    // substantially net-climbing or net-descending (as real routes are).
    const pressure = Math.max(-1, Math.min(1,
      netElevM / (totalM * maxGrade * 1.0)));

    const r = Math.random();
    let sign: number;
    if      (pressure >  0.7)                sign = -1; // prevent runaway ascent
    else if (pressure < -0.7)                sign =  1; // prevent runaway descent
    else if (r < 0.08)                       sign =  0; // flat recovery
    else sign = (r < 0.52 - pressure * 0.2) ? 1 : -1;

    const grade = sign === 0
      ? 0
      : sign * mags[Math.floor(Math.random() * mags.length)];

    segments.push({ distanceM: len, grade, surface });
    netElevM += len * grade;
    budgetM  -= len;
  }

  // If the loop didn't run or left a gap, and we have no terrain segments yet,
  // we must create at least one segment to bridge the gap.
  if (budgetM > 0 && segments.length === 1) {
     // Create a single bridge segment. 
     // Since we can't balance it, just pick a random grade so it's not flat.
     // 50/50 chance of climb or descent.
     const sign = Math.random() < 0.5 ? 1 : -1;
     const grade = sign * mags[Math.floor(Math.random() * mags.length)];
     
     segments.push({ distanceM: budgetM, grade, surface });
     budgetM = 0;
  }

  // Absorb any leftover budget into the last terrain segment
  if (budgetM > 0 && segments.length > 1) {
    segments[segments.length - 1].distanceM += budgetM;
  }
  segments.push({ distanceM: flatEndM, grade: 0, surface });

  return {
    segments,
    totalDistanceM: segments.reduce((s, seg) => s + seg.distanceM, 0),
  };
}

/**
 * Creates a new course profile that is the reverse of the given profile.
 * - Reverses the order of segments.
 * - Inverts the grade of each segment (positive becomes negative).
 * - Preserves distance and surface type.
 */
export function invertCourseProfile(profile: CourseProfile): CourseProfile {
  const reversedSegments = [...profile.segments].reverse().map(seg => ({
    ...seg,
    grade: -seg.grade
  }));

  return {
    segments: reversedSegments,
    totalDistanceM: profile.totalDistanceM
  };
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
  { distanceM: 1000, grade:  0.23 },                             // asphalt flat start
  { distanceM:  800, grade:  0.03, surface: 'gravel' },          // gravel gentle rise
  { distanceM:  200, grade:  0.00 },                             // asphalt brief flat
  { distanceM: 1200, grade:  0.06 },                             // asphalt moderate climb
  { distanceM:  600, grade:  0.09, surface: 'gravel' },          // gravel steep kick
  { distanceM:  400, grade:  0.12, surface: 'dirt'   },          // dirt 12% summit ramp
  { distanceM: 1500, grade: -0.04 },                             // asphalt long descent
  { distanceM:  500, grade:  0.01, surface: 'mud'    },          // mud valley floor
  { distanceM: 1000, grade:  0.05 },                             // asphalt second climb
  { distanceM:  800, grade:  0.08, surface: 'gravel' },          // gravel second summit
  { distanceM: 1000, grade: -0.06 },                             // asphalt fast descent
  { distanceM:  500, grade:  0.00 },                             // asphalt flat finish
]);
