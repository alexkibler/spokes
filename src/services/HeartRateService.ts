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
export class HeartRateService {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private dataCallback: ((data: HeartRateData) => void) | null = null;

  async connect(): Promise<void> {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }],
    });

    if (!this.device.gatt) {
      throw new Error('GATT server unavailable on selected device');
    }

    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    this.characteristic = await service.getCharacteristic('heart_rate_measurement');
    this.characteristic.addEventListener(
      'characteristicvaluechanged',
      this.handleNotification,
    );
    await this.characteristic.startNotifications();
  }

  disconnect(): void {
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

  onData(callback: (data: HeartRateData) => void): void {
    this.dataCallback = callback;
  }

  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private handleNotification = (event: Event): void => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value || !this.dataCallback) return;

    const view = char.value;
    const flags = view.getUint8(0);
    // Bit 0 of flags: 0 = uint8 format, 1 = uint16 format
    const bpm = (flags & 0x01) ? view.getUint16(1, /* littleEndian= */ true)
                                : view.getUint8(1);
    this.dataCallback({ bpm, timestamp: Date.now() });
  };
}
