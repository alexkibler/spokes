/**
 * HeartRateService.ts
 *
 * Web Bluetooth implementation for standard Heart Rate monitors (Bluetooth
 * Heart Rate Profile / GATT Heart Rate Service).
 *
 * GATT UUIDs:
 *   Service:        Heart Rate             – 0x180D
 *   Characteristic: Heart Rate Measurement – 0x2A37
 *
 * Heart Rate Measurement byte layout (GATT spec §3.106):
 * ┌────────┬──────────────────────────────────────────────────────────────┐
 * │ Byte 0 │ Flags: bit 0 = HR format (0 = uint8, 1 = uint16)            │
 * │ Byte 1 │ Heart Rate Value LSB (always present)                        │
 * │ Byte 2 │ Heart Rate Value MSB (only when bit 0 of flags = 1)          │
 * └────────┴──────────────────────────────────────────────────────────────┘
 *
 * Compatible with most chest straps and optical HR monitors (Polar, Garmin,
 * Wahoo Tickr, Apple Watch, etc.) that advertise the Heart Rate service.
 */

import { BleClient } from '@capacitor-community/bluetooth-le';

// ─── Data type ────────────────────────────────────────────────────────────────

export interface HeartRateData {
  /** Heart rate in beats per minute. */
  bpm: number;
  timestamp: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * HeartRateService – connects to a BLE heart rate monitor and streams
 * decoded Heart Rate Measurement notifications to a registered callback.
 *
 * Usage:
 *   const hrm = new HeartRateService();
 *   hrm.onData(d => console.log(d.bpm));
 *   await hrm.connect();   // triggers browser BT picker
 */
const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

export class HeartRateService {
  private deviceId: string | null = null;
  private connected = false;
  private dataCallback: ((data: HeartRateData) => void) | null = null;

  async connect(): Promise<void> {
    const device = await BleClient.requestDevice({
      services: [HR_SERVICE_UUID],
    });
    this.deviceId = device.deviceId;

    await BleClient.connect(this.deviceId, () => {
      this.connected = false;
    });
    this.connected = true;

    await BleClient.startNotifications(
      this.deviceId,
      HR_SERVICE_UUID,
      HR_MEASUREMENT_UUID,
      this.handleNotification,
    );
  }

  disconnect(): void {
    if (!this.deviceId) return;
    const id = this.deviceId;
    this.deviceId = null;
    this.connected = false;
    void BleClient.stopNotifications(id, HR_SERVICE_UUID, HR_MEASUREMENT_UUID).catch(() => undefined);
    void BleClient.disconnect(id).catch(() => undefined);
  }

  onData(callback: (data: HeartRateData) => void): void {
    this.dataCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private handleNotification = (data: DataView): void => {
    if (!this.dataCallback) return;
    const flags = data.getUint8(0);
    // Bit 0 of flags: 0 = uint8 format, 1 = uint16 format
    const bpm = (flags & 0x01) ? data.getUint16(1, /* littleEndian= */ true)
                                : data.getUint8(1);
    this.dataCallback({ bpm, timestamp: Date.now() });
  };
}
