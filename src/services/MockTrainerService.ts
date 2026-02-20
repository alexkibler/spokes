/**
 * MockTrainerService.ts
 *
 * In-memory implementation of ITrainerService for development and testing.
 * Emits configurable trainer data at a fixed interval – no Bluetooth required.
 *
 * The mock can be used in two ways:
 *   1. Static values  – set power/speed/cadence once via the constructor.
 *   2. Dynamic values – call setPower() / setSpeed() / setCadence() at any
 *      time to change what the next frame emits (e.g. driven by UI sliders).
 *
 * Example:
 *   const mock = new MockTrainerService({ power: 250, cadence: 90 });
 *   mock.onData(frame => console.log(frame.instantaneousPower)); // 250
 *   await mock.connect();
 *   // ... later ...
 *   mock.setPower(300);
 */

import type { ITrainerService, TrainerData } from './ITrainerService';

export interface MockConfig {
  /** Instantaneous power in watts (default 200) */
  power?: number;
  /** Instantaneous speed in km/h (default 30) */
  speed?: number;
  /** Instantaneous cadence in rpm (default 90) */
  cadence?: number;
  /** How often to emit a data frame in ms (default 1000) */
  intervalMs?: number;
}

export class MockTrainerService implements ITrainerService {
  private power: number;
  private speed: number;
  private cadence: number;
  private readonly intervalMs: number;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private dataCallback: ((data: Partial<TrainerData>) => void) | null = null;
  private connected = false;

  constructor(config: MockConfig = {}) {
    this.power = config.power ?? 200;
    this.speed = config.speed ?? 30;
    this.cadence = config.cadence ?? 90;
    this.intervalMs = config.intervalMs ?? 1000;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.intervalId = setInterval(() => this.emit(), this.intervalMs);
    // Emit one frame immediately so the UI doesn't wait a full interval
    this.emit();
  }

  disconnect(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.connected = false;
  }

  onData(callback: (data: Partial<TrainerData>) => void): void {
    this.dataCallback = callback;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Mutators for live updates from the UI ──────────────────────────────────

  setPower(watts: number): void {
    this.power = watts;
  }

  setSpeed(kmh: number): void {
    this.speed = kmh;
  }

  setCadence(rpm: number): void {
    this.cadence = rpm;
  }

  /** No-op: grade is applied to physics locally in the scene, not via hardware */
  async setGrade(_grade: number): Promise<void> {
    // intentionally empty
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private emit(): void {
    if (this.dataCallback) {
      this.dataCallback({
        instantaneousPower: this.power,
        instantaneousSpeed: this.speed,
        instantaneousCadence: this.cadence,
        timestamp: Date.now(),
      });
    }
  }
}
