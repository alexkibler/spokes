/**
 * GameScene.ts
 *
 * Primary Phaser 3 scene for Paper Peloton – Phase 2.
 *
 * Features:
 *   • 3-layer paper-style parallax background (mountains, hills, ground, road)
 *   • Physics-driven velocity: watt output → m/s via CyclistPhysics
 *   • Compacted HUD top strip (power, physics speed, cadence)
 *   • Mock Mode toggle and BT Connect buttons in a floating bottom strip
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
import { powerToVelocityMs, msToKmh } from '../physics/CyclistPhysics';

// ─── Layout constants ──────────────────────────────────────────────────────────

const W = 960;
const H = 540;
const CX = W / 2;

/** Pixels scrolled per (m/s) of velocity — road layer multiplier */
const WORLD_SCALE = 50; // px/(m/s)

/** Velocity smoothing time constant (higher = faster response) */
const LERP_FACTOR = 1.5;

// ─── Parallax layer definitions ────────────────────────────────────────────────

interface LayerDef {
  key: string;
  parallax: number;
  depth: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // Service reference – swapped when toggling mock mode
  private trainer!: ITrainerService;
  private isMockMode = true;

  // Physics state
  private targetVelocityMs = 0;
  private smoothVelocityMs = 0;

  // Parallax layers
  private layerMountains!: Phaser.GameObjects.TileSprite;
  private layerMidHills!: Phaser.GameObjects.TileSprite;
  private layerNearGround!: Phaser.GameObjects.TileSprite;
  private layerRoad!: Phaser.GameObjects.TileSprite;

  // HUD display objects
  private hudSpeed!: Phaser.GameObjects.Text;
  private hudPower!: Phaser.GameObjects.Text;
  private hudCadence!: Phaser.GameObjects.Text;

  // Status / button objects
  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private btnMock!: Phaser.GameObjects.Rectangle;
  private btnMockLabel!: Phaser.GameObjects.Text;
  private btnConnect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#e8dcc8');

    this.buildParallaxLayers();
    this.buildHUD();
    this.buildBottomControls();

    // Start in mock mode with 200 W so the world scrolls immediately
    this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
    this.trainer.onData((data) => this.handleData(data));
    void this.trainer.connect();
    this.updateMockButtonStyle();
    this.setStatus('mock', 'MOCK');
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000; // seconds

    // Smooth velocity toward target
    this.smoothVelocityMs +=
      (this.targetVelocityMs - this.smoothVelocityMs) * dt * LERP_FACTOR;

    // Scroll each parallax layer
    const baseScroll = this.smoothVelocityMs * WORLD_SCALE * dt;
    this.layerMountains.tilePositionX += baseScroll * 0.10;
    this.layerMidHills.tilePositionX  += baseScroll * 0.30;
    this.layerNearGround.tilePositionX += baseScroll * 0.65;
    this.layerRoad.tilePositionX      += baseScroll * 1.00;

    // Update HUD speed from physics (not raw FTMS)
    this.hudSpeed.setText(msToKmh(this.smoothVelocityMs).toFixed(1));
  }

  // ── Parallax layers ──────────────────────────────────────────────────────────

  private buildParallaxLayers(): void {
    const layers: LayerDef[] = [
      {
        key: 'mountains',
        parallax: 0.10,
        depth: 0,
        draw: (g) => this.drawMountains(g),
      },
      {
        key: 'midHills',
        parallax: 0.30,
        depth: 1,
        draw: (g) => this.drawMidHills(g),
      },
      {
        key: 'nearGround',
        parallax: 0.65,
        depth: 2,
        draw: (g) => this.drawNearGround(g),
      },
      {
        key: 'road',
        parallax: 1.00,
        depth: 3,
        draw: (g) => this.drawRoad(g),
      },
    ];

    for (const layer of layers) {
      const g = this.add.graphics();
      layer.draw(g);
      g.generateTexture(layer.key, W, H);
      g.destroy();

      const sprite = this.add
        .tileSprite(0, 0, W, H, layer.key)
        .setOrigin(0, 0)
        .setDepth(layer.depth);

      if (layer.key === 'mountains') this.layerMountains = sprite;
      else if (layer.key === 'midHills') this.layerMidHills = sprite;
      else if (layer.key === 'nearGround') this.layerNearGround = sprite;
      else if (layer.key === 'road') this.layerRoad = sprite;
    }
  }

  /** Mountains: aged paper peaks, y≈115–200 */
  private drawMountains(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xb8aa96, 1);
    g.fillPoints(
      [
        { x: 0,   y: H },
        { x: 0,   y: 200 },
        { x: 80,  y: 115 },
        { x: 200, y: 190 },
        { x: 320, y: 130 },
        { x: 430, y: 200 },
        { x: 560, y: 120 },
        { x: 680, y: 175 },
        { x: 780, y: 115 },
        { x: 880, y: 165 },
        { x: 960, y: 145 },
        { x: 960, y: H },
      ],
      true,
    );
  }

  /** Mid hills: sage green, y≈275–340 */
  private drawMidHills(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x7a9469, 1);
    g.fillPoints(
      [
        { x: 0,   y: H },
        { x: 0,   y: 340 },
        { x: 60,  y: 300 },
        { x: 150, y: 275 },
        { x: 270, y: 310 },
        { x: 390, y: 280 },
        { x: 510, y: 340 },
        { x: 630, y: 285 },
        { x: 750, y: 310 },
        { x: 870, y: 275 },
        { x: 960, y: 310 },
        { x: 960, y: H },
      ],
      true,
    );
  }

  /** Near ground: forest green, y≈375–400 */
  private drawNearGround(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x4a6e38, 1);
    g.fillPoints(
      [
        { x: 0,   y: H },
        { x: 0,   y: 400 },
        { x: 100, y: 380 },
        { x: 220, y: 395 },
        { x: 350, y: 375 },
        { x: 480, y: 390 },
        { x: 610, y: 378 },
        { x: 740, y: 400 },
        { x: 860, y: 382 },
        { x: 960, y: 395 },
        { x: 960, y: H },
      ],
      true,
    );
  }

  /** Road: paper grey strip at y≈455 with white dashed centre line */
  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    // Road surface
    g.fillStyle(0x9a8878, 1);
    g.fillRect(0, 420, W, H - 420);

    // Road edges — slightly darker
    g.fillStyle(0x7a6858, 1);
    g.fillRect(0, 420, W, 4);
    g.fillRect(0, H - 4, W, 4);

    // White dashed centre line
    g.fillStyle(0xffffff, 0.7);
    const dashW = 40;
    const gapW = 30;
    const lineY = 455;
    const lineH = 4;
    for (let x = 0; x < W; x += dashW + gapW) {
      g.fillRect(x, lineY, dashW, lineH);
    }
  }

  // ── HUD (top strip) ──────────────────────────────────────────────────────────

  private buildHUD(): void {
    // Semi-transparent dark overlay strip
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, W, 70);
    overlay.setDepth(10);

    const style = (size: string) => ({
      fontFamily: 'monospace',
      fontSize: size,
      color: '#ffffff',
    });
    const labelStyle = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aaaaaa',
      letterSpacing: 3,
    };

    // ── Speed (left) ────────────────────────────────────────────────────────

    this.add
      .text(160, 14, 'SPEED', labelStyle)
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.hudSpeed = this.add
      .text(160, 28, '--.-', { ...style('26px'), fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.add
      .text(160, 58, 'km/h', labelStyle)
      .setOrigin(0.5, 1)
      .setDepth(11);

    // ── Power (centre, large) ───────────────────────────────────────────────

    this.add
      .text(CX, 14, 'POWER', labelStyle)
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.hudPower = this.add
      .text(CX, 28, '---', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#00f5d4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.add
      .text(CX, 58, 'W', labelStyle)
      .setOrigin(0.5, 1)
      .setDepth(11);

    // ── Cadence (right) ─────────────────────────────────────────────────────

    this.add
      .text(800, 14, 'CADENCE', labelStyle)
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.hudCadence = this.add
      .text(800, 28, '---', { ...style('26px'), fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(11);

    this.add
      .text(800, 58, 'rpm', labelStyle)
      .setOrigin(0.5, 1)
      .setDepth(11);
  }

  // ── Bottom controls ──────────────────────────────────────────────────────────

  private buildBottomControls(): void {
    // Semi-transparent dark strip
    const strip = this.add.graphics();
    strip.fillStyle(0x000000, 0.50);
    strip.fillRect(0, 490, W, 50);
    strip.setDepth(10);

    this.buildStatusIndicator();
    this.buildMockButton();
    this.buildConnectButton();
  }

  private buildStatusIndicator(): void {
    const y = 515;
    this.statusDot = this.add.arc(90, y, 5, 0, 360, false, 0x555566).setDepth(11);
    this.statusLabel = this.add
      .text(102, y, 'DISCONNECTED', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8888aa',
      })
      .setOrigin(0, 0.5)
      .setDepth(11);
  }

  private setStatus(state: 'ok' | 'mock' | 'off' | 'err', label: string): void {
    const colors: Record<string, number> = {
      ok: 0x00ff88,
      mock: 0xffcc00,
      off: 0x555566,
      err: 0xff4444,
    };
    const col = colors[state] ?? 0x555566;
    const hex = '#' + col.toString(16).padStart(6, '0');
    this.statusDot.setFillStyle(col);
    this.statusLabel.setText(label).setColor(hex);
  }

  private buildMockButton(): void {
    const x = 390;
    const y = 515;

    this.btnMock = this.add
      .rectangle(x, y, 160, 34, 0x6b2a6b)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    this.btnMockLabel = this.add
      .text(x, y, 'MOCK MODE: ON', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setDepth(12);

    this.btnMock
      .on('pointerover', () =>
        this.btnMock.setFillStyle(this.isMockMode ? 0xaa3aaa : 0x3a3aaa),
      )
      .on('pointerout', () => this.updateMockButtonStyle())
      .on('pointerdown', () => this.toggleMockMode());
  }

  private buildConnectButton(): void {
    const x = 590;
    const y = 515;

    this.btnConnect = this.add
      .rectangle(x, y, 160, 34, 0x1a6b3a)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    this.add
      .text(x, y, 'BT CONNECT', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setDepth(12);

    this.btnConnect
      .on('pointerover', () => this.btnConnect.setFillStyle(0x25a558))
      .on('pointerout', () => this.btnConnect.setFillStyle(0x1a6b3a))
      .on('pointerdown', () => this.connectReal());
  }

  private updateMockButtonStyle(): void {
    this.btnMock.setFillStyle(this.isMockMode ? 0x6b2a6b : 0x2a2a6b);
    this.btnMockLabel.setText(this.isMockMode ? 'MOCK MODE: ON' : 'MOCK MODE: OFF');
  }

  // ── Mode switching ───────────────────────────────────────────────────────────

  private toggleMockMode(): void {
    this.isMockMode = !this.isMockMode;

    this.trainer.disconnect();

    if (this.isMockMode) {
      this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.setStatus('mock', 'MOCK');
    } else {
      this.trainer = new TrainerService();
      this.trainer.onData((data) => this.handleData(data));
      this.setStatus('off', 'DISCONNECTED');
      this.resetReadouts();
    }

    this.updateMockButtonStyle();
  }

  private connectReal(): void {
    if (this.isMockMode) {
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

  // ── Data handling ────────────────────────────────────────────────────────────

  private handleData(data: Partial<TrainerData>): void {
    if (data.instantaneousPower !== undefined) {
      this.hudPower.setText(String(Math.round(data.instantaneousPower)));
      this.targetVelocityMs = powerToVelocityMs(data.instantaneousPower);
    }
    if (data.instantaneousCadence !== undefined) {
      this.hudCadence.setText(String(Math.round(data.instantaneousCadence)));
    }
  }

  private resetReadouts(): void {
    this.hudPower.setText('---');
    this.hudSpeed.setText('--.-');
    this.hudCadence.setText('---');
    this.targetVelocityMs = 0;
  }
}
