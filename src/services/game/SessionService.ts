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
import type { RemoteService } from '../../network/RemoteService';

export class SessionService {
  private _trainer: ITrainerService | null = null;
  private _hrm: HeartRateService | null = null;
  private _units: Units = 'imperial';
  private _weightKg = 75;
  private _remoteService: RemoteService | null = null;
  private _autoplayEnabled = false;
  private _autoplayDelayMs = 2000;

  get trainer(): ITrainerService | null { return this._trainer; }
  get hrm(): HeartRateService | null { return this._hrm; }
  get units(): Units { return this._units; }
  get weightKg(): number { return this._weightKg; }
  get autoplayEnabled(): boolean { return this._autoplayEnabled; }
  get autoplayDelayMs(): number { return this._autoplayDelayMs; }

  setTrainer(t: ITrainerService | null): void { this._trainer = t; }
  setHrm(h: HeartRateService | null): void { this._hrm = h; }
  setUnits(u: Units): void { this._units = u; }
  setWeightKg(w: number): void { this._weightKg = w; }

  setRemoteService(remote: RemoteService): void {
    this._remoteService = remote;
  }

  setAutoplayDelayMs(ms: number): void { this._autoplayDelayMs = ms; }

  setAutoplay(enabled: boolean): void {
    this._autoplayEnabled = enabled;
    if (this._remoteService) {
      this._remoteService.sendAutoplayUpdate(enabled);
    }
  }

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
