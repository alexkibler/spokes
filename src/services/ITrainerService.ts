/**
 * TrainerData – the normalised snapshot emitted by any trainer source.
 *
 * All units follow SI / common cycling conventions:
 *   power      – watts (W)
 *   speed      – kilometres per hour (km/h)
 *   cadence    – revolutions per minute (rpm)
 *   timestamp  – Unix epoch milliseconds
 */
export interface TrainerData {
  instantaneousPower: number;
  instantaneousSpeed: number;
  instantaneousCadence: number;
  timestamp: number;
}

/**
 * Common contract that both the real FTMS TrainerService and the
 * MockTrainerService must satisfy.  Phaser scenes depend only on this
 * interface so the data source can be swapped without touching game code.
 */
export interface ITrainerService {
  /** Request Bluetooth pairing (real) or start the interval (mock). */
  connect(): Promise<void>;
  /** Release all resources. */
  disconnect(): void;
  /** Register the callback that receives every data frame. */
  onData(callback: (data: Partial<TrainerData>) => void): void;
  /** True while the service is actively delivering data. */
  isConnected(): boolean;
}
