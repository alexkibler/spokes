/**
 * TrainerService.ts
 *
 * Real Web Bluetooth implementation of ITrainerService for FTMS-compliant
 * trainers (tested against Saris H3).
 *
 * FTMS Indoor Bike Data characteristic UUID: 0x2AD2
 *
 * Byte layout decoded here (10-byte typical Saris H3 frame):
 * ┌────────┬──────────────────────────────────────────────────────┐
 * │ Offset │ Field                                                │
 * ├────────┼──────────────────────────────────────────────────────┤
 * │  0–1   │ Flags (uint16 LE) – see FLAGS below                 │
 * │  2–3   │ Instantaneous Speed (uint16 LE, resolution 0.01 km/h)│
 * │  4–5   │ Average Speed (uint16 LE, 0.01 km/h) – if bit 1 set │
 * │  6–7   │ Instantaneous Cadence (uint16 LE, 0.5 rpm) – bit 2  │
 * │  8–9   │ Instantaneous Power (int16 LE, 1 W) – if bit 6 set  │
 * └────────┴──────────────────────────────────────────────────────┘
 *
 * Reference: Bluetooth GATT Specification – Fitness Machine Service 1.0
 * Pattern inspired by dvmarinoff/Auuki (characteristic-based device model).
 */

import { BleClient } from '@capacitor-community/bluetooth-le';
import type { ITrainerService, TrainerData } from './ITrainerService';

// ─── GATT UUIDs ──────────────────────────────────────────────────────────────

export const FTMS_SERVICE_UUID = '00001826-0000-1000-8000-00805f9b34fb';
/** Indoor Bike Data – 0x2AD2 */
export const INDOOR_BIKE_DATA_UUID = '00002ad2-0000-1000-8000-00805f9b34fb';
/** Fitness Machine Control Point – 0x2AD9 (write + indicate) */
export const CONTROL_POINT_UUID = '00002ad9-0000-1000-8000-00805f9b34fb';

// ─── Control Point Op Codes (FTMS spec §4.16.1) ──────────────────────────────

const OP_REQUEST_CONTROL = 0x00;
/** Start or Resume – begins/resumes the workout session on the server */
const OP_START_RESUME = 0x07;
/** Set Indoor Bike Simulation Parameters – sends wind, grade, Crr, CWA */
const OP_SET_INDOOR_BIKE_SIMULATION = 0x11;

// ─── Indoor Bike Data flag bit positions (FTMS spec §4.9.1) ─────────────────

const FLAGS = {
  /** Bit 0 = 0 ⇒ Instantaneous Speed field is present */
  MORE_DATA: 0,
  /** Bit 1 ⇒ Average Speed present */
  AVG_SPEED: 1,
  /** Bit 2 ⇒ Instantaneous Cadence present */
  INST_CADENCE: 2,
  /** Bit 3 ⇒ Average Cadence present */
  AVG_CADENCE: 3,
  /** Bit 4 ⇒ Total Distance present (3 bytes) */
  TOTAL_DISTANCE: 4,
  /** Bit 5 ⇒ Resistance Level present (sint16) */
  RESISTANCE_LEVEL: 5,
  /** Bit 6 ⇒ Instantaneous Power present (sint16) */
  INST_POWER: 6,
  /** Bit 7 ⇒ Average Power present (sint16) */
  AVG_POWER: 7,
  /** Bit 8 ⇒ Expended Energy present (5 bytes) */
  EXPENDED_ENERGY: 8,
  /** Bit 9 ⇒ Heart Rate present (uint8) */
  HEART_RATE: 9,
  /** Bit 10 ⇒ Metabolic Equivalent present (uint8) */
  METABOLIC_EQUIV: 10,
  /** Bit 11 ⇒ Elapsed Time present (uint16) */
  ELAPSED_TIME: 11,
  /** Bit 12 ⇒ Remaining Time present (uint16) */
  REMAINING_TIME: 12,
} as const;

// ─── Pure parsing function (easily unit-tested without Bluetooth) ─────────────

/**
 * Decode a raw FTMS Indoor Bike Data (0x2AD2) DataView into structured data.
 *
 * Only fields that are flagged as present in the header are parsed; all others
 * remain `undefined`.  Byte offsets advance dynamically based on the flags so
 * any valid FTMS frame length is handled.
 *
 * @param data - The raw characteristic value as a DataView
 * @returns Partial<TrainerData> – only the fields present in this frame
 */
export function parseIndoorBikeData(data: DataView): Partial<TrainerData> {
  const flags = data.getUint16(0, /* littleEndian= */ true);
  let offset = 2;

  const result: Partial<TrainerData> = {
    timestamp: Date.now(),
  };

  // Instantaneous Speed – present when MORE_DATA (bit 0) is 0
  if (!(flags & (1 << FLAGS.MORE_DATA))) {
    // Resolution: 1/100 km/h per LSB  →  divide by 100
    result.instantaneousSpeed = data.getUint16(offset, true) / 100;
    offset += 2;
  }

  // Average Speed (skip – not exposed in TrainerData)
  if (flags & (1 << FLAGS.AVG_SPEED)) {
    offset += 2;
  }

  // Instantaneous Cadence – resolution 1/2 rpm per LSB  →  divide by 2
  if (flags & (1 << FLAGS.INST_CADENCE)) {
    result.instantaneousCadence = data.getUint16(offset, true) / 2;
    offset += 2;
  }

  // Average Cadence (skip)
  if (flags & (1 << FLAGS.AVG_CADENCE)) {
    offset += 2;
  }

  // Total Distance – 3-byte uint (skip)
  if (flags & (1 << FLAGS.TOTAL_DISTANCE)) {
    offset += 3;
  }

  // Resistance Level – sint16 (skip)
  if (flags & (1 << FLAGS.RESISTANCE_LEVEL)) {
    offset += 2;
  }

  // Instantaneous Power – sint16, 1 W resolution
  if (flags & (1 << FLAGS.INST_POWER)) {
    result.instantaneousPower = data.getInt16(offset, true);
    offset += 2;
  }

  // Average Power (skip)
  if (flags & (1 << FLAGS.AVG_POWER)) {
    offset += 2;
  }

  return result;
}

// ─── Real Bluetooth service ───────────────────────────────────────────────────

/**
 * TrainerService – connects to an FTMS trainer over Web Bluetooth and
 * streams decoded Indoor Bike Data frames to a registered callback.
 *
 * Usage:
 *   const svc = new TrainerService();
 *   svc.onData(frame => console.log(frame.instantaneousPower));
 *   await svc.connect();   // triggers browser BT picker
 */
export class TrainerService implements ITrainerService {
  private deviceId: string | null = null;
  private connected = false;
  private hasControlPoint = false;
  private controlGranted = false;
  private dataCallback: ((data: Partial<TrainerData>) => void) | null = null;

  private debugLog: string[] = ['timestamp,event_type,speed_kmh,power_w,cadence_rpm,sent_grade,sent_crr,sent_cwa'];

  // Store the most recent simulation parameters in case they are sent
  // before the trainer is ready (e.g. during the connection handshake).
  private pendingParams: { grade: number; crr: number; cwa: number } | null = null;

  async connect(): Promise<void> {
    const device = await BleClient.requestDevice({
      services: [FTMS_SERVICE_UUID],
    });
    this.deviceId = device.deviceId;

    await BleClient.connect(this.deviceId, () => {
      // onDisconnect callback
      this.connected = false;
      this.controlGranted = false;
      this.hasControlPoint = false;
    });
    this.connected = true;

    // ── Indoor Bike Data (read-only notifications) ──────────────────────────
    await BleClient.startNotifications(
      this.deviceId,
      FTMS_SERVICE_UUID,
      INDOOR_BIKE_DATA_UUID,
      (data) => {
        const parsed = parseIndoorBikeData(data);
        const row = `${Date.now()},IN_DATA,${parsed.instantaneousSpeed ?? ''},${parsed.instantaneousPower ?? ''},${parsed.instantaneousCadence ?? ''},,,`;
        this.debugLog.push(row);

        if (this.dataCallback) {
          this.dataCallback(parsed);
        }
      },
    );

    // ── Fitness Machine Control Point (write + indications) ─────────────────
    // Optional: if the trainer does not expose 0x2AD9 we continue without it.
    try {
      await BleClient.startNotifications(
        this.deviceId,
        FTMS_SERVICE_UUID,
        CONTROL_POINT_UUID,
        this.handleControlResponse,
      );
      this.hasControlPoint = true;
      // Request exclusive write access to the control point
      const requestControlBuf = new DataView(new ArrayBuffer(1));
      requestControlBuf.setUint8(0, OP_REQUEST_CONTROL);
      await BleClient.write(this.deviceId, FTMS_SERVICE_UUID, CONTROL_POINT_UUID, requestControlBuf);
    } catch (err) {
      console.warn('[TrainerService] Control Point unavailable – grade writes disabled:', err);
      this.hasControlPoint = false;
    }
  }

  disconnect(): void {
    if (!this.deviceId) return;
    const id = this.deviceId;
    this.deviceId = null;
    this.connected = false;
    this.controlGranted = false;

    if (this.hasControlPoint) {
      void BleClient.stopNotifications(id, FTMS_SERVICE_UUID, CONTROL_POINT_UUID).catch(() => undefined);
      this.hasControlPoint = false;
    }
    void BleClient.stopNotifications(id, FTMS_SERVICE_UUID, INDOOR_BIKE_DATA_UUID).catch(() => undefined);
    void BleClient.disconnect(id).catch(() => undefined);
  }

  onData(callback: (data: Partial<TrainerData>) => void): void {
    this.dataCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Write Op Code 0x11 (Set Indoor Bike Simulation Parameters) to 0x2AD9.
   *
   * Byte layout (7 bytes total):
   *   [0]    Op Code = 0x11
   *   [1–2]  Wind Speed   sint16 LE, resolution 0.001 m/s  → 0 (no wind)
   *   [3–4]  Grade        sint16 LE, resolution 0.01%      → grade * 10 000
   *   [5]    Crr          uint8,     resolution 0.0001      → crr / 0.0001
   *   [6]    CWA          uint8,     resolution 0.01 kg/m   → cwa / 0.01
   *
   * CWA (Wind Resistance Coefficient) = ½ × ρ_air × CdA
   * At sea level with CdA = 0.325 m²: CWA = 0.5 × 1.225 × 0.325 ≈ 0.199 → 20
   */
  async setSimulationParams(grade: number, crr: number, cwa: number): Promise<void> {
    if (!this.hasControlPoint || !this.deviceId) return;

    // Always store the latest params so we can (re)sync once control is ready
    this.pendingParams = { grade, crr, cwa };

    if (!this.controlGranted) {
      console.log('[TrainerService] Queuing simulation params (waiting for control)');
      return;
    }

    const buf = new DataView(new ArrayBuffer(7));
    buf.setUint8(0, OP_SET_INDOOR_BIKE_SIMULATION);
    buf.setInt16(1, 0, true);                                             // wind speed: 0
    buf.setInt16(3, Math.round(grade * 10000), true);                     // grade in 0.01% units
    buf.setUint8(5, Math.min(255, Math.round(crr / 0.0001)));             // Crr
    buf.setUint8(6, Math.min(255, Math.round(cwa / 0.01)));               // CWA

    try {
      const row = `${Date.now()},OUT_CMD,,,,${grade.toFixed(4)},${crr.toFixed(4)},${cwa.toFixed(2)}`;
      this.debugLog.push(row);
      await BleClient.write(this.deviceId, FTMS_SERVICE_UUID, CONTROL_POINT_UUID, buf);
    } catch (err) {
      console.error('[TrainerService] Failed to set simulation params:', err);
    }
  }

  downloadDebugLog(): void {
    const csvContent = this.debugLog.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `spokes_trainer_debug_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  /**
   * Parse FTMS Control Point indication responses.
   * Response byte layout:
   *   [0] = 0x80 (Response Code)
   *   [1] = Request Op Code
   *   [2] = Result Code: 0x01 = Success
   */
  private handleControlResponse = (data: DataView): void => {
    if (data.byteLength < 3 || data.getUint8(0) !== 0x80) return;

    const opCode = data.getUint8(1);
    const result = data.getUint8(2);

    if (opCode === OP_REQUEST_CONTROL && result === 0x01) {
      console.log('[TrainerService] Control granted. Starting session...');
      this.controlGranted = true;
      // Automatically start/resume session once control is granted.
      // This ensures the trainer exits any default pause/erg modes.
      if (this.deviceId) {
        const startBuf = new DataView(new ArrayBuffer(1));
        startBuf.setUint8(0, OP_START_RESUME);
        void BleClient.write(this.deviceId, FTMS_SERVICE_UUID, CONTROL_POINT_UUID, startBuf);
      }
    } else if (opCode === OP_START_RESUME && result === 0x01) {
      console.log('[TrainerService] Workout session started.');
      // Once the session is active, sync the initial simulation state
      if (this.pendingParams) {
        const { grade, crr, cwa } = this.pendingParams;
        void this.setSimulationParams(grade, crr, cwa);
      }
    }
  };
}
