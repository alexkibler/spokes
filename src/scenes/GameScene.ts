/**
 * GameScene.ts
 *
 * Primary Phaser 3 scene for Paper Peloton – Phase 1.
 *
 * Features:
 *   • Digital power display (large W readout)
 *   • Secondary readouts for speed (km/h) and cadence (rpm)
 *   • "Mock Mode" toggle button – switches between real FTMS Bluetooth and
 *     the MockTrainerService without reloading
 *   • "Connect" button – opens the Web Bluetooth device picker (real mode only)
 *
 * Architecture:
 *   The scene holds a reference to ITrainerService.  Toggling mock mode
 *   disconnects the current service, swaps the reference, and reconnects.
 *   All Phaser logic is decoupled from the data source.
 */

import Phaser from 'phaser';
import type { ITrainerService, TrainerData } from '../services/ITrainerService';
import { TrainerService } from '../services/TrainerService';
import { MockTrainerService } from '../services/MockTrainerService';

// ─── Layout constants ─────────────────────────────────────────────────────────

const CX = 480; // canvas centre X
const CY = 270; // canvas centre Y

// ─── Colour palette ───────────────────────────────────────────────────────────

const COLOR = {
  bg: 0x0d0d0d,
  panelBg: 0x1a1a2e,
  panelBorder: 0x16213e,
  powerText: 0x00f5d4,
  labelText: 0x8888aa,
  unitText: 0x44ffaa,
  btnConnect: 0x1a6b3a,
  btnConnectHover: 0x25a558,
  btnMock: 0x2a2a6b,
  btnMockHover: 0x3a3aaa,
  btnMockActive: 0x6b2a6b,
  btnMockActiveHover: 0xaa3aaa,
  btnText: 0xffffff,
  statusOk: 0x00ff88,
  statusOff: 0x555566,
  statusErr: 0xff4444,
};

// ─── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // Service reference – swapped when toggling mock mode
  private trainer!: ITrainerService;
  private isMockMode = true; // start in mock mode for safe first launch

  // Phaser display objects
  private powerValue!: Phaser.GameObjects.Text;
  private speedValue!: Phaser.GameObjects.Text;
  private cadenceValue!: Phaser.GameObjects.Text;
  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private btnMock!: Phaser.GameObjects.Rectangle;
  private btnMockLabel!: Phaser.GameObjects.Text;
  private btnConnect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  create(): void {
    this.buildBackground();
    this.buildPowerDisplay();
    this.buildSecondaryReadouts();
    this.buildStatusIndicator();
    this.buildButtons();

    // Initialise with mock service so the app is immediately usable
    this.trainer = new MockTrainerService({ power: 0, speed: 0, cadence: 0 });
    this.trainer.onData((data) => this.handleData(data));
    void this.trainer.connect();
    this.updateMockButtonStyle();
    this.setStatus('mock', 'MOCK');
  }

  // ── Background & panel ──────────────────────────────────────────────────────

  private buildBackground(): void {
    this.cameras.main.setBackgroundColor(COLOR.bg);

    // Main data panel
    this.add
      .rectangle(CX, CY - 20, 600, 340, COLOR.panelBg)
      .setStrokeStyle(2, COLOR.panelBorder);

    // Title bar
    this.add
      .text(CX, 28, 'PAPER PELOTON', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
        letterSpacing: 6,
      })
      .setOrigin(0.5);
  }

  // ── Power display ───────────────────────────────────────────────────────────

  private buildPowerDisplay(): void {
    // Label
    this.add
      .text(CX, CY - 100, 'POWER', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    // Large digital readout
    this.powerValue = this.add
      .text(CX, CY - 40, '---', {
        fontFamily: 'monospace',
        fontSize: '96px',
        color: '#' + COLOR.powerText.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Unit label
    this.add
      .text(CX, CY + 52, 'W', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#' + COLOR.unitText.toString(16).padStart(6, '0'),
        letterSpacing: 2,
      })
      .setOrigin(0.5);
  }

  // ── Speed / cadence row ─────────────────────────────────────────────────────

  private buildSecondaryReadouts(): void {
    const y = CY + 100;
    const leftX = CX - 150;
    const rightX = CX + 150;

    // Speed
    this.add
      .text(leftX, y - 22, 'SPEED', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.speedValue = this.add
      .text(leftX, y + 8, '--.-', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ccccff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(leftX, y + 36, 'km/h', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
      })
      .setOrigin(0.5);

    // Cadence
    this.add
      .text(rightX, y - 22, 'CADENCE', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.cadenceValue = this.add
      .text(rightX, y + 8, '---', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ccccff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(rightX, y + 36, 'rpm', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
      })
      .setOrigin(0.5);
  }

  // ── Status indicator ────────────────────────────────────────────────────────

  private buildStatusIndicator(): void {
    const y = 490;
    this.statusDot = this.add.arc(CX - 55, y, 5, 0, 360, false, COLOR.statusOff);
    this.statusLabel = this.add
      .text(CX - 44, y, 'DISCONNECTED', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + COLOR.labelText.toString(16).padStart(6, '0'),
      })
      .setOrigin(0, 0.5);
  }

  private setStatus(
    state: 'ok' | 'mock' | 'off' | 'err',
    label: string,
  ): void {
    const colors: Record<string, number> = {
      ok: COLOR.statusOk,
      mock: 0xffcc00,
      off: COLOR.statusOff,
      err: COLOR.statusErr,
    };
    const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
    this.statusDot.setFillStyle(colors[state] ?? COLOR.statusOff);
    this.statusLabel
      .setText(label)
      .setColor(hex(colors[state] ?? COLOR.statusOff));
  }

  // ── Buttons ─────────────────────────────────────────────────────────────────

  private buildButtons(): void {
    this.buildMockButton();
    this.buildConnectButton();
  }

  private buildMockButton(): void {
    const x = CX - 90;
    const y = 450;

    this.btnMock = this.add
      .rectangle(x, y, 150, 38, COLOR.btnMockActive)
      .setInteractive({ useHandCursor: true });

    this.btnMockLabel = this.add
      .text(x, y, 'MOCK MODE: ON', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5);

    this.btnMock
      .on('pointerover', () =>
        this.btnMock.setFillStyle(
          this.isMockMode ? COLOR.btnMockActiveHover : COLOR.btnMockHover,
        ),
      )
      .on('pointerout', () => this.updateMockButtonStyle())
      .on('pointerdown', () => this.toggleMockMode());
  }

  private buildConnectButton(): void {
    const x = CX + 90;
    const y = 450;

    this.btnConnect = this.add
      .rectangle(x, y, 150, 38, COLOR.btnConnect)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, y, 'BT CONNECT', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5);

    this.btnConnect
      .on('pointerover', () =>
        this.btnConnect.setFillStyle(COLOR.btnConnectHover),
      )
      .on('pointerout', () => this.btnConnect.setFillStyle(COLOR.btnConnect))
      .on('pointerdown', () => this.connectReal());
  }

  private updateMockButtonStyle(): void {
    this.btnMock.setFillStyle(
      this.isMockMode ? COLOR.btnMockActive : COLOR.btnMock,
    );
    this.btnMockLabel.setText(
      this.isMockMode ? 'MOCK MODE: ON' : 'MOCK MODE: OFF',
    );
  }

  // ── Mode switching ──────────────────────────────────────────────────────────

  private toggleMockMode(): void {
    this.isMockMode = !this.isMockMode;

    this.trainer.disconnect();

    if (this.isMockMode) {
      this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.setStatus('mock', 'MOCK');
    } else {
      // Switch to real service but don't auto-connect – wait for BT button
      this.trainer = new TrainerService();
      this.trainer.onData((data) => this.handleData(data));
      this.setStatus('off', 'DISCONNECTED');
      this.resetReadouts();
    }

    this.updateMockButtonStyle();
  }

  private connectReal(): void {
    if (this.isMockMode) {
      // Clicking BT Connect while in mock mode auto-switches to real mode first
      this.isMockMode = false;
      this.trainer.disconnect();
      this.trainer = new TrainerService();
      this.trainer.onData((data) => this.handleData(data));
      this.updateMockButtonStyle();
    }

    this.setStatus('off', 'CONNECTING…');

    this.trainer
      .connect()
      .then(() => {
        this.setStatus('ok', 'BT CONNECTED');
      })
      .catch((err: unknown) => {
        console.error('[GameScene] Bluetooth connect failed:', err);
        this.setStatus('err', 'CONNECT FAILED');
      });
  }

  // ── Data handling ───────────────────────────────────────────────────────────

  private handleData(data: Partial<TrainerData>): void {
    if (data.instantaneousPower !== undefined) {
      this.powerValue.setText(String(Math.round(data.instantaneousPower)));
    }
    if (data.instantaneousSpeed !== undefined) {
      this.speedValue.setText(data.instantaneousSpeed.toFixed(1));
    }
    if (data.instantaneousCadence !== undefined) {
      this.cadenceValue.setText(String(Math.round(data.instantaneousCadence)));
    }
  }

  private resetReadouts(): void {
    this.powerValue.setText('---');
    this.speedValue.setText('--.-');
    this.cadenceValue.setText('---');
  }
}
