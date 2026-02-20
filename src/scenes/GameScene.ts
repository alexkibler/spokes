/**
 * GameScene.ts
 *
 * Primary Phaser 3 scene for Paper Peloton – Phase 3.
 *
 * Features:
 *   • 3-layer paper-style parallax background (mountains, hills, ground, road)
 *   • Physics-driven velocity: watt output → m/s via CyclistPhysics (grade-aware)
 *   • 5-metric HUD strip: speed, grade, power, distance, cadence
 *   • Scrolling elevation graph strip showing full course with position marker
 *   • Mock Mode toggle and BT Connect buttons in a floating bottom strip
 *   • Bi-directional Bluetooth: grade sent to trainer via FTMS 0x2AD9
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
import {
  powerToVelocityMs,
  msToKmh,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
} from '../physics/CyclistPhysics';
import {
  DEFAULT_COURSE,
  getGradeAtDistance,
  buildElevationSamples,
  type CourseProfile,
  type ElevationSample,
} from '../course/CourseProfile';

// ─── Layout constants ──────────────────────────────────────────────────────────

const W = 960;
const H = 540;
const CX = W / 2;

/** Pixels scrolled per (m/s) of velocity — road layer multiplier */
const WORLD_SCALE = 50; // px/(m/s)

/** Velocity smoothing time constant (higher = faster response) */
const LERP_FACTOR = 1.5;

/** Minimum grade delta before broadcasting to the trainer (avoids BT spam) */
const GRADE_SEND_THRESHOLD = 0.001; // 0.1%

/** Exponential lerp rate for visual grade smoothing (~63% convergence per second) */
const GRADE_LERP_RATE = 1.0;

// ─── Elevation graph layout ───────────────────────────────────────────────────

const ELEV_Y = 415;
const ELEV_H = 75;
const ELEV_PAD_X = 32;
const ELEV_PAD_Y = 8;

// ─── Parallax layer definitions ────────────────────────────────────────────────

interface LayerDef {
  key: string;
  parallax: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // Service reference – swapped when toggling mock mode
  private trainer!: ITrainerService;
  private isMockMode = true;

  // Physics state
  private latestPower = 200;
  private targetVelocityMs = 0;
  private smoothVelocityMs = 0;
  private physicsConfig: PhysicsConfig = { ...DEFAULT_PHYSICS };

  // Course / elevation state
  private course: CourseProfile = DEFAULT_COURSE;
  private distanceM = 0;                // total cumulative distance
  private currentGrade = 0;
  private lastSentGrade = 0;
  private smoothGrade = 0;

  // World container (holds all parallax layers; rotated for grade tilt)
  private worldContainer!: Phaser.GameObjects.Container;

  private elevationSamples: ElevationSample[] = [];
  private minElevM = 0;
  private maxElevM = 0;

  // Parallax layers
  private layerMountains!: Phaser.GameObjects.TileSprite;
  private layerMidHills!: Phaser.GameObjects.TileSprite;
  private layerNearGround!: Phaser.GameObjects.TileSprite;
  private layerRoad!: Phaser.GameObjects.TileSprite;

  // HUD display objects
  private hudSpeed!: Phaser.GameObjects.Text;
  private hudPower!: Phaser.GameObjects.Text;
  private hudCadence!: Phaser.GameObjects.Text;
  private hudGrade!: Phaser.GameObjects.Text;
  private hudDistance!: Phaser.GameObjects.Text;

  // Elevation graph
  private elevationGraphics!: Phaser.GameObjects.Graphics;
  private elevGradeLabel!: Phaser.GameObjects.Text;
  private elevDistLabel!: Phaser.GameObjects.Text;

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

    // Pre-compute elevation samples and range for the graph
    this.elevationSamples = buildElevationSamples(this.course, 100);
    this.minElevM = Math.min(...this.elevationSamples.map((s) => s.elevationM));
    this.maxElevM = Math.max(...this.elevationSamples.map((s) => s.elevationM));

    this.buildParallaxLayers();

    // Pre-seed grade so the world starts already tilted at the correct angle
    this.currentGrade = getGradeAtDistance(this.course, 0);
    this.smoothGrade = this.currentGrade;
    this.physicsConfig = { ...DEFAULT_PHYSICS, grade: this.currentGrade };
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    this.buildHUD();
    this.buildElevationGraph();
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

    // ── Grade from course ────────────────────────────────────────────────────
    this.distanceM += this.smoothVelocityMs * dt;
    const wrappedDist = this.distanceM % this.course.totalDistanceM;
    const newGrade = getGradeAtDistance(this.course, wrappedDist);

    if (newGrade !== this.currentGrade) {
      this.currentGrade = newGrade;
      this.physicsConfig = { ...DEFAULT_PHYSICS, grade: newGrade };
    }

    // Smooth grade: exponential lerp toward current segment grade
    this.smoothGrade += (this.currentGrade - this.smoothGrade) * dt * GRADE_LERP_RATE;

    // Apply rotation + scale compensation to world container
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    const scale = Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02;
    this.worldContainer.setScale(scale);

    // Send smoothGrade to trainer hardware (gated by threshold to avoid BT spam)
    if (
      this.trainer.setGrade &&
      Math.abs(this.smoothGrade - this.lastSentGrade) >= GRADE_SEND_THRESHOLD
    ) {
      this.lastSentGrade = this.smoothGrade;
      void this.trainer.setGrade(this.smoothGrade);
    }

    // ── Physics ─────────────────────────────────────────────────────────────
    this.targetVelocityMs = powerToVelocityMs(this.latestPower, this.physicsConfig);

    // Smooth velocity toward target
    this.smoothVelocityMs +=
      (this.targetVelocityMs - this.smoothVelocityMs) * dt * LERP_FACTOR;

    // ── Parallax scroll ──────────────────────────────────────────────────────
    const baseScroll = this.smoothVelocityMs * WORLD_SCALE * dt;
    this.layerMountains.tilePositionX += baseScroll * 0.10;
    this.layerMidHills.tilePositionX  += baseScroll * 0.30;
    this.layerNearGround.tilePositionX += baseScroll * 0.65;
    this.layerRoad.tilePositionX      += baseScroll * 1.00;

    // ── HUD updates ──────────────────────────────────────────────────────────
    this.hudSpeed.setText(msToKmh(this.smoothVelocityMs).toFixed(1));
    this.updateGradeDisplay(this.currentGrade);
    this.hudDistance.setText((this.distanceM / 1000).toFixed(2));

    // ── Elevation graph ──────────────────────────────────────────────────────
    this.drawElevationGraph(wrappedDist);
  }

  // ── Parallax layers ──────────────────────────────────────────────────────────

  private buildParallaxLayers(): void {
    // Container centred at screen midpoint so rotation tilts the world naturally
    this.worldContainer = this.add.container(W / 2, H / 2).setDepth(0);

    const layers: LayerDef[] = [
      {
        key: 'mountains',
        parallax: 0.10,
        draw: (g) => this.drawMountains(g),
      },
      {
        key: 'midHills',
        parallax: 0.30,
        draw: (g) => this.drawMidHills(g),
      },
      {
        key: 'nearGround',
        parallax: 0.65,
        draw: (g) => this.drawNearGround(g),
      },
      {
        key: 'road',
        parallax: 1.00,
        draw: (g) => this.drawRoad(g),
      },
    ];

    for (const layer of layers) {
      const g = this.add.graphics();
      layer.draw(g);
      g.generateTexture(layer.key, W, H);
      g.destroy();

      // Position at (-W/2, -H/2) so the top-left corner aligns with the world origin
      const sprite = this.add
        .tileSprite(-W / 2, -H / 2, W, H, layer.key)
        .setOrigin(0, 0);

      this.worldContainer.add(sprite);

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
    g.fillStyle(0x9a8878, 1);
    g.fillRect(0, 420, W, H - 420);

    g.fillStyle(0x7a6858, 1);
    g.fillRect(0, 420, W, 4);
    g.fillRect(0, H - 4, W, 4);

    g.fillStyle(0xffffff, 0.7);
    const dashW = 40;
    const gapW = 30;
    const lineY = 455;
    const lineH = 4;
    for (let x = 0; x < W; x += dashW + gapW) {
      g.fillRect(x, lineY, dashW, lineH);
    }
  }

  // ── HUD (top strip – 5 metrics) ───────────────────────────────────────────

  private buildHUD(): void {
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, W, 70);
    overlay.setDepth(10);

    // Vertical separators between metrics
    overlay.fillStyle(0x444455, 1);
    for (const sepX of [192, 384, 576, 768]) {
      overlay.fillRect(sepX, 8, 1, 54);
    }

    const valueBig = (colour = '#ffffff') => ({
      fontFamily: 'monospace',
      fontSize: '26px',
      color: colour,
      fontStyle: 'bold',
    });
    const label = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aaaaaa',
      letterSpacing: 3,
    };
    const unit = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aaaaaa',
      letterSpacing: 3,
    };

    // ── Speed  x=96 ─────────────────────────────────────────────────────────
    this.add.text(96,  14, 'SPEED',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudSpeed = this.add
      .text(96, 28, '--.-', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add.text(96,  58, 'km/h',    unit).setOrigin(0.5, 1).setDepth(11);

    // ── Grade  x=288 ────────────────────────────────────────────────────────
    this.add.text(288, 14, 'GRADE',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudGrade = this.add
      .text(288, 28, '0.0%', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    // (unit label intentionally omitted – % is in the value)

    // ── Power  x=CX=480 (large, accent colour) ───────────────────────────────
    this.add.text(CX,  14, 'POWER',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudPower = this.add
      .text(CX, 26, '---', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#00f5d4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add.text(CX,  58, 'W',       unit).setOrigin(0.5, 1).setDepth(11);

    // ── Distance  x=672 ─────────────────────────────────────────────────────
    this.add.text(672, 14, 'DIST',    label).setOrigin(0.5, 0).setDepth(11);
    this.hudDistance = this.add
      .text(672, 28, '0.00', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add.text(672, 58, 'km',      unit).setOrigin(0.5, 1).setDepth(11);

    // ── Cadence  x=864 ──────────────────────────────────────────────────────
    this.add.text(864, 14, 'CADENCE', label).setOrigin(0.5, 0).setDepth(11);
    this.hudCadence = this.add
      .text(864, 28, '---', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add.text(864, 58, 'rpm',     unit).setOrigin(0.5, 1).setDepth(11);
  }

  // ── Elevation graph ───────────────────────────────────────────────────────

  private buildElevationGraph(): void {
    // Static background strip
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.45);
    bg.fillRect(0, ELEV_Y, W, ELEV_H);
    bg.setDepth(10);

    // "ELEV" label (top-left of strip)
    this.add
      .text(ELEV_PAD_X, ELEV_Y + 5, 'ELEV', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888899',
        letterSpacing: 2,
      })
      .setDepth(12);

    // Dynamic graphics redrawn every frame
    this.elevationGraphics = this.add.graphics().setDepth(11);

    // Grade and distance labels (updated in update())
    this.elevGradeLabel = this.add
      .text(W - ELEV_PAD_X, ELEV_Y + 5, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0)
      .setDepth(12);

    this.elevDistLabel = this.add
      .text(W - ELEV_PAD_X, ELEV_Y + ELEV_H - 6, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888899',
      })
      .setOrigin(1, 1)
      .setDepth(12);
  }

  private drawElevationGraph(currentDistM: number): void {
    const g = this.elevationGraphics;
    g.clear();

    const samples = this.elevationSamples;
    const totalDist = this.course.totalDistanceM;
    const elevRange = (this.maxElevM - this.minElevM) || 1;

    const drawW = W - 2 * ELEV_PAD_X;
    const drawH = ELEV_H - 2 * ELEV_PAD_Y;
    const ox = ELEV_PAD_X;
    const oy = ELEV_Y + ELEV_PAD_Y;

    const toX = (d: number) => ox + (d / totalDist) * drawW;
    const toY = (e: number) => oy + drawH - ((e - this.minElevM) / elevRange) * drawH;

    // Filled elevation polygon
    g.fillStyle(0xb8aa96, 0.55);
    const points: Phaser.Types.Math.Vector2Like[] = [
      { x: toX(0),         y: oy + drawH },
      ...samples.map((s) => ({ x: toX(s.distanceM), y: toY(s.elevationM) })),
      { x: toX(totalDist), y: oy + drawH },
    ];
    g.fillPoints(points, true);

    // Outline
    g.lineStyle(1, 0x7a6858, 0.8);
    g.beginPath();
    samples.forEach((s, i) => {
      const px = toX(s.distanceM);
      const py = toY(s.elevationM);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.strokePath();

    // Completed-distance fill (slightly brighter tint)
    g.fillStyle(0x00f5d4, 0.12);
    const completedPoints: Phaser.Types.Math.Vector2Like[] = [
      { x: toX(0),            y: oy + drawH },
      ...samples
        .filter((s) => s.distanceM <= currentDistM)
        .map((s) => ({ x: toX(s.distanceM), y: toY(s.elevationM) })),
      { x: toX(currentDistM), y: oy + drawH },
    ];
    if (completedPoints.length > 2) {
      g.fillPoints(completedPoints, true);
    }

    // Position marker – vertical teal line
    const mx = toX(currentDistM);
    g.lineStyle(2, 0x00f5d4, 1);
    g.beginPath();
    g.moveTo(mx, oy);
    g.lineTo(mx, oy + drawH);
    g.strokePath();

    // Small triangle marker at bottom
    g.fillStyle(0x00f5d4, 1);
    g.fillTriangle(mx - 4, oy + drawH + 2, mx + 4, oy + drawH + 2, mx, oy + drawH - 4);

    // Update text labels
    const gradeSign = this.currentGrade >= 0 ? '+' : '';
    this.elevGradeLabel.setText(`${gradeSign}${(this.currentGrade * 100).toFixed(1)}%`);
    this.elevGradeLabel.setColor(this.gradeColour(this.currentGrade));

    const lapKm = (currentDistM / 1000).toFixed(1);
    const totalKm = (totalDist / 1000).toFixed(1);
    this.elevDistLabel.setText(`${lapKm} / ${totalKm} km`);
  }

  // ── Bottom controls ───────────────────────────────────────────────────────

  private buildBottomControls(): void {
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
      ok:   0x00ff88,
      mock: 0xffcc00,
      off:  0x555566,
      err:  0xff4444,
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

  // ── Mode switching ────────────────────────────────────────────────────────

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
        // Sync smooth grade to the trainer immediately on connect
        if (this.trainer.setGrade) {
          void this.trainer.setGrade(this.smoothGrade);
          this.lastSentGrade = this.smoothGrade;
        }
      })
      .catch((err: unknown) => {
        console.error('[GameScene] Bluetooth connect failed:', err);
        this.setStatus('err', 'CONNECT FAILED');
      });
  }

  // ── Data handling ─────────────────────────────────────────────────────────

  private handleData(data: Partial<TrainerData>): void {
    if (data.instantaneousPower !== undefined) {
      this.latestPower = data.instantaneousPower;
      this.hudPower.setText(String(Math.round(data.instantaneousPower)));
    }
    if (data.instantaneousCadence !== undefined) {
      this.hudCadence.setText(String(Math.round(data.instantaneousCadence)));
    }
  }

  private resetReadouts(): void {
    this.hudPower.setText('---');
    this.hudSpeed.setText('--.-');
    this.hudCadence.setText('---');
    this.hudGrade.setText('0.0%');
    this.hudDistance.setText('0.00');
    this.latestPower = 0;
    this.targetVelocityMs = 0;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private updateGradeDisplay(grade: number): void {
    const sign = grade >= 0 ? '+' : '';
    this.hudGrade
      .setText(`${sign}${(grade * 100).toFixed(1)}%`)
      .setColor(this.gradeColour(grade));
  }

  /** Returns a hex colour string based on road grade for visual feedback. */
  private gradeColour(grade: number): string {
    if (grade > 0.08) return '#ff5555'; // steep climb  → red
    if (grade > 0.04) return '#ffaa00'; // moderate     → orange
    if (grade > 0.005) return '#ffffff'; // gentle       → white
    if (grade > -0.005) return '#aaaaaa'; // flat        → grey
    return '#55aaff';                      // descent     → blue
  }
}
