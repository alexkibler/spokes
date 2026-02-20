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
import { FitWriter } from '../fit/FitWriter';
import type { RideRecord } from '../fit/FitWriter';
import type { ITrainerService, TrainerData } from '../services/ITrainerService';
import { MockTrainerService } from '../services/MockTrainerService';
import { HeartRateService } from '../services/HeartRateService';
import type { HeartRateData } from '../services/HeartRateService';
import {
  calculateAcceleration,
  msToKmh,
  msToMph,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
} from '../physics/CyclistPhysics';
import type { Units } from './MenuScene';
import {
  DEFAULT_COURSE,
  getGradeAtDistance,
  getSurfaceAtDistance,
  getCrrForSurface,
  buildElevationSamples,
  type CourseProfile,
  type ElevationSample,
  type SurfaceType,
} from '../course/CourseProfile';

// ─── Effect / powerup types ───────────────────────────────────────────────────

type EffectType = 'headwind' | 'tailwind';

interface ActiveEffect {
  type: EffectType;
}

/** Fill colours for each surface type on the elevation graph. */
const SURFACE_FILL_COLORS: Record<SurfaceType, number> = {
  asphalt: 0x7799bb,  // steel blue-grey
  gravel:  0xddaa22,  // golden amber
  dirt:    0xcc5522,  // terracotta
  mud:     0x449933,  // forest green
};

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

/** Pixels scrolled per (m/s) of velocity — road layer multiplier */
const WORLD_SCALE = 50; // px/(m/s)

/** Minimum grade delta before broadcasting to the trainer (avoids BT spam) */
const GRADE_SEND_THRESHOLD = 0.001; // 0.1%

/** Exponential lerp rate for visual grade smoothing (~63% convergence per second) */
const GRADE_LERP_RATE = 1.0;

// ─── Reference canvas dimensions (used for texture generation) ────────────────

/** Width of each parallax layer texture (tiles horizontally for scrolling). */
const W = 960;
/** Height of each parallax layer texture. Tile sprites are scaled to match the actual screen height. */
const H = 540;

/** Road top in the reference texture, as a fraction of H. */
const ROAD_TOP_FRAC = 420 / H; // ≈ 0.778

// ─── Elevation graph layout ───────────────────────────────────────────────────

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
  private smoothVelocityMs = 0;
  /** Base config (mass + aero constants) – grade is layered on top each frame. */
  private basePhysics: PhysicsConfig = { ...DEFAULT_PHYSICS };
  private physicsConfig: PhysicsConfig = { ...DEFAULT_PHYSICS };

  // Course / elevation state
  private course: CourseProfile = DEFAULT_COURSE;
  private distanceM = 0;                // total cumulative distance
  private currentGrade = 0;
  private currentSurface: SurfaceType = 'asphalt';
  private lastSentGrade = 0;
  private lastSentSurface: SurfaceType = 'asphalt';
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
  private effectNameText!:    Phaser.GameObjects.Text;

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
  private segmentBoundaries: Array<{
    startM: number; endM: number;
    startElevM: number; endElevM: number;
    surface: SurfaceType;
  }> = [];

  // Parallax layers
  private layerMountains!: Phaser.GameObjects.TileSprite;
  private layerMidHills!: Phaser.GameObjects.TileSprite;
  private layerNearGround!: Phaser.GameObjects.TileSprite;
  private layerRoad!: Phaser.GameObjects.TileSprite;

  // Pre-connected services passed in from MenuScene
  private preConnectedTrainer: ITrainerService | null = null;
  private preConnectedHrm: HeartRateService | null = null;

  // HUD display objects
  private hudSpeed!: Phaser.GameObjects.Text;
  private hudPower!: Phaser.GameObjects.Text;
  private hudCadence!: Phaser.GameObjects.Text;
  private hudGrade!: Phaser.GameObjects.Text;
  private hudDistance!: Phaser.GameObjects.Text;
  private hudHR!: Phaser.GameObjects.Text;

  // Elevation graph
  private elevationGraphics!: Phaser.GameObjects.Graphics;
  private elevGradeLabel!: Phaser.GameObjects.Text;
  private elevDistLabel!: Phaser.GameObjects.Text;

  // FIT ride tracking
  private fitWriter!: FitWriter;
  private rideStartTime = 0;
  private currentHR = 0;
  private lastRecordMs = 0;
  private rideComplete = false;
  private overlayVisible = false;
  // Running sums for overlay stats (updated each recorded sample)
  private recordedPowerSum = 0;
  private recordedSpeedSum = 0;

  // Status / button objects
  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private btnMenu!: Phaser.GameObjects.Rectangle;
  private btnMenuLabel!: Phaser.GameObjects.Text;

  private btnHeadwindLabel!: Phaser.GameObjects.Text;
  private btnTailwindLabel!: Phaser.GameObjects.Text;

  // UI containers and backgrounds for resizing
  private hudBackground!: Phaser.GameObjects.Graphics;
  private hudSeps: Phaser.GameObjects.Graphics[] = [];
  private bottomStrip!: Phaser.GameObjects.Graphics;
  private elevBg!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Resize Handler ──────────────────────────────────────────────────────────

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;

    // 1. Update World Container (Centered)
    if (this.worldContainer) {
      this.worldContainer.setPosition(cx, height / 2);
      // Scale tile sprites to fill the screen. tileScaleY stretches the texture
      // to cover the full height without vertical tiling; tileScaleX stays 1 so
      // the texture tiles naturally for horizontal scrolling.
      const tileScaleY = height / H;
      [this.layerMountains, this.layerMidHills, this.layerNearGround, this.layerRoad].forEach(tile => {
        if (tile) {
          tile.setSize(width, height);
          tile.setTileScale(1, tileScaleY);
          tile.setPosition(-width / 2, -height / 2);
        }
      });

      // Cyclist ground Y: road top is ROAD_TOP_FRAC of texture height; map to
      // container local space (container origin is at screen centre).
      this.cycGroundY = height * (ROAD_TOP_FRAC - 0.5);
    }

    // 2. Update HUD (6 columns)
    if (this.hudBackground) {
      this.hudBackground.clear();
      this.hudBackground.fillStyle(0x000000, 0.55);
      this.hudBackground.fillRect(0, 0, width, 70);

      const colW   = width / 6;
      const getX   = (i: number) => i * colW + colW / 2;
      const sepW   = colW;

      this.hudSeps.forEach((sep, i) => {
        sep.clear();
        sep.fillStyle(0x444455, 1);
        sep.fillRect((i + 1) * sepW, 8, 1, 54);
      });

      for (let i = 0; i < 6; i++) this.updateHUDColumn(i, getX(i));
    }

    // 3. Update Elevation Graph
    if (this.elevBg) {
      this.elevBg.clear();
      this.elevBg.fillStyle(0x000000, 0.45);
      this.elevBg.fillRect(0, height - 125, width, ELEV_H);
      
      // Update labels
      if (this.elevGradeLabel) this.elevGradeLabel.setPosition(width - ELEV_PAD_X, height - 120);
      if (this.elevDistLabel) this.elevDistLabel.setPosition(width - ELEV_PAD_X, height - 125 + ELEV_H - 6);
      
      // Re-find the 'ELEV' label and reposition it
      this.children.list.forEach(child => {
        if (child instanceof Phaser.GameObjects.Text && child.text === 'ELEV') {
          child.setPosition(ELEV_PAD_X, height - 120);
        }
      });
    }

    // 4. Update Bottom Controls
    if (this.bottomStrip) {
      this.bottomStrip.clear();
      this.bottomStrip.fillStyle(0x000000, 0.50);
      this.bottomStrip.fillRect(0, height - 50, width, 50);

      const stY = height - 25;
      if (this.statusDot)   this.statusDot.setPosition(56, stY);
      if (this.statusLabel) this.statusLabel.setPosition(68, stY);

      if (this.btnMenu) {
        this.btnMenu.setPosition(width - 90, stY);
        if (this.btnMenuLabel) this.btnMenuLabel.setPosition(width - 90, stY);
      }
    }

    // 5. Manual Effect Buttons
    const effectBtnX = width - 100;
    if (this.btnHeadwind) {
      this.btnHeadwind.setPosition(effectBtnX, 120);
      if (this.btnHeadwindLabel) this.btnHeadwindLabel.setPosition(effectBtnX, 120);
    }
    if (this.btnTailwind) {
      this.btnTailwind.setPosition(effectBtnX, 170);
      if (this.btnTailwindLabel) this.btnTailwindLabel.setPosition(effectBtnX, 170);
    }

    // 6. Effect Notification
    if (this.notifContainer) {
      this.notifContainer.setPosition(cx, 200);
    }
    if (this.effectContainer) {
      this.effectContainer.setPosition(width - 100, 230);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  init(data?: {
    course?: CourseProfile;
    weightKg?: number;
    units?: Units;
    /** Pre-connected FTMS trainer from MenuScene; null → use MockTrainerService. */
    trainer?: ITrainerService | null;
    /** Pre-connected heart rate monitor from MenuScene; null → no HR display. */
    hrm?: HeartRateService | null;
  }): void {
    // Accept a generated course, rider weight, and unit preference from MenuScene
    this.course = data?.course ?? DEFAULT_COURSE;
    this.units  = data?.units  ?? 'imperial';
    this.preConnectedTrainer = data?.trainer ?? null;
    this.preConnectedHrm     = data?.hrm     ?? null;

    // Bike weight is fixed; rider weight comes from the menu (default 75 kg)
    const riderWeightKg = data?.weightKg ?? 75;
    const massKg = riderWeightKg + 8; // +8 kg for the bike

    // Scale CdA: larger riders push more air. 
    // A common physics approximation is scaling by (mass / baseline)^0.66
    const cdA = 0.325 * Math.pow(riderWeightKg / 75, 0.66);

    this.basePhysics = { ...DEFAULT_PHYSICS, massKg, cdA };

    // Reset per-ride state so restarts start fresh
    this.distanceM        = 0;
    this.smoothVelocityMs = 0;
    this.currentGrade     = 0;
    this.currentSurface   = 'asphalt';
    this.smoothGrade      = 0;
    this.lastSentGrade    = 0;
    this.lastSentSurface  = 'asphalt';
    this.latestPower      = 200;
    this.crankAngle       = 0;
    this.cadenceHistory   = [];
    this.avgCadence       = 0;
    this.rawPower         = 200;
    this.activeEffect     = null;
    this.physicsConfig    = { ...this.basePhysics };
    this.rideComplete       = false;
    this.overlayVisible     = false;
    this.currentHR          = 0;
    this.lastRecordMs       = 0;
    this.recordedPowerSum   = 0;
    this.recordedSpeedSum   = 0;
  }

  create(): void {
    this.rideStartTime = Date.now();
    this.fitWriter     = new FitWriter(this.rideStartTime);
    this.lastRecordMs  = this.rideStartTime;

    // These arrays accumulate across restarts because the scene instance is
    // reused. Clear them so buildHUD() starts from a clean slate each run.
    this.hudLabels = [];
    this.hudValues = [];
    this.hudUnits  = [];
    this.hudSeps   = [];

    this.cameras.main.setBackgroundColor('#e8dcc8');

    // Pre-compute elevation samples and range for the graph
    this.elevationSamples = buildElevationSamples(this.course, 100);
    this.minElevM = Math.min(...this.elevationSamples.map((s) => s.elevationM));
    this.maxElevM = Math.max(...this.elevationSamples.map((s) => s.elevationM));

    // Precompute segment boundaries for surface-coloured elevation graph
    let _cumDist = 0;
    let _cumElev = 0;
    this.segmentBoundaries = this.course.segments.map(seg => {
      const startM    = _cumDist;
      const startElevM = _cumElev;
      _cumDist += seg.distanceM;
      _cumElev += seg.distanceM * seg.grade;
      return { startM, endM: _cumDist, startElevM, endElevM: _cumElev, surface: seg.surface ?? 'asphalt' };
    });

    this.buildParallaxLayers();
    this.buildCyclist();

    // Pre-seed grade and surface so the world starts at the correct state
    this.currentGrade   = getGradeAtDistance(this.course, 0);
    this.currentSurface = getSurfaceAtDistance(this.course, 0);
    this.smoothGrade = this.currentGrade;
    this.physicsConfig = {
      ...this.basePhysics,
      grade: this.currentGrade,
      crr:   getCrrForSurface(this.currentSurface),
    };
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    this.buildHUD();
    this.buildElevationGraph();
    this.buildBottomControls();
    this.buildEffectUI();
    this.buildManualEffectButtons();

    // Handle resizing
    this.scale.on('resize', this.onResize, this);
    // Initial layout pass
    this.onResize();

    // ── Trainer setup ─────────────────────────────────────────────────────
    if (this.preConnectedTrainer) {
      // Use the pre-connected BT trainer passed from MenuScene
      this.trainer = this.preConnectedTrainer;
      this.trainer.onData((data) => this.handleData(data));
      this.isDemoMode = false;
      this.setStatus('ok', 'BT CONNECTED');
      // Sync simulation params immediately so the trainer receives the starting conditions
      if (this.trainer.setSimulationParams) {
        // FTMS trainers assume a ~75kg (165lb) default rider. 
        // We scale the Crr up so the physical hardware applies the correct 
        // rolling resistance force for a heavier rider.
        const assumedTrainerMass = 83; // 75kg + 8kg bike
        const effectiveCrr = this.physicsConfig.crr * (this.physicsConfig.massKg / assumedTrainerMass);
        
        const cwa = 0.5 * this.physicsConfig.rhoAir * this.physicsConfig.cdA;
        void this.trainer.setSimulationParams(this.smoothGrade, effectiveCrr, cwa);
        this.lastSentGrade   = this.smoothGrade;
        this.lastSentSurface = this.currentSurface;
      }
    } else {
      // No BT trainer → demo mode with mock data
      this.trainer = new MockTrainerService({ power: 200, speed: 30, cadence: 90 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.isDemoMode = true;
      this.setStatus('demo', 'DEMO');
    }

    // ── Heart rate monitor setup ──────────────────────────────────────────
    if (this.preConnectedHrm) {
      this.preConnectedHrm.onData((data) => this.handleHrmData(data));
    }
  }

  update(_time: number, delta: number): void {
    if (this.overlayVisible) return;

    const dt = delta / 1000; // seconds

    // ── Grade from course ────────────────────────────────────────────────────
    this.distanceM += this.smoothVelocityMs * dt;
    const wrappedDist = this.distanceM % this.course.totalDistanceM;

    // ── FIT recording (once per second) ─────────────────────────────────────
    const nowMs = Date.now();
    if (nowMs - this.lastRecordMs >= 1000) {
      this.lastRecordMs = nowMs;
      this.recordFitData(nowMs);
    }

    // ── Course completion ────────────────────────────────────────────────────
    if (!this.rideComplete && this.distanceM >= this.course.totalDistanceM) {
      this.rideComplete = true;
      this.recordFitData(Date.now());
      this.showRideEndOverlay(true);
      return;
    }

    const newGrade   = getGradeAtDistance(this.course, wrappedDist);
    const newSurface = getSurfaceAtDistance(this.course, wrappedDist);

    const gradeChanged   = newGrade   !== this.currentGrade;
    const surfaceChanged = newSurface !== this.currentSurface;

    if (gradeChanged) {
      this.currentGrade = newGrade;
      // In demo mode, randomise power & cadence each time a new segment begins
      if (this.isDemoMode) this.randomizeDemoMetrics();
    }

    if (surfaceChanged) {
      this.currentSurface = newSurface;
      this.showSurfaceNotification(newSurface);
    }

    if (gradeChanged || surfaceChanged) {
      this.physicsConfig = {
        ...this.basePhysics,
        grade: this.currentGrade,
        crr:   getCrrForSurface(this.currentSurface),
      };
    }

    // Smooth grade: exponential lerp toward current segment grade
    this.smoothGrade += (this.currentGrade - this.smoothGrade) * dt * GRADE_LERP_RATE;

    // Apply rotation + scale compensation to world container
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    const scale = Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02;
    this.worldContainer.setScale(scale);

    // Send simulation params to trainer hardware when grade or surface changes
    if (
      this.trainer.setSimulationParams &&
      (Math.abs(this.smoothGrade - this.lastSentGrade) >= GRADE_SEND_THRESHOLD ||
       this.currentSurface !== this.lastSentSurface)
    ) {
      this.lastSentGrade   = this.smoothGrade;
      this.lastSentSurface = this.currentSurface;
      
      // FTMS trainers assume a ~75kg (165lb) default rider. 
      // We scale the Crr up so the physical hardware applies the correct 
      // rolling resistance force for a heavier rider.
      const assumedTrainerMass = 83; // 75kg + 8kg bike
      const effectiveCrr = this.physicsConfig.crr * (this.physicsConfig.massKg / assumedTrainerMass);
      
      const cwa = 0.5 * this.physicsConfig.rhoAir * this.physicsConfig.cdA;
      
      void this.trainer.setSimulationParams(this.smoothGrade, effectiveCrr, cwa);
    }

    // ── Physics ─────────────────────────────────────────────────────────────
    const acceleration = calculateAcceleration(this.latestPower, this.smoothVelocityMs, this.physicsConfig);

    this.smoothVelocityMs += acceleration * dt;

    // Safety: prevent the bike from rolling backward on flat ground
    if (this.smoothVelocityMs < 0) {
      this.smoothVelocityMs = 0;
    }

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
   * Road surface Y in worldContainer local space.
   * Computed from screen height each resize: height * (ROAD_TOP_FRAC - 0.5).
   * For reference 540px height: 540 * (420/540 - 0.5) = 150.
   */
  private cycGroundY = 150;
  private static readonly WHEEL_R = 18;

  private buildCyclist(): void {
    // Add AFTER all parallax layers so the cyclist renders on top
    this.cyclistGraphics = this.add.graphics();
    this.worldContainer.add(this.cyclistGraphics);
  }

  private drawCyclist(): void {
    const g  = this.cyclistGraphics;
    g.clear();

    const gY   = this.cycGroundY;
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

  private hudLabels: Phaser.GameObjects.Text[] = [];
  private hudValues: Phaser.GameObjects.Text[] = [];
  private hudUnits: Phaser.GameObjects.Text[] = [];

  private buildHUD(): void {
    this.hudBackground = this.add.graphics().setDepth(10);

    // 6 columns → 5 separators
    for (let i = 0; i < 5; i++) {
      this.hudSeps.push(this.add.graphics().setDepth(10));
    }

    const labelStyle = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aaaaaa',
      letterSpacing: 3,
    };
    const valueBig = (colour = '#ffffff') => ({
      fontFamily: 'monospace',
      fontSize: '26px',
      color: colour,
      fontStyle: 'bold',
    });
    const unitStyle = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aaaaaa',
      letterSpacing: 3,
    };

    // Columns: 0=Speed, 1=Grade, 2=Power, 3=Dist, 4=Cadence, 5=HR
    const labels = ['SPEED', 'GRADE', 'POWER', 'DIST', 'CADENCE', 'HR'];
    const units  = [
      this.units === 'imperial' ? 'mph' : 'km/h',
      '',
      'W',
      this.units === 'imperial' ? 'mi' : 'km',
      'rpm',
      'bpm',
    ];

    for (let i = 0; i < 6; i++) {
      const lbl = this.add.text(0, 7, labels[i], labelStyle).setOrigin(0.5, 0).setDepth(11);
      this.hudLabels.push(lbl);

      let val: Phaser.GameObjects.Text;
      if (i === 2) {
        // Power column – teal accent + sub-labels
        val = this.add.text(0, 19, '---', {
          fontFamily: 'monospace',
          fontSize: '28px',
          color: '#00f5d4',
          fontStyle: 'bold',
        }).setOrigin(0.5, 0).setDepth(11);
        this.hudPower = val;

        this.hudPowerUnit = this.add.text(0, 64, 'W', unitStyle).setOrigin(0.5, 1).setDepth(11);
        this.hudRealPower = this.add.text(0, 64, '', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#888888',
        }).setOrigin(0.5, 1).setDepth(11).setAlpha(0);
      } else if (i === 5) {
        // HR column – pink accent
        val = this.add.text(0, 19, '---', valueBig('#ff88aa')).setOrigin(0.5, 0).setDepth(11);
        this.hudHR = val;
      } else {
        val = this.add.text(0, 19, '--.-', valueBig()).setOrigin(0.5, 0).setDepth(11);
        if (i === 0) this.hudSpeed    = val;
        else if (i === 1) this.hudGrade    = val;
        else if (i === 3) this.hudDistance = val;
        else if (i === 4) this.hudCadence  = val;
      }
      this.hudValues.push(val);

      if (units[i]) {
        if (i === 2) {
          // Power unit managed separately above
        } else {
          const u = this.add.text(0, 64, units[i], unitStyle).setOrigin(0.5, 1).setDepth(11);
          this.hudUnits.push(u);
        }
      }
    }
  }

  private updateHUDColumn(colIdx: number, x: number): void {
    if (this.hudLabels[colIdx]) this.hudLabels[colIdx].setX(x);
    if (this.hudValues[colIdx]) this.hudValues[colIdx].setX(x);

    // hudUnits array (excluding power which is handled separately):
    //   [0] = speed unit (mph/kmh)  → col 0
    //   [1] = dist unit  (mi/km)    → col 3
    //   [2] = cadence    (rpm)      → col 4
    //   [3] = heart rate (bpm)      → col 5
    if (colIdx === 0) this.hudUnits[0]?.setX(x);
    else if (colIdx === 2) { this.hudPowerUnit.setX(x); this.hudRealPower.setX(x); }
    else if (colIdx === 3) this.hudUnits[1]?.setX(x);
    else if (colIdx === 4) this.hudUnits[2]?.setX(x);
    else if (colIdx === 5) this.hudUnits[3]?.setX(x);
  }

  // ── Elevation graph ───────────────────────────────────────────────────────

  private buildElevationGraph(): void {
    // Static background strip
    this.elevBg = this.add.graphics().setDepth(10);

    // "ELEV" label (top-left of strip)
    this.add
      .text(ELEV_PAD_X, 0, 'ELEV', {
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
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 0)
      .setDepth(12);

    this.elevDistLabel = this.add
      .text(0, 0, '', {
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

    const width = this.scale.width;
    const height = this.scale.height;
    const samples = this.elevationSamples;
    const totalDist = this.course.totalDistanceM;
    const elevRange = (this.maxElevM - this.minElevM) || 1;

    const drawW = width - 2 * ELEV_PAD_X;
    const drawH = ELEV_H - 2 * ELEV_PAD_Y;
    const ox = ELEV_PAD_X;
    const oy = (height - 125) + ELEV_PAD_Y;

    const toX = (d: number) => ox + (d / totalDist) * drawW;
    const toY = (e: number) => oy + drawH - ((e - this.minElevM) / elevRange) * drawH;

    // Surface-coloured elevation segments
    for (const seg of this.segmentBoundaries) {
      const inSeg = samples.filter(s => s.distanceM > seg.startM && s.distanceM < seg.endM);
      const poly: Phaser.Types.Math.Vector2Like[] = [
        { x: toX(seg.startM), y: oy + drawH },
        { x: toX(seg.startM), y: toY(seg.startElevM) },
        ...inSeg.map(s => ({ x: toX(s.distanceM), y: toY(s.elevationM) })),
        { x: toX(seg.endM),   y: toY(seg.endElevM) },
        { x: toX(seg.endM),   y: oy + drawH },
      ];
      g.fillStyle(SURFACE_FILL_COLORS[seg.surface], 1.0);
      g.fillPoints(poly, true);
    }

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
    this.bottomStrip = this.add.graphics().setDepth(10);
    this.buildStatusIndicator();
    this.buildMenuButton();
  }

  private buildStatusIndicator(): void {
    this.statusDot = this.add.arc(0, 0, 5, 0, 360, false, 0x555566).setDepth(11);
    this.statusLabel = this.add
      .text(0, 0, 'DISCONNECTED', {
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

  private buildMenuButton(): void {
    this.btnMenu = this.add
      .rectangle(0, 0, 120, 34, 0x3a3a5a)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);

    this.btnMenuLabel = this.add
      .text(0, 0, '← MENU', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#aaaacc',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setDepth(12);

    this.btnMenu
      .on('pointerover', () => this.btnMenu.setFillStyle(0x5555aa))
      .on('pointerout',  () => this.btnMenu.setFillStyle(0x3a3a5a))
      .on('pointerdown', () => {
        this.showRideEndOverlay(false);
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

  private handleHrmData(data: HeartRateData): void {
    this.currentHR = Math.round(data.bpm);
    if (this.hudHR) {
      this.hudHR.setText(String(this.currentHR));
    }
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
    this.btnHeadwindLabel = this.add
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
    this.btnTailwindLabel = this.add
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

  private showSurfaceNotification(surface: SurfaceType): void {
    const SURFACE_COLORS: Record<SurfaceType, string> = {
      asphalt: '#aaaaaa',
      gravel:  '#ccaa44',
      dirt:    '#bb8844',
      mud:     '#88aa44',
    };
    const SURFACE_LABELS: Record<SurfaceType, string> = {
      asphalt: 'ASPHALT',
      gravel:  'GRAVEL',
      dirt:    'DIRT',
      mud:     'MUD',
    };

    const sub = surface === 'asphalt'
      ? 'BACK ON SMOOTH ROAD'
      : `+${Math.round((getCrrForSurface(surface) / getCrrForSurface('asphalt') - 1) * 100)}% ROLLING RESISTANCE`;

    this.notifTitle.setText(SURFACE_LABELS[surface]).setColor(SURFACE_COLORS[surface]);
    this.notifSub.setText(sub);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.tweens.add({
      targets: this.notifContainer,
      alpha: 0,
      delay: 2000,
      duration: 500,
      ease: 'Power2',
    });
  }

  private clearEffect(): void {
    this.activeEffect = null;
    this.effectContainer.setAlpha(0);
    this.updatePowerDisplay();
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

  // ── FIT ride tracking ─────────────────────────────────────────────────────

  private recordFitData(nowMs: number): void {
    const rec: RideRecord = {
      timestampMs:  nowMs,
      powerW:       Math.round(this.rawPower),
      cadenceRpm:   Math.round(this.avgCadence),
      speedMs:      this.smoothVelocityMs,
      distanceM:    this.distanceM,
      heartRateBpm: this.currentHR,
      altitudeM:    this.getCurrentAltitude(),
    };
    this.fitWriter.addRecord(rec);
    this.recordedPowerSum += rec.powerW;
    this.recordedSpeedSum += rec.speedMs;
  }

  /** Linear interpolation of elevation at the current (wrapped) course distance. */
  private getCurrentAltitude(): number {
    const samples = this.elevationSamples;
    if (samples.length === 0) return 0;
    const d = this.distanceM % this.course.totalDistanceM;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].distanceM <= d) lo = mid; else hi = mid;
    }
    if (lo >= samples.length - 1) return samples[samples.length - 1].elevationM;
    const s0 = samples[lo], s1 = samples[lo + 1];
    const t  = (d - s0.distanceM) / (s1.distanceM - s0.distanceM);
    return s0.elevationM + (s1.elevationM - s0.elevationM) * t;
  }

  // ── Ride-end overlay ──────────────────────────────────────────────────────

  private showRideEndOverlay(completed: boolean): void {
    this.overlayVisible = true;

    const w  = this.scale.width;
    const h  = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // ── Compute display stats ─────────────────────────────────────────────
    const elapsedMs = Date.now() - this.rideStartTime;
    const elapsedS  = Math.floor(elapsedMs / 1000);
    const hh = Math.floor(elapsedS / 3600);
    const mm = Math.floor((elapsedS % 3600) / 60);
    const ss = elapsedS % 60;
    const timeStr = hh > 0
      ? `${hh}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
      : `${mm}:${ss.toString().padStart(2, '0')}`;

    const distStr = this.units === 'imperial'
      ? `${(this.distanceM / 1609.344).toFixed(2)} mi`
      : `${(this.distanceM / 1000).toFixed(2)} km`;

    // Average power / speed from running sums
    const recs    = this.fitWriter.recordCount;
    const avgPow  = recs > 0 ? Math.round(this.recordedPowerSum / recs) : Math.round(this.rawPower);
    const avgSpdMs = recs > 0 ? this.recordedSpeedSum / recs : this.smoothVelocityMs;
    const avgSpdStr = this.units === 'imperial'
      ? `${msToMph(avgSpdMs).toFixed(1)} mph`
      : `${msToKmh(avgSpdMs).toFixed(1)} km/h`;

    // ── UI dimensions ────────────────────────────────────────────────────
    const panW = Math.min(480, w - 40);
    const panH = 200;
    const px   = cx - panW / 2;
    const py   = cy - panH / 2;

    const depth = 50;

    // Dim overlay
    const dim = this.add.graphics().setDepth(depth);
    dim.fillStyle(0x000000, 0.75);
    dim.fillRect(0, 0, w, h);

    // Panel background
    const panel = this.add.graphics().setDepth(depth + 1);
    panel.fillStyle(0x111122, 0.97);
    panel.fillRect(px, py, panW, panH);
    panel.lineStyle(1, 0x3344aa, 1);
    panel.strokeRect(px, py, panW, panH);

    const mono = 'monospace';

    // Title
    const titleText = completed ? 'RIDE COMPLETE' : 'RIDE ENDED';
    const titleColor = completed ? '#00f5d4' : '#aaaacc';
    this.add.text(cx, py + 26, titleText, {
      fontFamily: mono, fontSize: '22px', fontStyle: 'bold', color: titleColor,
    }).setOrigin(0.5, 0).setDepth(depth + 2);

    // Stats row
    const statsStr = `${distStr}   ·   ${timeStr}   ·   ${avgPow}W   ·   ${avgSpdStr}`;
    this.add.text(cx, py + 60, statsStr, {
      fontFamily: mono, fontSize: '12px', color: '#cccccc', letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(depth + 2);

    // Divider
    const divGfx = this.add.graphics().setDepth(depth + 1);
    divGfx.lineStyle(1, 0x333355, 1);
    divGfx.beginPath();
    divGfx.moveTo(px + 20, py + 84);
    divGfx.lineTo(px + panW - 20, py + 84);
    divGfx.strokePath();

    // Prompt text
    this.add.text(cx, py + 96, 'Save your ride data?', {
      fontFamily: mono, fontSize: '11px', color: '#888899', letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(depth + 2);

    // ── Buttons ──────────────────────────────────────────────────────────
    const btnY    = py + panH - 38;
    const btnW    = 150;
    const btnH    = 36;
    const gap     = 16;
    const dlX     = cx - btnW - gap / 2;
    const menuX   = cx + gap / 2;

    // Download button
    const dlBtn = this.add.rectangle(dlX, btnY, btnW, btnH, 0x006655)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth + 2);
    this.add.text(dlX + btnW / 2, btnY, 'DOWNLOAD .FIT', {
      fontFamily: mono, fontSize: '11px', fontStyle: 'bold', color: '#00f5d4',
    }).setOrigin(0.5, 0.5).setDepth(depth + 3);

    dlBtn
      .on('pointerover', () => dlBtn.setFillStyle(0x009977))
      .on('pointerout',  () => dlBtn.setFillStyle(0x006655))
      .on('pointerdown', () => {
        this.downloadFit();
        this.trainer.disconnect();
        this.preConnectedHrm?.disconnect();
        this.scene.start('MenuScene');
      });

    // Back to menu button
    const menuBtn = this.add.rectangle(menuX, btnY, btnW, btnH, 0x2a2a44)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth + 2);
    this.add.text(menuX + btnW / 2, btnY, 'SKIP TO MENU', {
      fontFamily: mono, fontSize: '11px', color: '#8888aa',
    }).setOrigin(0.5, 0.5).setDepth(depth + 3);

    menuBtn
      .on('pointerover', () => menuBtn.setFillStyle(0x4444aa))
      .on('pointerout',  () => menuBtn.setFillStyle(0x2a2a44))
      .on('pointerdown', () => {
        this.trainer.disconnect();
        this.preConnectedHrm?.disconnect();
        this.scene.start('MenuScene');
      });
  }

  private downloadFit(): void {
    const bytes = this.fitWriter.export();
    const blob  = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const date  = new Date(this.rideStartTime).toISOString().slice(0, 10);
    a.href     = url;
    a.download = `paper-peloton-${date}.fit`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.trainer?.disconnect();
    this.preConnectedHrm?.disconnect();
  }
}
