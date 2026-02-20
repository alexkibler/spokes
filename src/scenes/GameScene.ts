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
  calculateAcceleration,
  powerToVelocityMs,
  msToKmh,
  msToMph,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
} from '../physics/CyclistPhysics';
import type { Units } from './MenuScene';
import {
  DEFAULT_COURSE,
  getGradeAtDistance,
  buildElevationSamples,
  type CourseProfile,
  type ElevationSample,
} from '../course/CourseProfile';

// ─── Effect / powerup types ───────────────────────────────────────────────────

type EffectType = 'headwind' | 'tailwind';

interface ActiveEffect {
  type: EffectType;
}

const EFFECT_META: Record<EffectType, {
  label: string;
  multiplier: number;
  color: number;
  hexColor: string;
}> = {
  headwind: { label: 'HEADWIND', multiplier: 0.5, color: 0xff5544, hexColor: '#ff5544' },
  tailwind: { label: 'TAILWIND', multiplier: 2,   color: 0xffcc00, hexColor: '#ffcc00' },
};

// ─── IK helper ────────────────────────────────────────────────────────────────

/**
 * Computes the knee joint position for a two-bone leg chain.
 * kneeSide = -1 bends the knee forward (toward the front wheel), which is
 * correct for both legs on a forward-facing cyclist.
 */
function computeKnee(
  hipX: number, hipY: number,
  footX: number, footY: number,
  upperLen: number, lowerLen: number,
  kneeSide: 1 | -1,
): [number, number] {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const dist = Math.hypot(dx, dy);
  const total = upperLen + lowerLen;

  if (dist >= total - 0.01) {
    // Fully extended – place knee proportionally along the line
    const t = upperLen / total;
    return [hipX + dx * t, hipY + dy * t];
  }

  // Law of cosines: angle at the hip
  const cosA = (dist * dist + upperLen * upperLen - lowerLen * lowerLen)
    / (2 * dist * upperLen);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const kneeAngle = Math.atan2(dy, dx) + kneeSide * angleA;

  return [
    hipX + Math.cos(kneeAngle) * upperLen,
    hipY + Math.sin(kneeAngle) * upperLen,
  ];
}

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
  // Unit preference passed from MenuScene
  private units: Units = 'imperial';

  // Service reference – swapped when toggling demo mode
  private trainer!: ITrainerService;
  private isDemoMode = true;

  // Physics state
  private latestPower = 200;
  private targetVelocityMs = 0;
  private smoothVelocityMs = 0;
  /** Base config (mass + aero constants) – grade is layered on top each frame. */
  private basePhysics: PhysicsConfig = { ...DEFAULT_PHYSICS };
  private physicsConfig: PhysicsConfig = { ...DEFAULT_PHYSICS };

  // Course / elevation state
  private course: CourseProfile = DEFAULT_COURSE;
  private distanceM = 0;                // total cumulative distance
  private currentGrade = 0;
  private lastSentGrade = 0;
  private smoothGrade = 0;

  // World container (holds all parallax layers; rotated for grade tilt)
  private worldContainer!: Phaser.GameObjects.Container;

  // Cyclist animation
  private cyclistGraphics!: Phaser.GameObjects.Graphics;
  private crankAngle = 0;
  private cadenceHistory: Array<{ rpm: number; timeMs: number }> = [];
  private avgCadence = 0;

  // Effect / powerup state
  private activeEffect: ActiveEffect | null = null;
  private rawPower     = 200; // unmodified power from trainer

  // Effect indicator UI (unused or repurposed for status)
  private effectContainer!:   Phaser.GameObjects.Container;
  private effectArcGraphics!: Phaser.GameObjects.Graphics;
  private effectNameText!:    Phaser.GameObjects.Text;
  private effectSecsText!:    Phaser.GameObjects.Text;

  // Manual effect buttons
  private btnHeadwind!: Phaser.GameObjects.Rectangle;
  private btnTailwind!: Phaser.GameObjects.Rectangle;

  // Notification banner UI
  private notifContainer!: Phaser.GameObjects.Container;
  private notifTitle!:     Phaser.GameObjects.Text;
  private notifSub!:       Phaser.GameObjects.Text;
  private notifTween:      Phaser.Tweens.Tween | null = null;

  // Extra power HUD elements
  private hudRealPower!: Phaser.GameObjects.Text;
  private hudPowerUnit!: Phaser.GameObjects.Text;

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
  private btnDemo!: Phaser.GameObjects.Rectangle;
  private btnDemoLabel!: Phaser.GameObjects.Text;
  private btnConnect!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  init(data?: { course?: CourseProfile; weightKg?: number; units?: Units }): void {
    // Accept a generated course, rider weight, and unit preference from MenuScene
    this.course = data?.course ?? DEFAULT_COURSE;
    this.units  = data?.units  ?? 'imperial';

    // Bike weight is fixed; rider weight comes from the menu (default 75 kg)
    const massKg = (data?.weightKg ?? 75) + 8; // +8 kg for the bike
    this.basePhysics = { ...DEFAULT_PHYSICS, massKg };

    // Reset per-ride state so restarts start fresh
    this.distanceM        = 0;
    this.smoothVelocityMs = 0;
    this.targetVelocityMs = 0;
    this.currentGrade     = 0;
    this.smoothGrade      = 0;
    this.lastSentGrade    = 0;
    this.latestPower      = 200;
    this.crankAngle       = 0;
    this.cadenceHistory   = [];
    this.avgCadence       = 0;
    this.rawPower         = 200;
    this.activeEffect     = null;
    this.physicsConfig    = { ...this.basePhysics };
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#e8dcc8');

    // Pre-compute elevation samples and range for the graph
    this.elevationSamples = buildElevationSamples(this.course, 100);
    this.minElevM = Math.min(...this.elevationSamples.map((s) => s.elevationM));
    this.maxElevM = Math.max(...this.elevationSamples.map((s) => s.elevationM));

    this.buildParallaxLayers();
    this.buildCyclist();

    // Pre-seed grade so the world starts already tilted at the correct angle
    this.currentGrade = getGradeAtDistance(this.course, 0);
    this.smoothGrade = this.currentGrade;
    this.physicsConfig = { ...this.basePhysics, grade: this.currentGrade };
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    this.buildHUD();
    this.buildElevationGraph();
    this.buildBottomControls();
    this.buildEffectUI();
    this.buildManualEffectButtons();

    // Start in demo mode with 200 W so the world scrolls immediately
    this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
    this.trainer.onData((data) => this.handleData(data));
    void this.trainer.connect();
    this.updateDemoButtonStyle();
    this.setStatus('demo', 'DEMO');
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000; // seconds

    // ── Grade from course ────────────────────────────────────────────────────
    this.distanceM += this.smoothVelocityMs * dt;
    const wrappedDist = this.distanceM % this.course.totalDistanceM;
    const newGrade = getGradeAtDistance(this.course, wrappedDist);

    if (newGrade !== this.currentGrade) {
      this.currentGrade = newGrade;
      this.physicsConfig = { ...this.basePhysics, grade: newGrade };
      // In demo mode, randomise power & cadence each time a new segment begins
      if (this.isDemoMode) this.randomizeDemoMetrics();
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
    if (this.units === 'imperial') {
      this.hudSpeed.setText(msToMph(this.smoothVelocityMs).toFixed(1));
      this.hudDistance.setText((this.distanceM / 1609.344).toFixed(2));
    } else {
      this.hudSpeed.setText(msToKmh(this.smoothVelocityMs).toFixed(1));
      this.hudDistance.setText((this.distanceM / 1000).toFixed(2));
    }
    this.updateGradeDisplay(this.currentGrade);

    // ── Cyclist animation ────────────────────────────────────────────────────
    // Average cadence over rolling 3-second window
    const now = Date.now();
    const recent = this.cadenceHistory.filter((h) => now - h.timeMs <= 3000);
    if (recent.length > 0) {
      this.avgCadence = recent.reduce((sum, h) => sum + h.rpm, 0) / recent.length;
    }
    // Advance crank: avgCadence rpm → revolutions per second → radians per second
    this.crankAngle += (this.avgCadence / 60) * 2 * Math.PI * dt;
    this.drawCyclist();

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

  // ── Cyclist ───────────────────────────────────────────────────────────────

  /**
   * Road surface in worldContainer space:
   *   worldContainer origin = screen (480, 270)
   *   road top drawn at screen y=420 → container y = 420 − 270 = 150
   */
  private static readonly CYC_GROUND_Y = 150;
  private static readonly WHEEL_R      = 18;

  private buildCyclist(): void {
    // Add AFTER all parallax layers so the cyclist renders on top
    this.cyclistGraphics = this.add.graphics();
    this.worldContainer.add(this.cyclistGraphics);
  }

  private drawCyclist(): void {
    const g  = this.cyclistGraphics;
    g.clear();

    const gY   = GameScene.CYC_GROUND_Y;
    const wR   = GameScene.WHEEL_R;
    const axleY = gY - wR;  // = 132 in container space

    // ── Key bike coordinates (worldContainer space, x=0 is screen centre) ──
    const rearX   = -22;     // rear axle x
    const frontX  =  26;     // front axle x
    const crankX  =   0;     // bottom bracket x
    const crankY  = axleY;   // bottom bracket at axle height
    const crankLen =  9;     // crank arm length (px)

    // Frame geometry
    const seatX  = -5;  const seatY  = axleY - 35;  // saddle top
    const hbarX  = 22;  const hbarY  = axleY - 33;  // handlebar grip

    // Rider body
    const hipX      = -2;  const hipY      = axleY - 30;  // hip joint
    const shoulderX = 14;  const shoulderY = axleY - 43;  // shoulder
    const headX     = 22;  const headY     = axleY - 53;  // head centre
    const headR     =  7;

    // Leg segment lengths
    const upperLen = 22;
    const lowerLen = 19;

    // ── Foot positions (pedal endpoints rotate with crankAngle) ─────────────
    const rA  = this.crankAngle;
    const lA  = this.crankAngle + Math.PI;
    const rFX = crankX + Math.cos(rA) * crankLen;
    const rFY = crankY + Math.sin(rA) * crankLen;
    const lFX = crankX + Math.cos(lA) * crankLen;
    const lFY = crankY + Math.sin(lA) * crankLen;

    // ── Knee positions via two-bone IK ───────────────────────────────────────
    // Both knees always bend forward (toward the front wheel) — legs are
    // 180° out of phase but the hinge direction is the same for both.
    const [rKX, rKY] = computeKnee(hipX, hipY, rFX, rFY, upperLen, lowerLen, -1);
    const [lKX, lKY] = computeKnee(hipX, hipY, lFX, lFY, upperLen, lowerLen, -1);

    // ── Palette (paper-cutout aesthetic matching the game) ───────────────────
    const BIKE   = 0x2a2018;   // charcoal for frame & wheels
    const JERSEY = 0x5a3a1a;   // dark kraft brown for torso & helmet
    const SKIN   = 0xc49a6a;   // warm paper tone for head & arms

    // ════════════════════════════════════════════════════════════════════════
    // Draw order: far leg → wheels/frame → near leg → body → head
    // ════════════════════════════════════════════════════════════════════════

    // ── Far leg (left, behind bike) ──────────────────────────────────────────
    g.lineStyle(4, BIKE, 0.38);
    g.beginPath();
    g.moveTo(hipX, hipY);
    g.lineTo(lKX, lKY);
    g.lineTo(lFX, lFY);
    g.strokePath();
    g.fillStyle(BIKE, 0.38);
    g.fillRect(lFX - 5, lFY - 1.5, 10, 3);  // far pedal

    // ── Rear wheel ───────────────────────────────────────────────────────────
    g.lineStyle(3, BIKE, 1);
    g.strokeCircle(rearX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45);
    g.strokeCircle(rearX, axleY, wR * 0.55);  // inner rim
    g.fillStyle(BIKE, 1);
    g.fillCircle(rearX, axleY, 2.5);           // hub

    // ── Frame ────────────────────────────────────────────────────────────────
    g.lineStyle(3, BIKE, 1);
    // Chain stay: rear axle → bottom bracket
    g.beginPath(); g.moveTo(rearX, axleY); g.lineTo(crankX, crankY + 2); g.strokePath();
    // Seat tube: BB → saddle
    g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(seatX, seatY); g.strokePath();
    // Top tube: saddle → handlebars
    g.beginPath(); g.moveTo(seatX, seatY); g.lineTo(hbarX, hbarY); g.strokePath();
    // Down tube: head-tube area → BB
    g.beginPath(); g.moveTo(hbarX - 2, hbarY + 8); g.lineTo(crankX, crankY); g.strokePath();
    // Fork: handlebars → front axle
    g.beginPath(); g.moveTo(hbarX, hbarY); g.lineTo(frontX, axleY); g.strokePath();
    // Saddle rail
    g.lineStyle(4, BIKE, 1);
    g.beginPath(); g.moveTo(seatX - 6, seatY); g.lineTo(seatX + 8, seatY); g.strokePath();

    // ── Front wheel ──────────────────────────────────────────────────────────
    g.lineStyle(3, BIKE, 1);
    g.strokeCircle(frontX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45);
    g.strokeCircle(frontX, axleY, wR * 0.55);
    g.fillStyle(BIKE, 1);
    g.fillCircle(frontX, axleY, 2.5);

    // ── Crank arms ───────────────────────────────────────────────────────────
    g.lineStyle(3, BIKE, 1);
    g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(rFX, rFY); g.strokePath();
    g.lineStyle(2.5, BIKE, 0.5);
    g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(lFX, lFY); g.strokePath();
    // Chainring
    g.lineStyle(2, BIKE, 0.7);
    g.strokeCircle(crankX, crankY, 6);

    // ── Near leg (right, in front of bike) ───────────────────────────────────
    g.lineStyle(5, BIKE, 1);
    g.beginPath();
    g.moveTo(hipX, hipY);
    g.lineTo(rKX, rKY);
    g.lineTo(rFX, rFY);
    g.strokePath();
    g.fillStyle(BIKE, 1);
    g.fillRect(rFX - 5, rFY - 1.5, 10, 3);  // near pedal

    // ── Rider body ───────────────────────────────────────────────────────────
    // Torso (filled quad)
    g.fillStyle(JERSEY, 1);
    g.fillPoints([
      { x: hipX - 2,      y: hipY },
      { x: hipX + 5,      y: hipY - 2 },
      { x: shoulderX,     y: shoulderY },
      { x: shoulderX - 5, y: shoulderY + 4 },
    ], true);

    // Arms reaching to handlebars
    g.lineStyle(3, SKIN, 1);
    g.beginPath();
    g.moveTo(shoulderX - 1, shoulderY + 2);
    g.lineTo(hbarX, hbarY + 1);
    g.strokePath();

    // Head
    g.fillStyle(SKIN, 1);
    g.fillCircle(headX, headY, headR);

    // Helmet cap
    g.fillStyle(JERSEY, 1);
    g.fillPoints([
      { x: headX - headR + 1, y: headY },
      { x: headX - headR + 1, y: headY - headR * 0.5 },
      { x: headX,             y: headY - headR - 2 },
      { x: headX + headR,     y: headY - headR * 0.5 },
      { x: headX + headR,     y: headY },
    ], true);
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
    this.add.text(96,   7, 'SPEED',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudSpeed = this.add
      .text(96, 19, '--.-', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add
      .text(96, 64, this.units === 'imperial' ? 'mph' : 'km/h', unit)
      .setOrigin(0.5, 1)
      .setDepth(11);

    // ── Grade  x=288 ────────────────────────────────────────────────────────
    this.add.text(288,  7, 'GRADE',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudGrade = this.add
      .text(288, 19, '0.0%', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    // (unit label intentionally omitted – % is in the value)

    // ── Power  x=CX=480 (large, accent colour) ───────────────────────────────
    this.add.text(CX,  7, 'POWER',   label).setOrigin(0.5, 0).setDepth(11);
    this.hudPower = this.add
      .text(CX, 19, '---', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#00f5d4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    // "W" unit — hidden when the raw-power label is shown
    this.hudPowerUnit = this.add
      .text(CX, 64, 'W', unit)
      .setOrigin(0.5, 1)
      .setDepth(11);
    // Raw power label (visible only when an effect is active)
    this.hudRealPower = this.add
      .text(CX, 64, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888888',
      })
      .setOrigin(0.5, 1)
      .setDepth(11)
      .setAlpha(0);

    // ── Distance  x=672 ─────────────────────────────────────────────────────
    this.add.text(672,  7, 'DIST',    label).setOrigin(0.5, 0).setDepth(11);
    this.hudDistance = this.add
      .text(672, 19, '0.00', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add
      .text(672, 64, this.units === 'imperial' ? 'mi' : 'km', unit)
      .setOrigin(0.5, 1)
      .setDepth(11);

    // ── Cadence  x=864 ──────────────────────────────────────────────────────
    this.add.text(864,  7, 'CADENCE', label).setOrigin(0.5, 0).setDepth(11);
    this.hudCadence = this.add
      .text(864, 19, '---', valueBig())
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.add.text(864, 64, 'rpm',     unit).setOrigin(0.5, 1).setDepth(11);
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

    let lapLabel: string;
    let totalLabel: string;
    if (this.units === 'imperial') {
      lapLabel   = `${(currentDistM / 1609.344).toFixed(1)} mi`;
      totalLabel = `${(totalDist    / 1609.344).toFixed(1)} mi`;
    } else {
      lapLabel   = `${(currentDistM / 1000).toFixed(1)} km`;
      totalLabel = `${(totalDist    / 1000).toFixed(1)} km`;
    }
    this.elevDistLabel.setText(`${lapLabel} / ${totalLabel}`);
  }

  // ── Bottom controls ───────────────────────────────────────────────────────

  private buildBottomControls(): void {
    const strip = this.add.graphics();
    strip.fillStyle(0x000000, 0.50);
    strip.fillRect(0, 490, W, 50);
    strip.setDepth(10);

    this.buildStatusIndicator();
    this.buildDemoButton();
    this.buildConnectButton();
    this.buildMenuButton();
  }

  private buildStatusIndicator(): void {
    const y = 515;
    this.statusDot = this.add.arc(56, y, 5, 0, 360, false, 0x555566).setDepth(11);
    this.statusLabel = this.add
      .text(68, y, 'DISCONNECTED', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8888aa',
      })
      .setOrigin(0, 0.5)
      .setDepth(11);
  }

  private setStatus(state: 'ok' | 'demo' | 'off' | 'err', label: string): void {
    const colors: Record<string, number> = {
      ok:   0x00ff88,
      demo: 0xffcc00,
      off:  0x555566,
      err:  0xff4444,
    };
    const col = colors[state] ?? 0x555566;
    const hex = '#' + col.toString(16).padStart(6, '0');
    this.statusDot.setFillStyle(col);
    this.statusLabel.setText(label).setColor(hex);
  }

  private buildDemoButton(): void {
    const x = 370;
    const y = 515;

    this.btnDemo = this.add
      .rectangle(x, y, 150, 34, 0x6b2a6b)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    this.btnDemoLabel = this.add
      .text(x, y, 'DEMO MODE: ON', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setDepth(12);

    this.btnDemo
      .on('pointerover', () =>
        this.btnDemo.setFillStyle(this.isDemoMode ? 0xaa3aaa : 0x3a3aaa),
      )
      .on('pointerout', () => this.updateDemoButtonStyle())
      .on('pointerdown', () => this.toggleDemoMode());
  }

  private buildConnectButton(): void {
    const x = 560;
    const y = 515;

    this.btnConnect = this.add
      .rectangle(x, y, 150, 34, 0x1a6b3a)
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

  private buildMenuButton(): void {
    const x = 750;
    const y = 515;

    const btn = this.add
      .rectangle(x, y, 120, 34, 0x3a3a5a)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    this.add
      .text(x, y, '← MENU', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaacc',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setDepth(12);

    btn
      .on('pointerover', () => btn.setFillStyle(0x5555aa))
      .on('pointerout',  () => btn.setFillStyle(0x3a3a5a))
      .on('pointerdown', () => {
        this.trainer.disconnect();
        this.scene.start('MenuScene');
      });
  }

  private updateDemoButtonStyle(): void {
    this.btnDemo.setFillStyle(this.isDemoMode ? 0x6b2a6b : 0x2a2a6b);
    this.btnDemoLabel.setText(this.isDemoMode ? 'DEMO MODE: ON' : 'DEMO MODE: OFF');
  }

  // ── Mode switching ────────────────────────────────────────────────────────

  private toggleDemoMode(): void {
    this.isDemoMode = !this.isDemoMode;

    this.trainer.disconnect();

    if (this.isDemoMode) {
      this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.setStatus('demo', 'DEMO');
    } else {
      this.trainer = new TrainerService();
      this.trainer.onData((data) => this.handleData(data));
      this.setStatus('off', 'DISCONNECTED');
      this.resetReadouts();
    }

    this.updateDemoButtonStyle();
  }

  private connectReal(): void {
    if (this.isDemoMode) {
      this.isDemoMode = false;
      this.trainer.disconnect();
      this.trainer = new TrainerService();
      this.trainer.onData((data) => this.handleData(data));
      this.updateDemoButtonStyle();
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
      this.rawPower = data.instantaneousPower;
      this.updatePowerDisplay();
    }
    if (data.instantaneousCadence !== undefined) {
      this.hudCadence.setText(String(Math.round(data.instantaneousCadence)));
      // Track rolling cadence history for the pedaling animation
      const ts = Date.now();
      this.cadenceHistory.push({ rpm: data.instantaneousCadence, timeMs: ts });
      // Trim entries older than 5 seconds (keeps the array small)
      const cutoff = ts - 5000;
      this.cadenceHistory = this.cadenceHistory.filter((h) => h.timeMs > cutoff);
    }
  }

  private resetReadouts(): void {
    this.hudPower.setText('---').setColor('#00f5d4');
    this.hudRealPower.setAlpha(0);
    this.hudPowerUnit.setAlpha(1);
    this.hudSpeed.setText('--.-');
    this.hudCadence.setText('---');
    this.hudGrade.setText('0.0%');
    this.hudDistance.setText('0.00');
    this.rawPower        = 0;
    this.latestPower     = 0;
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

  /**
   * In demo mode, assign fresh random power (150–350 W) and cadence (70–110 rpm)
   * at the start of each new course segment so the metrics feel dynamic.
   */
  private randomizeDemoMetrics(): void {
    if (this.trainer instanceof MockTrainerService) {
      const power   = Math.round(150 + Math.random() * 200); // 150–350 W
      const cadence = Math.round(70  + Math.random() * 40);  // 70–110 rpm
      this.trainer.setPower(power);
      this.trainer.setCadence(cadence);
    }
  }

  // ── Effect / powerup system ───────────────────────────────────────────────

  private buildManualEffectButtons(): void {
    const x = 860;
    const yHead = 120;
    const yTail = 170;

    this.btnHeadwind = this.add
      .rectangle(x, yHead, 100, 34, 0x444444)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    this.add
      .text(x, yHead, 'HEADWIND', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(16);

    this.btnTailwind = this.add
      .rectangle(x, yTail, 100, 34, 0x444444)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);
    this.add
      .text(x, yTail, 'TAILWIND', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(16);

    this.btnHeadwind.on('pointerdown', () => this.toggleEffect('headwind'));
    this.btnTailwind.on('pointerdown', () => this.toggleEffect('tailwind'));

    this.updateEffectButtonStyles();
  }

  private toggleEffect(type: EffectType): void {
    if (this.activeEffect?.type === type) {
      this.clearEffect();
    } else {
      this.triggerEffect(type);
    }
    this.updateEffectButtonStyles();
  }

  private updateEffectButtonStyles(): void {
    const isHead = this.activeEffect?.type === 'headwind';
    const isTail = this.activeEffect?.type === 'tailwind';

    this.btnHeadwind.setFillStyle(isHead ? 0xff5544 : 0x444444);
    this.btnTailwind.setFillStyle(isTail ? 0xffcc00 : 0x444444);
  }

  private buildEffectUI(): void {
    // Keep container for text/notification, but arc logic is removed
    const cx = 860;
    const cy = 230; // Move down a bit

    this.effectContainer = this.add.container(cx, cy).setDepth(15).setAlpha(0);

    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x000000, 0.65);
    bgGfx.fillCircle(0, 0, 42);
    this.effectContainer.add(bgGfx);

    this.effectNameText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    this.effectContainer.add(this.effectNameText);

    // ── Notification banner ─────────────────────────────────────────────────
    this.notifContainer = this.add.container(W / 2, 200).setDepth(20).setAlpha(0);

    const notifBg = this.add.graphics();
    notifBg.fillStyle(0x000000, 0.80);
    notifBg.fillRect(-175, -38, 350, 76);
    this.notifContainer.add(notifBg);

    this.notifTitle = this.add
      .text(0, -12, '', {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    this.notifContainer.add(this.notifTitle);

    this.notifSub = this.add
      .text(0, 18, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#cccccc',
        align: 'center',
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    this.notifContainer.add(this.notifSub);
  }

  private triggerEffect(type: EffectType): void {
    const meta = EFFECT_META[type];

    this.activeEffect = { type };

    // Show indicator
    this.effectContainer.setAlpha(1);
    this.effectNameText
      .setText(type === 'headwind' ? 'ACTIVE:\nHEADWIND' : 'ACTIVE:\nTAILWIND')
      .setColor(meta.hexColor);

    // Show notification banner
    this.notifTitle.setText(meta.label + '!').setColor(meta.hexColor);
    this.notifSub.setText(`x${meta.multiplier} POWER MULTIPLIER`);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.tweens.add({
      targets: this.notifContainer,
      alpha: 0,
      delay: 2000,
      duration: 500,
      ease: 'Power2',
    });

    this.updatePowerDisplay();
  }

  private clearEffect(): void {
    this.activeEffect = null;
    this.effectContainer.setAlpha(0);
    this.updatePowerDisplay();
  }

  private updateEffectTick(_delta: number): void {
    // No-op for manual mode
  }

  private drawEffectArc(): void {
    // No-op for manual mode
  }

  private updatePowerDisplay(): void {
    const multiplier = this.activeEffect ? EFFECT_META[this.activeEffect.type].multiplier : 1;
    const net        = Math.round(this.rawPower * multiplier);
    this.latestPower = net;

    if (this.activeEffect) {
      const meta = EFFECT_META[this.activeEffect.type];
      this.hudPower.setText(String(net)).setColor(meta.hexColor);
      this.hudPowerUnit.setAlpha(0);
      this.hudRealPower.setText(`raw: ${Math.round(this.rawPower)}W`).setAlpha(1);
    } else {
      this.hudPower.setText(String(net)).setColor('#00f5d4');
      this.hudPowerUnit.setAlpha(1);
      this.hudRealPower.setAlpha(0);
    }
  }

  shutdown(): void {
    this.trainer?.disconnect();
  }
}
