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

import type { ITrainerService, TrainerData } from './ITrainerService';

// ─── GATT UUIDs ──────────────────────────────────────────────────────────────

export const FTMS_SERVICE_UUID = 'fitness_machine';
/** Indoor Bike Data – 0x2AD2 */
export const INDOOR_BIKE_DATA_UUID = 'indoor_bike_data';
/** Fitness Machine Control Point – 0x2AD9 (write + indicate) */
export const CONTROL_POINT_UUID = 'fitness_machine_control_point';

// ─── Control Point Op Codes (FTMS spec §4.16.1) ──────────────────────────────

const OP_REQUEST_CONTROL = 0x00;
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
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private controlPoint: BluetoothRemoteGATTCharacteristic | null = null;
  private controlGranted = false;
  private dataCallback: ((data: Partial<TrainerData>) => void) | null = null;

  async connect(): Promise<void> {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [FTMS_SERVICE_UUID] }],
    });

    if (!this.device.gatt) {
      throw new Error('GATT server unavailable on selected device');
    }

    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(FTMS_SERVICE_UUID);

    // ── Indoor Bike Data (read-only notifications) ──────────────────────────
    this.characteristic = await service.getCharacteristic(INDOOR_BIKE_DATA_UUID);
    this.characteristic.addEventListener(
      'characteristicvaluechanged',
      this.handleNotification,
    );
    await this.characteristic.startNotifications();

    // ── Fitness Machine Control Point (write + indications) ─────────────────
    // Optional: if the trainer does not expose 0x2AD9 we continue without it.
    try {
      this.controlPoint = await service.getCharacteristic(CONTROL_POINT_UUID);
      this.controlPoint.addEventListener(
        'characteristicvaluechanged',
        this.handleControlResponse,
      );
      await this.controlPoint.startNotifications();
      // Request exclusive write access to the control point
      await this.controlPoint.writeValueWithResponse(
        new Uint8Array([OP_REQUEST_CONTROL]).buffer,
      );
    } catch (err) {
      console.warn('[TrainerService] Control Point unavailable – grade writes disabled:', err);
      this.controlPoint = null;
    }
  }

  disconnect(): void {
    if (this.controlPoint) {
      this.controlPoint.removeEventListener(
        'characteristicvaluechanged',
        this.handleControlResponse,
      );
      void this.controlPoint.stopNotifications().catch(() => undefined);
      this.controlPoint = null;
      this.controlGranted = false;
    }
    if (this.characteristic) {
      this.characteristic.removeEventListener(
        'characteristicvaluechanged',
        this.handleNotification,
      );
      void this.characteristic.stopNotifications().catch(() => undefined);
      this.characteristic = null;
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
  }

  onData(callback: (data: Partial<TrainerData>) => void): void {
    this.dataCallback = callback;
  }

  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  /**
   * Write Op Code 0x11 (Set Indoor Bike Simulation Parameters) to 0x2AD9.
   *
   * Byte layout (7 bytes total):
   *   [0]    Op Code = 0x11
   *   [1–2]  Wind Speed   sint16 LE, resolution 0.001 m/s  → 0
   *   [3–4]  Grade        sint16 LE, resolution 0.01%      → grade * 10 000
   *   [5]    Crr          uint8,     resolution 0.0001      → 50 (= 0.005)
   *   [6]    CWA          uint8,     resolution 0.01 kg/m   → 0
   */
  async setGrade(grade: number): Promise<void> {
    if (!this.controlPoint || !this.controlGranted) return;
    const buf = new DataView(new ArrayBuffer(7));
    buf.setUint8(0, OP_SET_INDOOR_BIKE_SIMULATION);
    buf.setInt16(1, 0, true);                            // wind speed: 0
    buf.setInt16(3, Math.round(grade * 10000), true);    // grade in 0.01% units
    buf.setUint8(5, 50);                                 // Crr = 0.005
    buf.setUint8(6, 0);                                  // CWA = 0
    await this.controlPoint.writeValueWithResponse(buf.buffer);
  }

  // ── Private event handlers ─────────────────────────────────────────────────

  private handleNotification = (event: Event): void => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (characteristic.value && this.dataCallback) {
      this.dataCallback(parseIndoorBikeData(characteristic.value));
    }
  };

  /**
   * Parse FTMS Control Point indication responses.
   * Response byte layout:
   *   [0] = 0x80 (Response Code)
   *   [1] = Request Op Code
   *   [2] = Result Code: 0x01 = Success
   */
  private handleControlResponse = (event: Event): void => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic.value) return;
    const view = characteristic.value;
    // Byte 0 = 0x80 (response), byte 1 = echoed op code, byte 2 = result
    if (view.byteLength >= 3 && view.getUint8(0) === 0x80) {
      const opCode = view.getUint8(1);
      const result = view.getUint8(2);
      if (opCode === OP_REQUEST_CONTROL && result === 0x01) {
        this.controlGranted = true;
      }
    }
  };
}
