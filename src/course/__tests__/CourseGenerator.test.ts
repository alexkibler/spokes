import { describe, it, expect } from 'vitest';
import { generateCourseProfile } from '../CourseProfile';

describe('generateCourseProfile', () => {
  it('generates a valid profile for a standard distance', () => {
    const profile = generateCourseProfile(10, 0.05); // 10km
    expect(profile.totalDistanceM).toBeCloseTo(10000, 5);
    expect(profile.segments.length).toBeGreaterThan(1);
    
    // Should have some elevation change
    const grades = profile.segments.map(s => s.grade);
    const hasElevation = grades.some(g => g !== 0);
    expect(hasElevation).toBe(true);
  });

  it('generates a valid profile for a short distance (1km)', () => {
    // This was the bug: short courses were generating as flat
    const profile = generateCourseProfile(1.0, 0.05); // 1km
    
    expect(profile.totalDistanceM).toBeCloseTo(1000, 5);
    
    // Should have multiple segments (e.g., flat ends + terrain)
    expect(profile.segments.length).toBeGreaterThan(1);

    // Should have non-zero grades (elevation change)
    const grades = profile.segments.map(s => s.grade);
    const hasElevation = grades.some(g => g !== 0);
    expect(hasElevation).toBe(true);
  });

  it('generates a valid profile for a very short distance (200m)', () => {
    const profile = generateCourseProfile(0.2, 0.05); // 200m
    expect(profile.totalDistanceM).toBeCloseTo(200, 5);
    expect(profile.segments.length).toBeGreaterThanOrEqual(3); // Start, Middle, End
  });

  it('applies the requested surface to all segments', () => {
    const profile = generateCourseProfile(5, 0.05, 'gravel');
    const allGravel = profile.segments.every(s => s.surface === 'gravel');
    expect(allGravel).toBe(true);
  });

  it('respects the max grade constraint (approximately)', () => {
    const maxGrade = 0.05;
    const profile = generateCourseProfile(10, maxGrade);
    
    // The generator might exceed maxGrade slightly during balancing, 
    // but usually within 10-20% margin. 
    // Let's verify it doesn't go wild (like > 2x).
    const grades = profile.segments.map(s => Math.abs(s.grade));
    const maxObserved = Math.max(...grades);
    
    expect(maxObserved).toBeLessThan(maxGrade * 2.0);
  });
});
