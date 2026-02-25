/**
 * SessionService.ts
 *
 * Holds cross-scene session state:
 * trainer, HRM service, units preference, and rider weight.
 */

import type { ITrainerService } from '../hardware/ITrainerService';
import { MockTrainerService } from '../hardware/MockTrainerService';
import { HeartRateService } from '../hardware/HeartRateService';
import type { Units } from '../../scenes/MenuScene';

export class SessionService {
  private _trainer: ITrainerService | null = null;
  private _hrm: HeartRateService | null = null;
  private _units: Units = 'imperial';
  private _weightKg = 75;

  get trainer(): ITrainerService | null { return this._trainer; }
  get hrm(): HeartRateService | null { return this._hrm; }
  get units(): Units { return this._units; }
  get weightKg(): number { return this._weightKg; }

  setTrainer(t: ITrainerService | null): void { this._trainer = t; }
  setHrm(h: HeartRateService | null): void { this._hrm = h; }
  setUnits(u: Units): void { this._units = u; }
  setWeightKg(w: number): void { this._weightKg = w; }

  /**
   * Disconnect and forget all device services.
   * Call from MenuScene.create() so real BT connections are closed when
   * the player returns to the main menu.
   */
  disconnectAll(): void {
    this._trainer?.disconnect();
    this._trainer = null;
    this._hrm?.disconnect();
    this._hrm = null;
  }

  /**
   * Disconnect and forget mock trainers only.
   * Real BT trainers are left connected so they persist across scenes.
   */
  disconnectMock(): void {
    if (this._trainer instanceof MockTrainerService) {
      this._trainer.disconnect();
      this._trainer = null;
    }
  }
}
