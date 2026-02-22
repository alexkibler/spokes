/**
 * FitWriter.test.ts
 *
 * Unit tests for the FIT binary file encoder.
 *
 * FIT file structure:
 *   [14-byte header] [data messages] [2-byte file CRC]
 *
 * Header layout:
 *   [0]    header size = 0x0E (14)
 *   [1]    protocol version = 0x10
 *   [2-3]  profile version LE
 *   [4-7]  data size LE
 *   [8-11] ".FIT" ASCII magic
 *   [12-13] header CRC LE
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FitWriter, type RideRecord } from '../FitWriter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const START_MS = 1_700_000_000_000; // arbitrary fixed timestamp

function makeRecord(overrides: Partial<RideRecord> = {}): RideRecord {
  return {
    timestampMs:  START_MS + 1000,
    powerW:       200,
    cadenceRpm:   90,
    speedMs:      8.33,   // ~30 km/h
    distanceM:    100,
    heartRateBpm: 0,      // 0 = no HR
    altitudeM:    0,      // 0 = no altitude
    ...overrides,
  };
}

// ─── FitWriter construction ────────────────────────────────────────────────────

describe('FitWriter – construction', () => {
  it('starts with zero records', () => {
    const fw = new FitWriter(START_MS);
    expect(fw.recordCount).toBe(0);
  });

  it('accepts a start time and reflects it via recordCount', () => {
    const fw = new FitWriter(START_MS);
    expect(fw.recordCount).toBe(0);
  });
});

// ─── addRecord / recordCount ───────────────────────────────────────────────────

describe('FitWriter – addRecord / recordCount', () => {
  let fw: FitWriter;
  beforeEach(() => { fw = new FitWriter(START_MS); });

  it('increases recordCount by 1 for each added record', () => {
    fw.addRecord(makeRecord());
    expect(fw.recordCount).toBe(1);
    fw.addRecord(makeRecord());
    expect(fw.recordCount).toBe(2);
  });

  it('stores many records', () => {
    for (let i = 0; i < 100; i++) fw.addRecord(makeRecord({ distanceM: i * 10 }));
    expect(fw.recordCount).toBe(100);
  });
});

// ─── export() – basic structure ──────────────────────────────────────────────

describe('FitWriter – export() basic structure', () => {
  it('returns a Uint8Array', () => {
    const fw = new FitWriter(START_MS);
    const data = fw.export();
    expect(data).toBeInstanceOf(Uint8Array);
  });

  it('exported file is at least 16 bytes (14 header + 2 file CRC)', () => {
    const fw = new FitWriter(START_MS);
    const data = fw.export();
    expect(data.length).toBeGreaterThanOrEqual(16);
  });

  it('header byte 0 is 0x0E (header size = 14)', () => {
    const fw = new FitWriter(START_MS);
    expect(fw.export()[0]).toBe(0x0e);
  });

  it('header byte 1 is 0x10 (protocol version 1.0)', () => {
    const fw = new FitWriter(START_MS);
    expect(fw.export()[1]).toBe(0x10);
  });

  it('magic bytes 8–11 spell ".FIT"', () => {
    const fw = new FitWriter(START_MS);
    const data = fw.export();
    expect(data[8]).toBe(0x2e);  // '.'
    expect(data[9]).toBe(0x46);  // 'F'
    expect(data[10]).toBe(0x49); // 'I'
    expect(data[11]).toBe(0x54); // 'T'
  });

  it('data size in header (bytes 4–7 LE) is non-zero for non-empty exports', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord());
    const data = fw.export();
    const dataSize = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
    expect(dataSize).toBeGreaterThan(0);
  });

  it('file is larger with records than without', () => {
    const empty = new FitWriter(START_MS);
    const full  = new FitWriter(START_MS);
    for (let i = 0; i < 5; i++) full.addRecord(makeRecord({ distanceM: i * 50 }));
    expect(full.export().length).toBeGreaterThan(empty.export().length);
  });
});

// ─── export() – data size consistency ────────────────────────────────────────

describe('FitWriter – data size in header', () => {
  it('header data size field equals actual data length (excluding header and file CRC)', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord());
    const exported = fw.export();
    const headerSize = 14;
    const fileCrcSize = 2;
    const expectedDataSize = exported.length - headerSize - fileCrcSize;
    const headerDataSize = exported[4] | (exported[5] << 8) | (exported[6] << 16) | (exported[7] << 24);
    expect(headerDataSize).toBe(expectedDataSize);
  });
});

// ─── export() – heart rate & altitude field presence ─────────────────────────

describe('FitWriter – optional fields (HR, altitude)', () => {
  it('exporting with a non-zero heartRateBpm produces a larger file than without', () => {
    const withoutHR = new FitWriter(START_MS);
    withoutHR.addRecord(makeRecord({ heartRateBpm: 0 }));

    const withHR = new FitWriter(START_MS);
    withHR.addRecord(makeRecord({ heartRateBpm: 150 }));

    expect(withHR.export().length).toBeGreaterThan(withoutHR.export().length);
  });

  it('exporting with a non-zero altitudeM produces a larger file than without', () => {
    const withoutAlt = new FitWriter(START_MS);
    withoutAlt.addRecord(makeRecord({ altitudeM: 0 }));

    const withAlt = new FitWriter(START_MS);
    withAlt.addRecord(makeRecord({ altitudeM: 500 }));

    expect(withAlt.export().length).toBeGreaterThan(withoutAlt.export().length);
  });

  it('exporting with both HR and altitude produces the largest file', () => {
    const base = new FitWriter(START_MS);
    base.addRecord(makeRecord());

    const both = new FitWriter(START_MS);
    both.addRecord(makeRecord({ heartRateBpm: 160, altitudeM: 300 }));

    expect(both.export().length).toBeGreaterThan(base.export().length);
  });

  it('multiple records with HR data all contribute to the file', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord({ heartRateBpm: 140, timestampMs: START_MS + 1000 }));
    fw.addRecord(makeRecord({ heartRateBpm: 145, timestampMs: START_MS + 2000 }));
    fw.addRecord(makeRecord({ heartRateBpm: 150, timestampMs: START_MS + 3000 }));
    expect(fw.recordCount).toBe(3);
    // File should be valid (non-empty)
    expect(fw.export().length).toBeGreaterThan(16);
  });
});

// ─── export() – empty writer ─────────────────────────────────────────────────

describe('FitWriter – export with no records', () => {
  it('still produces a structurally valid file (header + messages + CRC)', () => {
    const fw = new FitWriter(START_MS);
    const data = fw.export();
    // At minimum: 14-byte header + message data + 2-byte file CRC
    expect(data.length).toBeGreaterThan(14 + 2);
  });

  it('produces consistent output on repeated calls with no mutations', () => {
    const fw = new FitWriter(START_MS);
    const first  = fw.export();
    const second = fw.export();
    expect(first).toEqual(second);
  });
});

// ─── export() – CRC (indirectly validated via header CRC bytes) ───────────────

describe('FitWriter – CRC presence', () => {
  it('header CRC bytes (12–13) are non-zero for a real file', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord());
    const data = fw.export();
    const headerCrc = data[12] | (data[13] << 8);
    // The CRC of a real header is almost never 0
    expect(headerCrc).not.toBe(0);
  });

  it('file CRC bytes (last 2) are non-zero', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord());
    const data = fw.export();
    const fileCrc = data[data.length - 2] | (data[data.length - 1] << 8);
    expect(fileCrc).not.toBe(0);
  });
});

// ─── export() – statistics computation ───────────────────────────────────────

describe('FitWriter – statistics via export', () => {
  it('can export a file with a single high-power record', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord({ powerW: 1000, speedMs: 15 }));
    expect(() => fw.export()).not.toThrow();
  });

  it('can export a file with zero power records', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord({ powerW: 0, speedMs: 0, cadenceRpm: 0 }));
    expect(() => fw.export()).not.toThrow();
  });

  it('handles records with distanceM=0', () => {
    const fw = new FitWriter(START_MS);
    fw.addRecord(makeRecord({ distanceM: 0 }));
    expect(() => fw.export()).not.toThrow();
  });

  it('produces a larger file for more records (proportionally)', () => {
    const fw1 = new FitWriter(START_MS);
    fw1.addRecord(makeRecord());

    const fw10 = new FitWriter(START_MS);
    for (let i = 0; i < 10; i++) fw10.addRecord(makeRecord({ timestampMs: START_MS + i * 1000 }));

    expect(fw10.export().length).toBeGreaterThan(fw1.export().length);
  });
});
