/**
 * FitWriter.ts
 *
 * Minimal binary FIT file encoder for cycling activities.
 * No external dependencies – writes the protocol by hand.
 *
 * Produces a valid .fit file containing:
 *   - File ID message (mesg 0)
 *   - Record messages (mesg 20) – one per data point
 *   - Lap message (mesg 19)
 *   - Session message (mesg 18)
 *   - Activity message (mesg 34)
 *
 * FIT protocol references:
 *   FIT epoch = 1989-12-31 00:00:00 UTC (offset 631065600 s from Unix epoch)
 *   All multi-byte fields are little-endian.
 *   File CRC-16 covers header + data bytes.
 */

// ─── FIT epoch ────────────────────────────────────────────────────────────────

const FIT_EPOCH_OFFSET_S = 631065600;

function toFitTs(unixMs: number): number {
  return Math.floor(unixMs / 1000) - FIT_EPOCH_OFFSET_S;
}

// ─── Base type codes (bit 7 = endian-capable for multi-byte types) ────────────

const T_ENUM   = 0x00; // 1 byte  – used for sport, event, etc.
const T_UINT8  = 0x02; // 1 byte
const T_UINT16 = 0x84; // 2 bytes, little-endian
const T_UINT32 = 0x86; // 4 bytes, little-endian

const TYPE_SIZE: Record<number, number> = {
  [T_ENUM]: 1, [T_UINT8]: 1, [T_UINT16]: 2, [T_UINT32]: 4,
};

// "Invalid" sentinel values (signals missing data to FIT decoders)
const INVALID: Record<number, number> = {
  [T_ENUM]: 0xFF, [T_UINT8]: 0xFF, [T_UINT16]: 0xFFFF, [T_UINT32]: 0xFFFFFFFF,
};

// ─── CRC-16 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function fitCrc(data: number[]): number {
  let crc = 0;
  for (const byte of data) {
    let tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];
    tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
  }
  return crc;
}

// ─── Public data type ─────────────────────────────────────────────────────────

export interface RideRecord {
  timestampMs:  number;
  powerW:       number;
  cadenceRpm:   number;
  speedMs:      number;
  distanceM:    number;
  /** 0 = no heart-rate data available */
  heartRateBpm: number;
  /** metres above sea-level; 0 = no altitude data */
  altitudeM:    number;
}

// ─── FitWriter ────────────────────────────────────────────────────────────────

export class FitWriter {
  private readonly records: RideRecord[] = [];

  constructor(private readonly startTimeMs: number) {}

  addRecord(rec: RideRecord): void {
    this.records.push(rec);
  }

  get recordCount(): number {
    return this.records.length;
  }

  /** Encode the full ride as a binary FIT file and return the bytes. */
  export(): Uint8Array {
    const buf: number[] = [];

    // ── Low-level write helpers ─────────────────────────────────────────────
    const w8  = (v: number) => buf.push(v & 0xFF);
    const w16 = (v: number) => buf.push(v & 0xFF, (v >> 8) & 0xFF);
    const w32 = (v: number) => buf.push(
      v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF,
    );

    /** Write a definition message (sets up the schema for a local message type). */
    type FDef = [fieldNum: number, baseType: number];
    const writeDef = (localType: number, globalMesgNum: number, fields: FDef[]) => {
      w8(0x40 | localType); // header: definition record
      w8(0x00);             // reserved
      w8(0x00);             // architecture: little-endian
      w16(globalMesgNum);
      w8(fields.length);
      for (const [fn, bt] of fields) { w8(fn); w8(TYPE_SIZE[bt]); w8(bt); }
    };

    /** Write a single field value, using the type's invalid sentinel if null. */
    const writeVal = (bt: number, v: number | null) => {
      const raw = v === null ? INVALID[bt] : Math.round(v);
      switch (TYPE_SIZE[bt]) {
        case 1: w8(raw);  break;
        case 2: w16(raw); break;
        case 4: w32(raw); break;
      }
    };

    // ── Computed statistics ─────────────────────────────────────────────────
    const n       = this.records.length;
    const last    = n > 0 ? this.records[n - 1] : null;
    const startTs = toFitTs(this.startTimeMs);
    const endTs   = last ? toFitTs(last.timestampMs) : startTs;
    const elapsedS = Math.max(0, endTs - startTs);
    const totalDistM = last?.distanceM ?? 0;

    let sumPow = 0, maxPow = 0, sumCad = 0, sumSpd = 0, maxSpd = 0;
    let sumHR = 0, hrN = 0;
    for (const r of this.records) {
      sumPow += r.powerW;   maxPow = Math.max(maxPow, r.powerW);
      sumCad += r.cadenceRpm;
      sumSpd += r.speedMs;  maxSpd = Math.max(maxSpd, r.speedMs);
      if (r.heartRateBpm > 0) { sumHR += r.heartRateBpm; hrN++; }
    }
    const avgPow = n > 0 ? Math.round(sumPow / n) : 0;
    const avgCad = n > 0 ? Math.round(sumCad / n) : 0;
    const avgSpd = n > 0 ? sumSpd / n : 0;
    const avgHR  = hrN > 0 ? Math.round(sumHR / hrN) : 0;
    const hasHR  = hrN > 0;
    const hasAlt = this.records.some(r => r.altitudeM !== 0);

    // ── Message 0 – File ID (local 0) ───────────────────────────────────────
    writeDef(0, 0, [
      [0, T_ENUM],    // type
      [1, T_UINT16],  // manufacturer
      [2, T_UINT16],  // product
      [4, T_UINT32],  // time_created
    ]);
    w8(0);
    writeVal(T_ENUM,   4);         // type = activity
    writeVal(T_UINT16, 255);       // manufacturer = development
    writeVal(T_UINT16, 1);         // product = 1
    writeVal(T_UINT32, startTs);

    // ── Message 20 – Record (local 1) ───────────────────────────────────────
    const recFields: FDef[] = [
      [253, T_UINT32],  // timestamp
      [6,   T_UINT16],  // speed         (m/s × 1000)
      [7,   T_UINT16],  // power         (W)
      [4,   T_UINT8],   // cadence       (rpm)
      [5,   T_UINT32],  // distance      (m × 100)
    ];
    if (hasHR)  recFields.push([3, T_UINT8]);   // heart_rate (bpm)
    if (hasAlt) recFields.push([2, T_UINT16]);  // altitude   ((m+500)×5)

    writeDef(1, 20, recFields);
    for (const r of this.records) {
      w8(1);
      writeVal(T_UINT32, toFitTs(r.timestampMs));
      writeVal(T_UINT16, r.speedMs * 1000);
      writeVal(T_UINT16, r.powerW);
      writeVal(T_UINT8,  r.cadenceRpm);
      writeVal(T_UINT32, r.distanceM * 100);
      if (hasHR)  writeVal(T_UINT8,  r.heartRateBpm > 0 ? r.heartRateBpm : null);
      if (hasAlt) writeVal(T_UINT16, r.altitudeM !== 0  ? (r.altitudeM + 500) * 5 : null);
    }

    // ── Message 19 – Lap (local 2) ──────────────────────────────────────────
    writeDef(2, 19, [
      [253, T_UINT32],  // timestamp
      [2,   T_UINT32],  // start_time
      [7,   T_UINT32],  // total_elapsed_time (s × 1000)
      [8,   T_UINT32],  // total_timer_time   (s × 1000)
      [9,   T_UINT32],  // total_distance     (m × 100)
    ]);
    w8(2);
    writeVal(T_UINT32, endTs);
    writeVal(T_UINT32, startTs);
    writeVal(T_UINT32, elapsedS * 1000);
    writeVal(T_UINT32, elapsedS * 1000);
    writeVal(T_UINT32, totalDistM * 100);

    // ── Message 18 – Session (local 3) ──────────────────────────────────────
    const sesFields: FDef[] = [
      [253, T_UINT32],  // timestamp
      [2,   T_UINT32],  // start_time
      [5,   T_ENUM],    // sport        (2 = cycling)
      [6,   T_ENUM],    // sub_sport    (0 = generic)
      [7,   T_UINT32],  // total_elapsed_time (s × 1000)
      [8,   T_UINT32],  // total_timer_time   (s × 1000)
      [9,   T_UINT32],  // total_distance     (m × 100)
      [14,  T_UINT16],  // avg_speed    (m/s × 1000)
      [15,  T_UINT16],  // max_speed    (m/s × 1000)
      [20,  T_UINT16],  // avg_power    (W)
      [21,  T_UINT16],  // max_power    (W)
      [19,  T_UINT8],   // avg_cadence  (rpm)
    ];
    if (hasHR) sesFields.push([16, T_UINT8]); // avg_heart_rate (bpm)

    writeDef(3, 18, sesFields);
    w8(3);
    writeVal(T_UINT32, endTs);
    writeVal(T_UINT32, startTs);
    writeVal(T_ENUM,   2);               // cycling
    writeVal(T_ENUM,   0);               // generic
    writeVal(T_UINT32, elapsedS * 1000);
    writeVal(T_UINT32, elapsedS * 1000);
    writeVal(T_UINT32, totalDistM * 100);
    writeVal(T_UINT16, avgSpd * 1000);
    writeVal(T_UINT16, maxSpd * 1000);
    writeVal(T_UINT16, avgPow);
    writeVal(T_UINT16, maxPow);
    writeVal(T_UINT8,  avgCad);
    if (hasHR) writeVal(T_UINT8, avgHR);

    // ── Message 34 – Activity (local 4) ─────────────────────────────────────
    writeDef(4, 34, [
      [253, T_UINT32],  // timestamp
      [0,   T_UINT32],  // total_timer_time (s × 1000)
      [1,   T_UINT16],  // num_sessions
      [2,   T_ENUM],    // type        (0 = manual)
      [3,   T_ENUM],    // event       (26 = activity)
      [4,   T_ENUM],    // event_type  (1 = stop)
    ]);
    w8(4);
    writeVal(T_UINT32, endTs);
    writeVal(T_UINT32, elapsedS * 1000);
    writeVal(T_UINT16, 1);   // 1 session
    writeVal(T_ENUM,   0);   // manual
    writeVal(T_ENUM,   26);  // activity
    writeVal(T_ENUM,   1);   // stop

    // ── Assemble: [14-byte header] [data] [2-byte file CRC] ─────────────────
    const dataSize = buf.length;
    const header: number[] = [
      0x0E,                                       // header size = 14
      0x10,                                       // protocol version = 1.0
      0x54, 0x08,                                 // profile version 2132 LE
      dataSize & 0xFF,                            // data size (LE)
      (dataSize >> 8)   & 0xFF,
      (dataSize >> 16)  & 0xFF,
      (dataSize >>> 24) & 0xFF,
      0x2E, 0x46, 0x49, 0x54,                    // ".FIT"
    ];
    const headerCrc = fitCrc(header);
    header.push(headerCrc & 0xFF, (headerCrc >> 8) & 0xFF);

    const fileCrc = fitCrc([...header, ...buf]);
    return new Uint8Array([
      ...header,
      ...buf,
      fileCrc & 0xFF,
      (fileCrc >> 8) & 0xFF,
    ]);
  }
}
