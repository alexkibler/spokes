/**
 * SessionService.ts
 *
 * Static singleton that holds cross-scene session state:
 * trainer, HRM service, units preference, and rider weight.
 *
 * Eliminates the need to thread these values through scene.start() init data.
 * MenuScene sets them; MapScene and GameScene read them.
 */

import type { ITrainerService } from './ITrainerService';
import { MockTrainerService } from './MockTrainerService';
import { HeartRateService } from './HeartRateService';
import type { Units } from '../scenes/MenuScene';

export class SessionService {
  private static _trainer: ITrainerService | null = null;
  private static _hrm: HeartRateService | null = null;
  private static _units: Units = 'imperial';
  private static _weightKg = 75;

  static get trainer(): ITrainerService | null { return this._trainer; }
  static get hrm(): HeartRateService | null { return this._hrm; }
  static get units(): Units { return this._units; }
  static get weightKg(): number { return this._weightKg; }

  static setTrainer(t: ITrainerService | null): void { this._trainer = t; }
  static setHrm(h: HeartRateService | null): void { this._hrm = h; }
  static setUnits(u: Units): void { this._units = u; }
  static setWeightKg(w: number): void { this._weightKg = w; }

  /**
   * Disconnect and forget all device services.
   * Call from MenuScene.create() so real BT connections are closed when
   * the player returns to the main menu.
   */
  static disconnectAll(): void {
    this._trainer?.disconnect();
    this._trainer = null;
    this._hrm?.disconnect();
    this._hrm = null;
  }

  /**
   * Disconnect and forget mock trainers only.
   * Real BT trainers are left connected so they persist across scenes.
   */
  static disconnectMock(): void {
    if (this._trainer instanceof MockTrainerService) {
      this._trainer.disconnect();
      this._trainer = null;
    }
  }
}
