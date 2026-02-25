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
  /**
   * Send simulation parameters to the trainer (real: writes FTMS Control Point
   * 0x2AD9 Op Code 0x11; mock: no-op since physics is applied locally).
   * Optional – callers must check for existence before calling.
   *
   * @param grade - Road grade as decimal fraction (0 = flat, 0.05 = 5% climb)
   * @param crr   - Rolling resistance coefficient (e.g. 0.005 for asphalt)
   * @param cwa   - Wind resistance coefficient in kg/m (= ½ × ρ_air × CdA)
   */
  setSimulationParams?(grade: number, crr: number, cwa: number): Promise<void>;
  /**
   * Optional debug method to download internal logs (for hardware diagnostics).
   */
  downloadDebugLog?(): void;
}
