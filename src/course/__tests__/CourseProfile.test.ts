import { describe, it, expect } from 'vitest';
import {
  buildCourseProfile,
  getGradeAtDistance,
  getElevationAtDistance,
  buildElevationSamples,
  DEFAULT_COURSE,
} from '../CourseProfile';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Simple 3-segment course: flat → climb → descent */
const SIMPLE_COURSE = buildCourseProfile([
  { distanceM: 1000, grade: 0.00 },
  { distanceM: 1000, grade: 0.05 },
  { distanceM: 1000, grade: -0.03 },
]);

// ─── buildCourseProfile ───────────────────────────────────────────────────────

describe('buildCourseProfile', () => {
  it('calculates totalDistanceM as sum of segment distances', () => {
    expect(SIMPLE_COURSE.totalDistanceM).toBe(3000);
  });

  it('preserves segment order', () => {
    expect(SIMPLE_COURSE.segments[0].grade).toBe(0.00);
    expect(SIMPLE_COURSE.segments[1].grade).toBe(0.05);
    expect(SIMPLE_COURSE.segments[2].grade).toBe(-0.03);
  });
});

// ─── getGradeAtDistance ───────────────────────────────────────────────────────

describe('getGradeAtDistance', () => {
  it('returns 0 at the start of the course', () => {
    expect(getGradeAtDistance(SIMPLE_COURSE, 0)).toBe(0.00);
  });

  it('returns correct grade mid-segment', () => {
    expect(getGradeAtDistance(SIMPLE_COURSE, 500)).toBe(0.00);
    expect(getGradeAtDistance(SIMPLE_COURSE, 1500)).toBe(0.05);
    expect(getGradeAtDistance(SIMPLE_COURSE, 2500)).toBe(-0.03);
  });

  it('returns the grade of a segment at its exact start boundary', () => {
    // At exactly 1000 m the second segment begins
    expect(getGradeAtDistance(SIMPLE_COURSE, 1000)).toBe(0.05);
  });

  it('wraps around when distance exceeds total course length', () => {
    // 3000 m == 0 m wrapped → flat segment
    expect(getGradeAtDistance(SIMPLE_COURSE, 3000)).toBe(0.00);
    expect(getGradeAtDistance(SIMPLE_COURSE, 3500)).toBe(0.00);
    expect(getGradeAtDistance(SIMPLE_COURSE, 4200)).toBe(0.05);
  });

  it('handles negative grades', () => {
    expect(getGradeAtDistance(SIMPLE_COURSE, 2200)).toBe(-0.03);
  });
});

// ─── getElevationAtDistance ───────────────────────────────────────────────────

describe('getElevationAtDistance', () => {
  it('returns 0 at the course start', () => {
    expect(getElevationAtDistance(SIMPLE_COURSE, 0)).toBe(0);
  });

  it('returns 0 after the flat segment (no elevation change)', () => {
    expect(getElevationAtDistance(SIMPLE_COURSE, 1000)).toBeCloseTo(0, 5);
  });

  it('accumulates elevation during a climb', () => {
    // After 500 m of 5% climbing: 500 * 0.05 = 25 m
    expect(getElevationAtDistance(SIMPLE_COURSE, 1500)).toBeCloseTo(25, 5);
  });

  it('reaches the correct peak elevation', () => {
    // 1000 m of flat + 1000 m * 0.05 = 50 m peak
    expect(getElevationAtDistance(SIMPLE_COURSE, 2000)).toBeCloseTo(50, 5);
  });

  it('decreases on a descent', () => {
    // After 500 m of −3% descent: 50 − 500 * 0.03 = 35 m
    expect(getElevationAtDistance(SIMPLE_COURSE, 2500)).toBeCloseTo(35, 5);
  });

  it('wraps elevation to 0 at the exact course total', () => {
    // Elevation at 3000 m (modulo 3000 = 0) is 0
    expect(getElevationAtDistance(SIMPLE_COURSE, 3000)).toBeCloseTo(0, 5);
  });
});

// ─── buildElevationSamples ────────────────────────────────────────────────────

describe('buildElevationSamples', () => {
  it('starts at distanceM 0 with elevationM 0', () => {
    const samples = buildElevationSamples(SIMPLE_COURSE, 500);
    expect(samples[0].distanceM).toBe(0);
    expect(samples[0].elevationM).toBe(0);
  });

  it('ends at totalDistanceM', () => {
    const samples = buildElevationSamples(SIMPLE_COURSE, 500);
    const last = samples[samples.length - 1];
    expect(last.distanceM).toBe(SIMPLE_COURSE.totalDistanceM);
  });

  it('produces samples at the requested step interval', () => {
    const samples = buildElevationSamples(SIMPLE_COURSE, 1000);
    // Expect samples at 0, 1000, 2000, 3000
    expect(samples.map((s) => s.distanceM)).toEqual([0, 1000, 2000, 3000]);
  });

  it('elevation values match getElevationAtDistance', () => {
    const samples = buildElevationSamples(SIMPLE_COURSE, 500);
    for (const s of samples) {
      expect(s.elevationM).toBeCloseTo(
        getElevationAtDistance(SIMPLE_COURSE, s.distanceM),
        5,
      );
    }
  });
});

// ─── DEFAULT_COURSE sanity checks ─────────────────────────────────────────────

describe('DEFAULT_COURSE', () => {
  it('has a total distance of 9500 m', () => {
    expect(DEFAULT_COURSE.totalDistanceM).toBe(9500);
  });

  it('contains at least one positive-grade segment (climb)', () => {
    expect(DEFAULT_COURSE.segments.some((s) => s.grade > 0)).toBe(true);
  });

  it('contains at least one negative-grade segment (descent)', () => {
    expect(DEFAULT_COURSE.segments.some((s) => s.grade < 0)).toBe(true);
  });

  it('all segment distances are positive', () => {
    expect(DEFAULT_COURSE.segments.every((s) => s.distanceM > 0)).toBe(true);
  });
});
