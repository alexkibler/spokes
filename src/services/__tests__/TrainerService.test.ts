/**
 * TrainerService.test.ts
 *
 * Unit tests for the FTMS Indoor Bike Data (0x2AD2) parser.
 *
 * The 10-byte buffer used throughout these tests reflects a typical Saris H3
 * frame where flags = 0x0046, meaning three optional fields are present:
 *
 *   Bit 1  → Average Speed   (bytes 4–5)
 *   Bit 2  → Inst. Cadence   (bytes 6–7)
 *   Bit 6  → Inst. Power     (bytes 8–9)   ← 250 W
 *
 * Full byte map:
 *   [0x46, 0x00]  – flags
 *   [0xB8, 0x0B]  – speed   : 0x0BB8 = 3000 × 0.01 km/h = 30.00 km/h
 *   [0x00, 0x00]  – avg speed (skipped)
 *   [0xB4, 0x00]  – cadence : 0x00B4 = 180 × 0.5 rpm = 90 rpm
 *   [0xFA, 0x00]  – power   : 0x00FA = 250 W  ← bytes 8 and 9
 */

import { describe, it, expect } from 'vitest';
import { parseIndoorBikeData } from '../hardware/TrainerService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the standard 10-byte Saris H3-style FTMS frame.
 * Individual bytes can be overridden for targeted tests.
 */
function makeFrame(overrides: Record<number, number> = {}): DataView {
  const bytes = new Uint8Array([
    0x46, 0x00, // [0–1] flags: bits 1, 2, 6 set
    0xb8, 0x0b, // [2–3] instantaneous speed: 3000 = 30.00 km/h
    0x00, 0x00, // [4–5] average speed: 0 (present but ignored)
    0xb4, 0x00, // [6–7] instantaneous cadence: 180 = 90.0 rpm
    0xfa, 0x00, // [8–9] instantaneous power: 250 W  ← primary test target
  ]);

  for (const [index, value] of Object.entries(overrides)) {
    bytes[Number(index)] = value;
  }

  return new DataView(bytes.buffer);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseIndoorBikeData – FTMS 0x2AD2', () => {
  describe('Instantaneous Power (bytes 8–9)', () => {
    it('parses 250 W when bytes 8–9 are [0xFA, 0x00]', () => {
      const result = parseIndoorBikeData(makeFrame());
      expect(result.instantaneousPower).toBe(250);
    });

    it('parses 0 W', () => {
      const frame = makeFrame({ 8: 0x00, 9: 0x00 });
      expect(parseIndoorBikeData(frame).instantaneousPower).toBe(0);
    });

    it('parses maximum realistic power (2000 W)', () => {
      // 2000 = 0x07D0  →  LE bytes [0xD0, 0x07]
      const frame = makeFrame({ 8: 0xd0, 9: 0x07 });
      expect(parseIndoorBikeData(frame).instantaneousPower).toBe(2000);
    });

    it('parses negative power (braking / negative torque) correctly', () => {
      // sint16: -1 = 0xFFFF  →  LE [0xFF, 0xFF]
      const frame = makeFrame({ 8: 0xff, 9: 0xff });
      expect(parseIndoorBikeData(frame).instantaneousPower).toBe(-1);
    });

    it('returns undefined when the INST_POWER flag (bit 6) is not set', () => {
      // flags = 0x0006: bits 1 and 2 set, bit 6 clear
      const frame = makeFrame({ 0: 0x06, 1: 0x00 });
      expect(parseIndoorBikeData(frame).instantaneousPower).toBeUndefined();
    });
  });

  describe('Instantaneous Speed (bytes 2–3)', () => {
    it('parses 30.00 km/h (raw 3000)', () => {
      expect(parseIndoorBikeData(makeFrame()).instantaneousSpeed).toBeCloseTo(
        30.0,
        2,
      );
    });

    it('parses 0.00 km/h', () => {
      const frame = makeFrame({ 2: 0x00, 3: 0x00 });
      expect(parseIndoorBikeData(frame).instantaneousSpeed).toBe(0);
    });

    it('parses 45.00 km/h (raw 4500 = 0x1194)', () => {
      // 0x1194 = 4500  →  LE [0x94, 0x11]
      const frame = makeFrame({ 2: 0x94, 3: 0x11 });
      expect(parseIndoorBikeData(frame).instantaneousSpeed).toBeCloseTo(
        45.0,
        2,
      );
    });

    it('is absent (undefined) when MORE_DATA flag (bit 0) is set', () => {
      // Set bit 0 in flags → speed field omitted
      const frame = makeFrame({ 0: 0x47 }); // 0x46 | 0x01
      // With MORE_DATA set the parser skips speed, cadence shifts to [2–3],
      // power to [6–7]; the frame is now misaligned but the speed field itself
      // must be undefined.
      expect(parseIndoorBikeData(frame).instantaneousSpeed).toBeUndefined();
    });
  });

  describe('Instantaneous Cadence (bytes 6–7)', () => {
    it('parses 90 rpm (raw 180)', () => {
      expect(parseIndoorBikeData(makeFrame()).instantaneousCadence).toBe(90);
    });

    it('parses 0 rpm', () => {
      const frame = makeFrame({ 6: 0x00, 7: 0x00 });
      expect(parseIndoorBikeData(frame).instantaneousCadence).toBe(0);
    });

    it('parses 120 rpm (raw 240 = 0xF0)', () => {
      const frame = makeFrame({ 6: 0xf0, 7: 0x00 });
      expect(parseIndoorBikeData(frame).instantaneousCadence).toBe(120);
    });

    it('is absent (undefined) when INST_CADENCE flag (bit 2) is not set', () => {
      // flags = 0x0042: bits 1 and 6 set, bit 2 clear
      const frame = makeFrame({ 0: 0x42 });
      expect(parseIndoorBikeData(frame).instantaneousCadence).toBeUndefined();
    });
  });

  describe('timestamp', () => {
    it('is set to a recent Unix epoch ms value', () => {
      const before = Date.now();
      const result = parseIndoorBikeData(makeFrame());
      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
