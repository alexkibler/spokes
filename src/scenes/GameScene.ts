/**
 * GameScene.ts
 *
 * Primary Phaser 3 scene for Spokes.
 */

import Phaser from 'phaser';
import { FitWriter } from '../fit/FitWriter';
import type { RideRecord } from '../fit/FitWriter';
import type { ITrainerService, TrainerData } from '../services/ITrainerService';
import { MockTrainerService } from '../services/MockTrainerService';
import type { HeartRateData } from '../services/HeartRateService';
import { RemoteService, type CursorDirection } from '../services/RemoteService';
import { SessionService } from '../services/SessionService';
import { RunStateManager, type RunModifiers } from '../roguelike/RunState';
import { evaluateChallenge, grantChallengeReward, type EliteChallenge } from '../roguelike/EliteChallenge';
import type { RacerProfile } from '../race/RacerProfile';
import {
  calculateAcceleration,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
} from '../physics/CyclistPhysics';
import type { Units } from './MenuScene';
import {
  DEFAULT_COURSE,
  getGradeAtDistance,
  getSurfaceAtDistance,
  getCrrForSurface,
  CRR_BY_SURFACE,
  type CourseProfile,
  type SurfaceType,
} from '../course/CourseProfile';
import { THEME } from '../theme';
import { GameHUD } from './ui/GameHUD';

const SURFACE_LABELS: Record<SurfaceType, string> = {
  asphalt: 'ASPHALT',
  gravel:  'GRAVEL',
  dirt:    'DIRT',
  mud:     'MUD',
};
import { ElevationGraph } from './ui/ElevationGraph';
import { RideOverlay, type RideStats } from './ui/RideOverlay';
import { RewardOverlay } from './ui/RewardOverlay';
import { pickRewards } from '../roguelike/RewardPool';
import { Button } from '../ui/Button';
import { PauseOverlay } from './ui/PauseOverlay';
import { RemotePairingOverlay } from './ui/RemotePairingOverlay';

// ─── Constants ────────────────────────────────────────────────────────────────

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
    const t = upperLen / total;
    return [hipX + dx * t, hipY + dy * t];
  }

  const cosA = (dist * dist + upperLen * upperLen - lowerLen * lowerLen)
    / (2 * dist * upperLen);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const kneeAngle = Math.atan2(dy, dx) + kneeSide * angleA;

  return [
    hipX + Math.cos(kneeAngle) * upperLen,
    hipY + Math.sin(kneeAngle) * upperLen,
  ];
}

const WORLD_SCALE = 50;
const GRADE_SEND_THRESHOLD = 0.001;
const GRADE_LERP_RATE = 1.0;
/** Distance at which draft effect starts (DRAFT_MIN_CDA_REDUCTION at this distance) */
const DRAFT_MAX_DISTANCE_M = 30;
/** CdA reduction at gap = 0 m (wheel-to-wheel) */
const DRAFT_MAX_CDA_REDUCTION = 0.50;
/** CdA reduction at gap = DRAFT_MAX_DISTANCE_M (tail of the bubble) */
const DRAFT_MIN_CDA_REDUCTION = 0.01;

/**
 * Returns the CdA reduction fraction for a trailing rider at `gapM` metres
 * behind the leading rider.  Linear from DRAFT_MAX_CDA_REDUCTION at 0 m to
 * DRAFT_MIN_CDA_REDUCTION at DRAFT_MAX_DISTANCE_M, 0 beyond that.
 */
function draftFactor(gapM: number): number {
  if (gapM <= 0 || gapM >= DRAFT_MAX_DISTANCE_M) return 0;
  return DRAFT_MIN_CDA_REDUCTION +
    (DRAFT_MAX_CDA_REDUCTION - DRAFT_MIN_CDA_REDUCTION) *
    (1 - gapM / DRAFT_MAX_DISTANCE_M);
}

interface GhostState {
  racer:        RacerProfile;
  distanceM:    number;
  velocityMs:   number;
  crankAngle:   number;
  physics:      PhysicsConfig;
  graphics:     Phaser.GameObjects.Graphics;
  finishedTime: number | null;
  draftFactor:  number;
}

const W = 960;
const H = 540;
const ROAD_TOP_FRAC = 420 / H;

const DEV_POWER_WATTS = 100000;
const DEMO_POWER_WATTS = 200;

interface LayerDef {
  key: string;
  parallax: number;
  draw: (g: Phaser.GameObjects.Graphics) => void;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private units: Units = 'imperial';
  private weightKg = 75;
  private isRoguelike = false;
  private isDevMode = false;
  private isBackwards = false;
  private ftpW = 200;
  /** FTP adjusted by the run's powerMult — what challenges should target. */
  private get effectiveFtpW(): number { return this.ftpW * this.runModifiers.powerMult; }
  private activeChallenge: EliteChallenge | null = null;

  private racerProfiles: RacerProfile[] = [];
  private ghosts: GhostState[] = [];
  private firstGhostFinishedTime: number | null = null;
  private raceGapBg!: Phaser.GameObjects.Graphics;
  private raceGapText!: Phaser.GameObjects.Text;
  private raceGapLabel!: Phaser.GameObjects.Text;

  private playerDraftFactor = 0;
  private slipstreamGraphics!: Phaser.GameObjects.Graphics;
  private draftBadgeBg!: Phaser.GameObjects.Graphics;
  private draftBadgeText!: Phaser.GameObjects.Text;
  private draftAnimOffset = 0;

  private trainer!: ITrainerService;
  private isDemoMode = true;

  private latestPower = DEMO_POWER_WATTS;
  private smoothVelocityMs = 0;
  private basePhysics: PhysicsConfig = { ...DEFAULT_PHYSICS };
  private physicsConfig: PhysicsConfig = { ...DEFAULT_PHYSICS };

  private course: CourseProfile = DEFAULT_COURSE;
  private distanceM = 0;
  private currentGrade = 0;
  private currentSurface: SurfaceType = 'asphalt';
  private lastSentGrade = -999;
  private lastSentSurface: SurfaceType | null = null;
  private smoothGrade = 0;

  private worldContainer!: Phaser.GameObjects.Container;

  private cyclistGraphics!: Phaser.GameObjects.Graphics;
  private crankAngle = 0;
  private cadenceHistory: Array<{ rpm: number; timeMs: number }> = [];
  private avgCadence = 0;

  private activeEffect: ActiveEffect | null = null;
  private rawPower     = DEMO_POWER_WATTS;
  private runModifiers: RunModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 };

  // UI Components
  private hud!: GameHUD;
  private elevGraph!: ElevationGraph;
  private rideOverlay: RideOverlay | null = null;

  private effectContainer!:   Phaser.GameObjects.Container;
  private effectNameText!:    Phaser.GameObjects.Text;

  private btnHeadwind!: Phaser.GameObjects.Rectangle; // Keeping simple for now or use Button
  private btnTailwind!: Phaser.GameObjects.Rectangle;
  private btnHeadwindLabel!: Phaser.GameObjects.Text;
  private btnTailwindLabel!: Phaser.GameObjects.Text;

  private notifContainer!: Phaser.GameObjects.Container;
  private notifTitle!:     Phaser.GameObjects.Text;
  private notifSub!:       Phaser.GameObjects.Text;
  private notifTween:      Phaser.Tweens.Tween | null = null;

  private layerMountains!: Phaser.GameObjects.TileSprite;
  private layerMidHills!: Phaser.GameObjects.TileSprite;
  private layerNearGround!: Phaser.GameObjects.TileSprite;
  private roadLayers!: Record<SurfaceType, Phaser.GameObjects.TileSprite>;

  private isRealTrainer = false;

  private fitWriter!: FitWriter;
  private rideStartTime = 0;
  private currentHR = 0;
  private lastRecordMs = 0;
  private rideComplete = false;
  private overlayVisible = false;
  private recordedPowerSum   = 0;
  private recordedSpeedSum   = 0;
  private recordedCadenceSum = 0;
  private peakPowerW = 0;
  private challengeEverStopped = false;
  private challengeStartMs = 0;
  private edgeStartRecordCount = 0;

  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private btnMenu!: Button;
  private btnRemote!: Phaser.GameObjects.Text;

  private activePauseOverlay: PauseOverlay | null = null;

  // Challenge status panel
  private challengePanel!: Phaser.GameObjects.Graphics;
  private challengePanelTitle!: Phaser.GameObjects.Text;
  private challengePanelValue!: Phaser.GameObjects.Text;
  private challengePanelTarget!: Phaser.GameObjects.Text;
  private challengePanelBar!: Phaser.GameObjects.Graphics;

  private bottomStrip!: Phaser.GameObjects.Graphics;
  private cycGroundY = 150;
  private static readonly WHEEL_R = 18;

  private lastStateUpdateMs = 0;
  private onRemoteUseItemBound = this.onRemoteUseItem.bind(this);
  private onRemotePauseBound = this.onRemotePause.bind(this);
  private onRemoteCursorMoveBound = this.onRemoteCursorMove.bind(this);
  private onRemoteCursorSelectBound = this.onRemoteCursorSelect.bind(this);
  private onRemoteResumeBound = this.onRemoteResume.bind(this);
  private onRemoteBackToMapBound = this.onRemoteBackToMap.bind(this);
  private onRemoteSaveQuitBound = this.onRemoteSaveQuit.bind(this);

  constructor() {
    super({ key: 'GameScene' });
  }

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;

    // 1. Update World
    if (this.worldContainer) {
      this.worldContainer.setPosition(cx, height / 2);
      const tileScaleY = height / H;
      const roadTiles = this.roadLayers ? (Object.values(this.roadLayers) as Phaser.GameObjects.TileSprite[]) : [];
      [this.layerMountains, this.layerMidHills, this.layerNearGround, ...roadTiles].forEach(tile => {
        if (tile) {
          tile.setSize(width, height);
          tile.setTileScale(1, tileScaleY);
          tile.setPosition(-width / 2, -height / 2);
        }
      });
      this.cycGroundY = height * (ROAD_TOP_FRAC - 0.5);
    }

    // 2. Update HUD
    this.hud?.onResize(width);

    // 3. Update Elevation Graph
    this.elevGraph?.onResize(width, height);

    // 4. Update Bottom Controls
    if (this.bottomStrip) {
      this.bottomStrip.clear();
      this.bottomStrip.fillStyle(THEME.colors.ui.hudBackground, 0.50);
      this.bottomStrip.fillRect(0, height - THEME.layout.bottomStripHeight, width, THEME.layout.bottomStripHeight);

      const stY = height - 25;
      if (this.statusDot)   this.statusDot.setPosition(56, stY);
      if (this.statusLabel) this.statusLabel.setPosition(68, stY);

      // Re-position menu button (Container)
      if (this.btnMenu) {
        this.btnMenu.setPosition(width - 90, stY);
      }
    }

    if (this.btnRemote) {
        this.btnRemote.setPosition(width - 40, 40);
    }

    // 5. Effect Buttons
    const effectBtnX = width - 100;
    if (this.btnHeadwind) {
      this.btnHeadwind.setPosition(effectBtnX, 120);
      if (this.btnHeadwindLabel) this.btnHeadwindLabel.setPosition(effectBtnX, 120);
    }
    if (this.btnTailwind) {
      this.btnTailwind.setPosition(effectBtnX, 170);
      if (this.btnTailwindLabel) this.btnTailwindLabel.setPosition(effectBtnX, 170);
    }

    // 6. Notifications
    if (this.notifContainer) this.notifContainer.setPosition(cx, 200);
    if (this.effectContainer) this.effectContainer.setPosition(width - 100, 230);
  }

  init(data?: {
    course?: CourseProfile;
    isRoguelike?: boolean;
    isBackwards?: boolean;
    activeChallenge?: EliteChallenge | null;
    racers?: RacerProfile[];
    racer?: RacerProfile | null;
  }): void {
    this.course = data?.course ?? DEFAULT_COURSE;
    this.units    = SessionService.units;
    this.weightKg = SessionService.weightKg;
    this.isRoguelike         = data?.isRoguelike ?? false;
    this.isDevMode           = RunStateManager.getDevMode();
    this.isBackwards         = data?.isBackwards ?? false;
    this.ftpW                = RunStateManager.getRun()?.ftpW ?? 200;
    this.activeChallenge     = data?.activeChallenge ?? null;
    this.racerProfiles = data?.racers ?? (data?.racer ? [data.racer] : []);

    const massKg = this.weightKg + 8;
    const cdA = 0.325 * Math.pow(this.weightKg / 75, 0.66);
    this.basePhysics = { ...DEFAULT_PHYSICS, massKg, cdA };

    // Reset state
    this.distanceM        = 0;
    this.smoothVelocityMs = 0;
    this.currentGrade     = 0;
    this.currentSurface   = 'asphalt';
    this.smoothGrade      = 0;
    this.lastSentGrade    = -999;
    this.lastSentSurface  = null;
    this.latestPower      = DEMO_POWER_WATTS;
    this.crankAngle       = 0;
    this.cadenceHistory   = [];
    this.avgCadence       = 0;
    this.rawPower         = DEMO_POWER_WATTS;
    this.activeEffect     = null;
    this.physicsConfig    = { ...this.basePhysics };
    this.rideComplete       = false;
    this.overlayVisible     = false;
    this.currentHR          = 0;
    this.lastRecordMs       = 0;
    this.recordedPowerSum      = 0;
    this.recordedSpeedSum      = 0;
    this.recordedCadenceSum    = 0;
    this.peakPowerW               = 0;
    this.challengeEverStopped     = false;
    this.challengeStartMs         = 0;
    this.edgeStartRecordCount  = 0;
    this.ghosts                 = [];
    this.firstGhostFinishedTime = null;
    this.playerDraftFactor      = 0;
    this.draftAnimOffset        = 0;
  }

  create(): void {
    if (this.isRoguelike) {
      const run = RunStateManager.getRun();
      if (run) {
        if (!run.fitWriter) run.fitWriter = new FitWriter(Date.now());
        this.fitWriter = run.fitWriter;
      } else {
        this.fitWriter = new FitWriter(Date.now());
      }
    } else {
      this.rideStartTime = Date.now();
      this.fitWriter     = new FitWriter(this.rideStartTime);
    }
    
    this.edgeStartRecordCount = this.fitWriter.recordCount;
    this.rideStartTime        = Date.now();
    this.lastRecordMs         = this.rideStartTime;
    this.challengeStartMs     = this.rideStartTime;

    this.cameras.main.setBackgroundColor(THEME.colors.backgroundHex);

    this.buildParallaxLayers();
    this.buildGhostCyclist();
    this.buildCyclist();

    this.currentGrade   = getGradeAtDistance(this.course, 0);
    this.currentSurface = getSurfaceAtDistance(this.course, 0);
    this.smoothGrade = this.currentGrade;
    this.physicsConfig = {
      ...this.basePhysics,
      grade: this.currentGrade,
      crr:   getCrrForSurface(this.currentSurface) * (this.runModifiers.crrMult ?? 1),
    };
    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    // ── Components ──────────────────────────────────────────────────────────
    this.hud = new GameHUD(this, this.units);
    this.elevGraph = new ElevationGraph(this, this.course, this.units, this.isBackwards);

    this.buildRaceGapPanel();
    this.buildChallengePanel();
    this.buildBottomControls();
    this.buildEffectUI();
    this.buildManualEffectButtons();
    this.buildDevToggle();
    this.buildRemoteButton();

    RemoteService.getInstance().initHost()
      .then((code) => {
        if (this.btnRemote && this.sys.isActive()) {
          this.btnRemote.setText(`CODE: ${code}`);
        }
      })
      .catch((err) => {
        console.error('Remote init failed', err);
        if (this.btnRemote && this.sys.isActive()) {
          this.btnRemote.setText('OFFLINE').setColor(THEME.colors.text.danger);
        }
      });

    this.scale.on('resize', this.onResize, this);
    this.onResize();

    // ── Trainer ─────────────────────────────────────────────────────────────
    // SessionService holds whatever trainer was connected in MenuScene.
    // Mock trainers from a previous scene are discarded here (e.g. dev-mode
    // trainer from an Elite Challenge won't bleed into the next ride).
    SessionService.disconnectMock();
    const preConnectedTrainer = SessionService.trainer;

    if (preConnectedTrainer) {
      this.trainer = preConnectedTrainer;
      this.trainer.onData((data) => this.handleData(data));
      this.isDemoMode = false;
      this.isRealTrainer = true;
      if (this.isRoguelike) RunStateManager.setRealTrainerRun(true);
      this.setStatus('ok', 'BT CONNECTED');
    } else if (this.isDevMode) {
      const mock = new MockTrainerService({ power: DEV_POWER_WATTS, speed: 45, cadence: 95 });
      this.trainer = mock;
      mock.setPower(DEV_POWER_WATTS);
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.isDemoMode = false;
      this.setStatus('demo', `DEV (${DEV_POWER_WATTS}W)`);
    } else {
      this.trainer = new MockTrainerService({ power: this.ftpW, speed: 25, cadence: 80 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.isDemoMode = false;
      this.setStatus('demo', `SIM ${this.ftpW}W`);
    }

    const preConnectedHrm = SessionService.hrm;
    if (preConnectedHrm) {
      preConnectedHrm.onData((data) => this.handleHrmData(data));
    }

    if (this.isRoguelike) {
      const run = RunStateManager.getRun();
      if (run && run.inventory.includes('tailwind')) {
        this.triggerEffect('tailwind');
      }
      this.runModifiers = RunStateManager.getModifiers();
    }

    RemoteService.getInstance().onUseItem(this.onRemoteUseItemBound);
    RemoteService.getInstance().onPause(this.onRemotePauseBound);
    RemoteService.getInstance().onCursorMove(this.onRemoteCursorMoveBound);
    RemoteService.getInstance().onCursorSelect(this.onRemoteCursorSelectBound);
    RemoteService.getInstance().onResume(this.onRemoteResumeBound);
    RemoteService.getInstance().onBackToMap(this.onRemoteBackToMapBound);
    RemoteService.getInstance().onSaveQuit(this.onRemoteSaveQuitBound);

    // Dev mode: skip the ride entirely and instantly complete the edge
    if (this.isDevMode && this.isRoguelike) {
      this.rideComplete = true;
      this.showRideEndOverlay(true);
      return;
    }
  }

  update(_time: number, delta: number): void {
    if (this.overlayVisible) return;

    const nowMs = Date.now();
    if (nowMs - this.lastStateUpdateMs >= 250) {
      this.lastStateUpdateMs = nowMs;
      RemoteService.getInstance().sendStateUpdate({
        instantaneousPower: Math.round(this.latestPower),
        speedMs: this.smoothVelocityMs,
        distanceM: this.distanceM,
        heartRateBpm: this.currentHR,
        currentGrade: this.currentGrade,
        units: this.units,
      });
    }

    const dt = delta / 1000;

    this.distanceM += this.smoothVelocityMs * dt;
    const wrappedDist = this.distanceM % this.course.totalDistanceM;

    if (nowMs - this.lastRecordMs >= 1000) {
      this.lastRecordMs = nowMs;
      this.recordFitData(nowMs);
    }

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
      if (this.isDemoMode) this.randomizeDemoMetrics();
    }

    if (surfaceChanged) {
      this.currentSurface = newSurface;
      this.showSurfaceNotification(newSurface);
      this.switchRoadLayer(newSurface);
    }

    if (gradeChanged || surfaceChanged) {
      this.physicsConfig = {
        ...this.basePhysics,
        grade: this.currentGrade,
        crr:   getCrrForSurface(this.currentSurface) * (this.runModifiers.crrMult ?? 1),
      };
    }

    this.smoothGrade += (this.currentGrade - this.smoothGrade) * dt * GRADE_LERP_RATE;

    const rotationAngle = this.isBackwards ? Math.atan(this.smoothGrade) : -Math.atan(this.smoothGrade);
    this.worldContainer.rotation = rotationAngle;
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    if (
      this.trainer.setSimulationParams &&
      (Math.abs(this.smoothGrade - this.lastSentGrade) >= GRADE_SEND_THRESHOLD ||
       this.currentSurface !== this.lastSentSurface)
    ) {
      this.lastSentGrade   = this.smoothGrade;
      this.lastSentSurface = this.currentSurface;
      
      const assumedTrainerMass = 83;
      const effectiveCrr = this.physicsConfig.crr * (this.physicsConfig.massKg / assumedTrainerMass);
      const cwa = 0.5 * this.physicsConfig.rhoAir * this.physicsConfig.cdA;
      
      void this.trainer.setSimulationParams(this.smoothGrade, effectiveCrr, cwa);
    }

    // Drafting
    if (this.ghosts.length > 0) {
      let bestDraft = 0;
      for (const ghost of this.ghosts) {
        bestDraft = Math.max(bestDraft, draftFactor(ghost.distanceM - this.distanceM));
      }
      this.playerDraftFactor = bestDraft;
      this.draftAnimOffset += this.smoothVelocityMs * dt * 2;
    } else {
      this.playerDraftFactor = 0;
    }

    // Physics
    const draftModifiers: RunModifiers = this.playerDraftFactor > 0
      ? { ...this.runModifiers, dragReduction: Math.min(0.99, this.runModifiers.dragReduction + this.playerDraftFactor) }
      : this.runModifiers;
    const acceleration = calculateAcceleration(this.latestPower, this.smoothVelocityMs, this.physicsConfig, draftModifiers);

    this.smoothVelocityMs += acceleration * dt;
    if (this.smoothVelocityMs < 0) this.smoothVelocityMs = 0;

    // Parallax
    const baseScroll = this.smoothVelocityMs * WORLD_SCALE * dt;
    const dir = this.isBackwards ? -1 : 1;
    this.layerMountains.tilePositionX += baseScroll * 0.10 * dir;
    this.layerMidHills.tilePositionX  += baseScroll * 0.30 * dir;
    this.layerNearGround.tilePositionX += baseScroll * 0.65 * dir;
    for (const tile of Object.values(this.roadLayers)) {
      tile.tilePositionX += baseScroll * 1.00 * dir;
    }

    // Updates
    this.hud.updateSpeed(this.smoothVelocityMs);
    this.hud.updateDistance(this.distanceM);
    this.hud.updateGrade(this.smoothGrade);
    this.updateChallengePanel();

    if (this.ghosts.length > 0 && !this.rideComplete) {
      this.updateAllGhostRacers(dt);
    }

    const now = Date.now();
    const recent = this.cadenceHistory.filter((h) => now - h.timeMs <= 3000);
    if (recent.length > 0) {
      this.avgCadence = recent.reduce((sum, h) => sum + h.rpm, 0) / recent.length;
    }
    this.crankAngle += (this.avgCadence / 60) * 2 * Math.PI * dt;
    for (const ghost of this.ghosts) {
      ghost.crankAngle += (90 / 60) * 2 * Math.PI * dt;
    }

    this.drawCyclist();
    if (this.ghosts.length > 0) {
      this.drawAllGhosts();
      this.drawSlipstream();
    }
    this.updateDraftBadge();

    const ghostsForGraph = this.ghosts.map(g => ({ distanceM: g.distanceM, color: g.racer.color, accentColor: g.racer.accentColor }));
    this.elevGraph.updateGraph(wrappedDist, this.smoothGrade, ghostsForGraph);
    this.updateRaceGapPanel();
  }

  // ── Parallax layers ──────────────────────────────────────────────────────────

  private buildParallaxLayers(): void {
    this.worldContainer = this.add.container(W / 2, H / 2).setDepth(0);

    const layers: LayerDef[] = [
      { key: 'mountains', parallax: 0.10, draw: (g) => this.drawMountains(g) },
      { key: 'midHills', parallax: 0.30, draw: (g) => this.drawMidHills(g) },
      { key: 'nearGround', parallax: 0.65, draw: (g) => this.drawNearGround(g) },
    ];

    for (const layer of layers) {
      const g = this.add.graphics();
      layer.draw(g);
      g.generateTexture(layer.key, W, H);
      g.destroy();
      const sprite = this.add.tileSprite(-W / 2, -H / 2, W, H, layer.key).setOrigin(0, 0);
      this.worldContainer.add(sprite);
      if (layer.key === 'mountains') this.layerMountains = sprite;
      else if (layer.key === 'midHills') this.layerMidHills = sprite;
      else if (layer.key === 'nearGround') this.layerNearGround = sprite;
    }

    const roadDrawers: Record<SurfaceType, (g: Phaser.GameObjects.Graphics) => void> = {
      asphalt: (g) => this.drawRoad(g),
      gravel:  (g) => this.drawRoadGravel(g),
      dirt:    (g) => this.drawRoadDirt(g),
      mud:     (g) => this.drawRoadMud(g),
    };

    const roadSprites = {} as Record<SurfaceType, Phaser.GameObjects.TileSprite>;
    for (const [surface, drawFn] of Object.entries(roadDrawers) as [SurfaceType, any][]) {
      const key = `road_${surface}`;
      const g = this.add.graphics();
      drawFn(g);
      g.generateTexture(key, W, H);
      g.destroy();
      const sprite = this.add.tileSprite(-W / 2, -H / 2, W, H, key)
        .setOrigin(0, 0).setVisible(surface === this.currentSurface);
      this.worldContainer.add(sprite);
      roadSprites[surface] = sprite;
    }
    this.roadLayers = roadSprites;
  }

  private drawMountains(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xb8aa96, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:200},{x:80,y:115},{x:200,y:190},{x:320,y:130},{x:430,y:200},{x:560,y:120},{x:680,y:175},{x:780,y:115},{x:880,y:165},{x:960,y:145},{x:960,y:H}], true);
  }
  private drawMidHills(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x7a9469, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:340},{x:60,y:300},{x:150,y:275},{x:270,y:310},{x:390,y:280},{x:510,y:340},{x:630,y:285},{x:750,y:310},{x:870,y:275},{x:960,y:310},{x:960,y:H}], true);
  }
  private drawNearGround(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x4a6e38, 1);
    g.fillPoints([{x:0,y:H},{x:0,y:400},{x:100,y:380},{x:220,y:395},{x:350,y:375},{x:480,y:390},{x:610,y:378},{x:740,y:400},{x:860,y:382},{x:960,y:395},{x:960,y:H}], true);
  }
  private switchRoadLayer(surface: SurfaceType): void {
    for (const [key, tile] of Object.entries(this.roadLayers)) {
      tile.setVisible(key === surface);
    }
  }
  private drawRoad(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x9a8878, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(0x7a6858, 1); g.fillRect(0, 420, W, 4); g.fillRect(0, H - 4, W, 4);
    g.fillStyle(0xffffff, 0.7);
    for (let x = 0; x < W; x += 70) g.fillRect(x, 455, 40, 4);
  }
  private drawRoadGravel(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xc4a882, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(0xa88c68, 1); g.fillRect(0, 420, W, 5); g.fillRect(0, H - 5, W, 5);
    let seed = 42; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 220; i++) {
      g.fillStyle(rand() > 0.5 ? 0x9a7a58 : 0xddc8a8, 0.9);
      g.fillEllipse(rand() * W, 425 + rand() * (H - 430), 2 + rand() * 5, 2 + rand() * 3);
    }
  }
  private drawRoadDirt(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0xa06030, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(0x804818, 1); g.fillRect(0, 420, W, 5); g.fillRect(0, H - 5, W, 5);
    g.fillStyle(0x6b3810, 0.85); g.fillRect(0, 437, W, 6); g.fillRect(0, 500, W, 6);
    let seed = 17; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 80; i++) {
      g.fillStyle(rand() > 0.5 ? 0xc08040 : 0x804020, 0.7);
      g.fillRect(rand() * W, 426 + rand() * (H - 432), 2 + rand() * 4, 2 + rand() * 3);
    }
  }
  private drawRoadMud(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x5a4828, 1); g.fillRect(0, 420, W, H - 420);
    g.fillStyle(0x3a2818, 1); g.fillRect(0, 420, W, 6); g.fillRect(0, H - 6, W, 6);
    g.fillStyle(0x2e1e0e, 0.9); g.fillRect(0, 433, W, 12); g.fillRect(0, 492, W, 12);
    let seed = 99; const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 60; i++) {
      g.fillStyle(0x3a2818, 0.6);
      g.fillEllipse(rand() * W, 426 + rand() * (H - 432), 3 + rand() * 8, 2 + rand() * 4);
    }
  }

  // ── Cyclist ───────────────────────────────────────────────────────────────

  private buildCyclist(): void {
    this.cyclistGraphics = this.add.graphics();
    this.worldContainer.add(this.cyclistGraphics);
    if (this.isBackwards) this.cyclistGraphics.setScale(-1, 1);
  }

  private buildGhostCyclist(): void {
    this.ghosts = this.racerProfiles.map((racer) => {
      const graphics = this.add.graphics();
      graphics.setAlpha(0.72);
      this.worldContainer.add(graphics);
      return {
        racer, distanceM: 0, velocityMs: 0, crankAngle: 0,
        physics: { massKg: racer.massKg, cdA: racer.cdA, crr: racer.crr, rhoAir: DEFAULT_PHYSICS.rhoAir, grade: 0 },
        graphics, finishedTime: null, draftFactor: 0,
      } satisfies GhostState;
    });
    this.slipstreamGraphics = this.add.graphics();
    this.worldContainer.add(this.slipstreamGraphics);
    this.draftBadgeBg = this.add.graphics().setDepth(15);
    this.draftBadgeText = this.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, fontStyle: 'bold', color: THEME.colors.text.accent, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(16).setAlpha(0);
    if (this.ghosts.length === 0) { this.draftBadgeBg.setVisible(false); this.draftBadgeText.setVisible(false); }
  }

  private drawCyclistShape(g: Phaser.GameObjects.Graphics, crankAngle: number, gY: number, BIKE: number, JERSEY: number, SKIN: number): void {
    const wR = GameScene.WHEEL_R, axleY = gY - wR;
    const rearX = -22, frontX = 26, crankX = 0, crankY = axleY, crankLen = 9;
    const seatX = -5, seatY = axleY - 35, hbarX = 22, hbarY = axleY - 33;
    const hipX = -2, hipY = axleY - 30, shoulderX = 14, shoulderY = axleY - 43;
    const headX = 22, headY = axleY - 53, headR = 7;
    const upperLen = 22, lowerLen = 19;
    const rA = crankAngle, lA = crankAngle + Math.PI;
    const rFX = crankX + Math.cos(rA) * crankLen, rFY = crankY + Math.sin(rA) * crankLen;
    const lFX = crankX + Math.cos(lA) * crankLen, lFY = crankY + Math.sin(lA) * crankLen;
    const [rKX, rKY] = computeKnee(hipX, hipY, rFX, rFY, upperLen, lowerLen, -1);
    const [lKX, lKY] = computeKnee(hipX, hipY, lFX, lFY, upperLen, lowerLen, -1);

    g.lineStyle(4, BIKE, 0.38); g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(lKX, lKY); g.lineTo(lFX, lFY); g.strokePath();
    g.fillStyle(BIKE, 0.38); g.fillRect(lFX - 5, lFY - 1.5, 10, 3);
    g.lineStyle(3, BIKE, 1); g.strokeCircle(rearX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45); g.strokeCircle(rearX, axleY, wR * 0.55); g.fillStyle(BIKE, 1); g.fillCircle(rearX, axleY, 2.5);
    g.lineStyle(3, BIKE, 1); g.beginPath(); g.moveTo(rearX, axleY); g.lineTo(crankX, crankY + 2); g.strokePath();
    g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(seatX, seatY); g.strokePath();
    g.beginPath(); g.moveTo(seatX, seatY); g.lineTo(hbarX, hbarY); g.strokePath();
    g.beginPath(); g.moveTo(hbarX - 2, hbarY + 8); g.lineTo(crankX, crankY); g.strokePath();
    g.beginPath(); g.moveTo(hbarX, hbarY); g.lineTo(frontX, axleY); g.strokePath();
    g.lineStyle(4, BIKE, 1); g.beginPath(); g.moveTo(seatX - 6, seatY); g.lineTo(seatX + 8, seatY); g.strokePath();
    g.lineStyle(3, BIKE, 1); g.strokeCircle(frontX, axleY, wR);
    g.lineStyle(1.5, BIKE, 0.45); g.strokeCircle(frontX, axleY, wR * 0.55); g.fillStyle(BIKE, 1); g.fillCircle(frontX, axleY, 2.5);
    g.lineStyle(3, BIKE, 1); g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(rFX, rFY); g.strokePath();
    g.lineStyle(2.5, BIKE, 0.5); g.beginPath(); g.moveTo(crankX, crankY); g.lineTo(lFX, lFY); g.strokePath();
    g.lineStyle(2, BIKE, 0.7); g.strokeCircle(crankX, crankY, 6);
    g.lineStyle(5, BIKE, 1); g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(rKX, rKY); g.lineTo(rFX, rFY); g.strokePath();
    g.fillStyle(BIKE, 1); g.fillRect(rFX - 5, rFY - 1.5, 10, 3);
    g.fillStyle(JERSEY, 1); g.fillPoints([{ x: hipX - 2, y: hipY }, { x: hipX + 5, y: hipY - 2 }, { x: shoulderX, y: shoulderY }, { x: shoulderX - 5, y: shoulderY + 4 }], true);
    g.lineStyle(3, SKIN, 1); g.beginPath(); g.moveTo(shoulderX - 1, shoulderY + 2); g.lineTo(hbarX, hbarY + 1); g.strokePath();
    g.fillStyle(SKIN, 1); g.fillCircle(headX, headY, headR);
    g.fillStyle(JERSEY, 1); g.fillPoints([{ x: headX - headR + 1, y: headY }, { x: headX - headR + 1, y: headY - headR * 0.5 }, { x: headX, y: headY - headR - 2 }, { x: headX + headR, y: headY - headR * 0.5 }, { x: headX + headR, y: headY }], true);
  }

  private drawCyclist(): void {
    this.cyclistGraphics.clear();
    this.drawCyclistShape(this.cyclistGraphics, this.crankAngle, this.cycGroundY, 0x2a2018, 0x5a3a1a, 0xc49a6a);
  }

  private drawAllGhosts(): void {
    for (const ghost of this.ghosts) {
      const gapM = ghost.distanceM - this.distanceM;
      const alpha = Math.abs(gapM) < 80 ? 0.72 : Math.max(0, 0.72 * (1 - (Math.abs(gapM) - 80) / 170));
      ghost.graphics.setAlpha(alpha);
      if (alpha < 0.01) { ghost.graphics.clear(); continue; }
      const offsetX = Math.tanh(gapM / 120) * 280;
      ghost.graphics.setPosition(offsetX, 0).clear();
      this.drawCyclistShape(ghost.graphics, ghost.crankAngle, this.cycGroundY, ghost.racer.color, ghost.racer.color & 0xaaaaaa, 0xddeeff);
    }
  }

  /**
   * Draw animated speed lines in the wake of every leading rider that has a
   * trailer within draft range.  Lines fan out from behind the leader and
   * taper toward the trailing rider, scrolling at road speed.
   */
  private drawSlipstream(): void {
    const g = this.slipstreamGraphics.clear();
    const gY = this.cycGroundY;

    // All visible riders: player at offsetX=0, each ghost at its visual offset
    const riders = [
      { distanceM: this.distanceM, offsetX: 0 },
      ...this.ghosts.map(gh => ({
        distanceM: gh.distanceM,
        offsetX: Math.tanh((gh.distanceM - this.distanceM) / 120) * 280,
      })),
    ];

    for (let i = 0; i < riders.length; i++) {
      for (let j = 0; j < riders.length; j++) {
        if (i === j) continue;
        const trail = riders[i];
        const lead  = riders[j];
        const gap   = lead.distanceM - trail.distanceM;
        const df    = draftFactor(gap); // 0 if out of range
        if (df <= 0) continue;

        const trailX = trail.offsetX;
        const leadX  = lead.offsetX;
        if (leadX <= trailX + 4) continue; // no visual room

        // Normalised intensity 0→1 across the draft range
        const intensity = (df - DRAFT_MIN_CDA_REDUCTION) /
          (DRAFT_MAX_CDA_REDUCTION - DRAFT_MIN_CDA_REDUCTION);

        const span   = leadX - trailX;
        // Lines scroll from lead toward trail at ~road speed
        const scroll = this.draftAnimOffset % span;

        // 7 speed-line rows at different heights through the rider silhouette
        const rows: Array<{ y: number; thick: number; color: number; alphaMult: number }> = [
          { y: gY - 38, thick: 1.0, color: 0xcceeff, alphaMult: 0.40 },
          { y: gY - 32, thick: 1.5, color: 0xaaddff, alphaMult: 0.70 },
          { y: gY - 26, thick: 2.0, color: 0x88ccff, alphaMult: 1.00 },
          { y: gY - 20, thick: 2.5, color: 0x88ccff, alphaMult: 1.00 },
          { y: gY - 14, thick: 2.0, color: 0xaaddff, alphaMult: 0.80 },
          { y: gY -  8, thick: 1.5, color: 0xcceeff, alphaMult: 0.55 },
          { y: gY -  2, thick: 1.0, color: 0xddeeFF, alphaMult: 0.30 },
        ];

        // Number of lines scales with intensity (2 at minimum, 6 at full draft)
        const numLines = Math.round(2 + intensity * 4);
        const lineLen  = 12 + intensity * 20; // longer lines = stronger draft
        const spacing  = span / numLines;

        for (const row of rows) {
          const baseAlpha = 0.08 + 0.42 * intensity * row.alphaMult;
          for (let k = 0; k < numLines; k++) {
            // Position animated so lines stream from lead to trail
            const rawX = leadX - scroll - k * spacing;
            // Clamp to the gap zone
            if (rawX - lineLen < trailX - 4 || rawX > leadX + 4) continue;
            const x0 = Math.max(trailX, rawX - lineLen);
            const x1 = Math.min(leadX,  rawX);
            if (x1 <= x0) continue;
            // Taper: brighter near the leader, fading toward the trailer
            const t = (rawX - trailX) / span; // 0=near trailer, 1=near lead
            const lineAlpha = baseAlpha * (0.3 + 0.7 * t);
            g.lineStyle(row.thick, row.color, lineAlpha);
            g.beginPath().moveTo(x0, row.y).lineTo(x1, row.y).strokePath();
          }
        }
      }
    }
  }

  private updateDraftBadge(): void {
    if (this.ghosts.length === 0) return;
    const pct = Math.round(this.playerDraftFactor * 100); // already in 0–50 range
    if (pct <= 0) { this.draftBadgeBg.clear(); this.draftBadgeText.setAlpha(0); return; }
    const intensity = this.playerDraftFactor / DRAFT_MAX_CDA_REDUCTION; // 0–1 for visual scaling
    const cx = this.scale.width / 2, badgeY = 82, badgeW = 190, badgeH = 22;
    this.draftBadgeBg.clear().fillStyle(0x003322, 0.80).fillRect(cx - badgeW/2, badgeY, badgeW, badgeH).lineStyle(1, 0x00f5d4, 0.6 + 0.4 * intensity).strokeRect(cx - badgeW/2, badgeY, badgeW, badgeH);
    this.draftBadgeText.setPosition(cx, badgeY + badgeH/2).setText(`SLIPSTREAM  −${pct}% DRAG`).setAlpha(0.7 + 0.3 * intensity);
  }

  private updateAllGhostRacers(dt: number): void {
    const courseLen = this.course.totalDistanceM;
    for (const ghost of this.ghosts) {
      if (Math.abs(ghost.distanceM - this.distanceM) > courseLen * 0.75) {
        ghost.distanceM = Math.max(0, this.distanceM - 30);
        ghost.velocityMs = Math.max(this.smoothVelocityMs * 0.8, 1);
      }
      const wrapped = ghost.distanceM % courseLen;
      const grade = getGradeAtDistance(this.course, wrapped);
      const surface = getSurfaceAtDistance(this.course, wrapped);
      ghost.physics = { ...ghost.physics, grade, crr: ghost.racer.crr * (getCrrForSurface(surface) / CRR_BY_SURFACE['asphalt']) };

      let bestDraft = draftFactor(this.distanceM - ghost.distanceM); // player ahead?
      for (const other of this.ghosts) {
        if (other === ghost) continue;
        bestDraft = Math.max(bestDraft, draftFactor(other.distanceM - ghost.distanceM));
      }
      ghost.draftFactor = bestDraft;
      const accel = calculateAcceleration(ghost.racer.powerW, ghost.velocityMs, { ...ghost.physics, cdA: ghost.physics.cdA * (1 - ghost.draftFactor) });
      ghost.velocityMs = Math.max(0, ghost.velocityMs + accel * dt);
      const prevDist = ghost.distanceM;
      ghost.distanceM += ghost.velocityMs * dt;

      if (ghost.finishedTime === null && prevDist < courseLen && ghost.distanceM >= courseLen) {
        ghost.finishedTime = Date.now();
        if (this.firstGhostFinishedTime === null) {
          this.firstGhostFinishedTime = ghost.finishedTime;
          this.notifTitle.setText('RIVAL FINISHED!').setColor(ghost.racer.hexColor);
          this.notifSub.setText(`${ghost.racer.displayName} crossed the line first`);
          if (this.notifTween) this.notifTween.stop();
          this.notifContainer.setAlpha(1);
          this.notifTween = this.tweens.add({ targets: this.notifContainer, alpha: 0, delay: 3000, duration: 800, ease: 'Power2' });
        }
      }
    }
  }

  // ── Race gap panel ────────────────────────────────────────────────────────

  private buildRaceGapPanel(): void {
    this.raceGapBg = this.add.graphics().setDepth(12);
    this.raceGapLabel = this.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: '8px', color: '#888899', letterSpacing: 2 }).setDepth(13).setOrigin(1, 0);
    this.raceGapText = this.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: '14px', fontStyle: 'bold', color: '#ffffff' }).setDepth(13).setOrigin(1, 0);
    if (this.ghosts.length === 0) { this.raceGapBg.setVisible(false); this.raceGapLabel.setVisible(false); this.raceGapText.setVisible(false); }
  }

  private updateRaceGapPanel(): void {
    if (this.ghosts.length === 0) return;
    const w = this.scale.width, px = w - 8, py = 75, panW = 160, panH = 36;
    let nearest = this.ghosts[0], nearestGap = nearest.distanceM - this.distanceM;
    for (const gh of this.ghosts) { const gap = gh.distanceM - this.distanceM; if (Math.abs(gap) < Math.abs(nearestGap)) { nearest = gh; nearestGap = gap; } }
    this.raceGapBg.clear().fillStyle(0x0a0a1a, 0.80).fillRect(px - panW, py, panW, panH).lineStyle(1, nearest.racer.accentColor, 0.6).strokeRect(px - panW, py, panW, panH);
    const absGap = Math.abs(nearestGap);
    const distStr = absGap < 1000 ? `${absGap.toFixed(0)} m` : `${(absGap / 1000).toFixed(2)} km`;
    const gapStr = absGap <= 1 ? '─ NECK & NECK' : nearestGap > 0 ? `▲ ${distStr} AHEAD` : `▼ ${distStr} BEHIND`;
    const gapColor = absGap <= 1 ? '#ffffff' : nearestGap > 0 ? nearest.racer.accentHex : THEME.colors.text.accent;
    const ahead = this.ghosts.filter(gh => gh.distanceM > this.distanceM).length;
    this.raceGapLabel.setPosition(px - 6, py + 5).setText(this.ghosts.length > 1 ? `RIVALS  ${ahead}/${this.ghosts.length} AHEAD` : nearest.racer.displayName);
    this.raceGapText.setPosition(px - 6, py + 17).setText(gapStr).setColor(gapColor);
  }

  // ── Challenge status panel ────────────────────────────────────────────────

  private buildChallengePanel(): void {
    const PANEL_Y = 70, depth = 12;
    this.challengePanel = this.add.graphics().setDepth(depth);
    this.challengePanelTitle = this.add.text(10, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: '9px', color: THEME.colors.text.gold, letterSpacing: 2 }).setDepth(depth + 1);
    this.challengePanelValue = this.add.text(this.scale.width / 2, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(depth + 1);
    this.challengePanelTarget = this.add.text(this.scale.width - 10, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: '9px', color: '#aaaaaa' }).setOrigin(1, 0).setDepth(depth + 1);
    this.challengePanelBar = this.add.graphics().setDepth(depth + 1);
    if (!this.activeChallenge) {
      this.challengePanel.setVisible(false); this.challengePanelTitle.setVisible(false); this.challengePanelValue.setVisible(false); this.challengePanelTarget.setVisible(false); this.challengePanelBar.setVisible(false);
    }
  }

  private updateChallengePanel(): void {
    if (!this.activeChallenge) return;
    const PANEL_Y = 70, PANEL_H = 38, BAR_H = 4, BAR_Y = PANEL_Y + PANEL_H - BAR_H - 2, w = this.scale.width;
    const cond = this.activeChallenge.condition;
    this.challengePanelTitle.setText(`★ ${this.activeChallenge.title.toUpperCase()}`);
    let current = 0, target = 0, valueLabel = '', isTimeBased = false;

    if (cond.type === 'avg_power_above_ftp_pct') {
      const liveRecs = this.fitWriter.recordCount - this.edgeStartRecordCount;
      current = Math.round(liveRecs > 0 ? this.recordedPowerSum / liveRecs : this.latestPower);
      target = Math.round(this.effectiveFtpW * (cond.ftpMultiplier ?? 1));
      valueLabel = `AVG: ${current} W  →  TARGET: ${target} W`;
    } else if (cond.type === 'peak_power_above_ftp_pct') {
      current = Math.round(this.peakPowerW);
      target = Math.round(this.effectiveFtpW * (cond.ftpMultiplier ?? 1));
      valueLabel = `PEAK: ${current} W  →  TARGET: ${target} W`;
    } else if (cond.type === 'complete_no_stop') {
      const clean = !this.challengeEverStopped;
      this.challengePanelValue.setText(clean ? 'KEEP MOVING' : '✗ STOPPED').setColor(clean ? THEME.colors.text.accent : THEME.colors.text.danger);
      this.challengePanelBar.clear().fillStyle(clean ? 0x00f5d4 : 0xff4455, 0.7).fillRect(0, BAR_Y, clean ? w : w * 0.15, BAR_H);
      return;
    } else if (cond.type === 'time_under_seconds') {
      const elapsedSec = (Date.now() - this.challengeStartMs) / 1000;
      const limit = cond.timeLimitSeconds ?? 180;
      current = Math.round(elapsedSec); target = limit; isTimeBased = true;
      const remaining = Math.max(0, limit - elapsedSec);
      valueLabel = `TIME LEFT: ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}  →  LIMIT: ${Math.floor(limit/60)}:${String(limit%60).padStart(2,'0')}`;
    }

    this.challengePanelValue.setText(valueLabel).setStyle({ fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ffffff', fontStyle: 'bold' });
    this.challengePanelTarget.setText(this.activeChallenge.reward.description.toUpperCase());
    const ratio = isTimeBased ? Math.max(0, Math.min(1, 1 - current / target)) : target > 0 ? Math.min(1, current / target) : 0;
    const passing = isTimeBased ? current < target : current >= target;
    this.challengePanelBar.clear().fillStyle(0x333344, 1).fillRect(0, BAR_Y, w, BAR_H).fillStyle(passing ? 0x00f5d4 : 0xffaa00, 0.85).fillRect(0, BAR_Y, Math.round(w * ratio), BAR_H);
    if (!isTimeBased) this.challengePanelBar.fillStyle(0xffffff, 0.6).fillRect(w - 2, BAR_Y, 2, BAR_H);
  }

  // ── Bottom controls ───────────────────────────────────────────────────────

  private buildBottomControls(): void {
    this.bottomStrip = this.add.graphics().setDepth(10);
    this.statusDot = this.add.arc(0, 0, 5, 0, 360, false, 0x555566).setDepth(11);
    this.statusLabel = this.add.text(0, 0, 'DISCONNECTED', { fontFamily: THEME.fonts.main, fontSize: '11px', color: '#8888aa' }).setOrigin(0, 0.5).setDepth(11);

    this.btnMenu = new Button(this, {
      x: 0, y: 0, width: 120, height: 34,
      text: 'PAUSE',
      color: THEME.colors.buttons.primary,
      hoverColor: THEME.colors.buttons.primaryHover,
      textColor: '#ffffff',
      onClick: () => {
        this.showPauseOverlay();
      },
    });
    this.btnMenu.setDepth(11);
  }

  private buildRemoteButton(): void {
    const x = this.scale.width - 40;
    this.btnRemote = this.add.text(x, 40, 'CONNECTING...', {
      fontFamily: THEME.fonts.main,
      fontSize: '20px',
      fontStyle: 'bold',
      color: THEME.colors.text.accent,
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);

    this.btnRemote.on('pointerdown', () => {
      const code = RemoteService.getInstance().getRoomCode();
      if (code) {
        new RemotePairingOverlay(this, code, () => {});
      }
    });
  }

  public setFtp(w: number): void {
    this.ftpW = w;
    this.updateChallengePanel();
    if (this.trainer instanceof MockTrainerService) {
      this.trainer.setPower(w);
      this.setStatus('demo', `SIM ${w}W`);
    }
  }

  private setStatus(state: 'ok' | 'demo' | 'off' | 'err', label: string): void {
    const col = THEME.colors.status[state] ?? 0x555566;
    const hex = '#' + col.toString(16).padStart(6, '0');
    this.statusDot.setFillStyle(col);
    this.statusLabel.setText(label).setColor(hex);
  }

  private handleData(data: Partial<TrainerData>): void {
    if (!this.sys.isActive()) return;
    if (data.instantaneousPower !== undefined) {
      this.rawPower = data.instantaneousPower;
      this.updatePowerDisplay();
    }
    if (data.instantaneousCadence !== undefined) {
      this.hud.updateCadence(data.instantaneousCadence);
      const ts = Date.now();
      this.cadenceHistory.push({ rpm: data.instantaneousCadence, timeMs: ts });
      const cutoff = ts - 3000;
      this.cadenceHistory = this.cadenceHistory.filter((h) => h.timeMs > cutoff);
    }
  }

  private handleHrmData(data: HeartRateData): void {
    if (!this.sys.isActive()) return;
    this.currentHR = Math.round(data.bpm);
    this.hud.updateHR(this.currentHR);
  }

  private randomizeDemoMetrics(): void {
    if (this.trainer instanceof MockTrainerService) {
      const power   = Math.round(150 + Math.random() * 200);
      const cadence = Math.round(70  + Math.random() * 40);
      this.trainer.setPower(power);
      this.trainer.setCadence(cadence);
    }
  }

  private buildManualEffectButtons(): void {
    const x = 860;
    this.btnHeadwind = this.add.rectangle(x, 120, 100, 34, 0x444444).setInteractive({ useHandCursor: true }).setDepth(15);
    this.btnHeadwindLabel = this.add.text(x, 120, 'HEADWIND', { fontFamily: THEME.fonts.main, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5).setDepth(16);
    this.btnTailwind = this.add.rectangle(x, 170, 100, 34, 0x444444).setInteractive({ useHandCursor: true }).setDepth(15);
    this.btnTailwindLabel = this.add.text(x, 170, 'TAILWIND', { fontFamily: THEME.fonts.main, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5).setDepth(16);
    this.btnHeadwind.on('pointerdown', () => this.toggleEffect('headwind'));
    this.btnTailwind.on('pointerdown', () => this.toggleEffect('tailwind'));
    this.updateEffectButtonStyles();
  }

  private toggleEffect(type: EffectType): void {
    if (this.activeEffect?.type === type) { this.clearEffect(); } else { this.triggerEffect(type); }
    this.updateEffectButtonStyles();
  }

  private updateEffectButtonStyles(): void {
    const isHead = this.activeEffect?.type === 'headwind';
    const isTail = this.activeEffect?.type === 'tailwind';
    this.btnHeadwind.setFillStyle(isHead ? 0xff5544 : 0x444444);
    this.btnTailwind.setFillStyle(isTail ? 0xffcc00 : 0x444444);
  }

  private buildEffectUI(): void {
    const cx = 860, cy = 230;
    this.effectContainer = this.add.container(cx, cy).setDepth(15).setAlpha(0);
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x000000, 0.65);
    bgGfx.fillCircle(0, 0, 42);
    this.effectContainer.add(bgGfx);
    this.effectNameText = this.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: '11px', fontStyle: 'bold', color: '#ffffff', align: 'center' }).setOrigin(0.5);
    this.effectContainer.add(this.effectNameText);

    this.notifContainer = this.add.container(W / 2, 200).setDepth(20).setAlpha(0);
    const notifBg = this.add.graphics();
    notifBg.fillStyle(0x000000, 0.80);
    notifBg.fillRect(-175, -38, 350, 76);
    this.notifContainer.add(notifBg);
    this.notifTitle = this.add.text(0, -12, '', { fontFamily: THEME.fonts.main, fontSize: '26px', fontStyle: 'bold', color: '#ffffff', align: 'center' }).setOrigin(0.5);
    this.notifContainer.add(this.notifTitle);
    this.notifSub = this.add.text(0, 18, '', { fontFamily: THEME.fonts.main, fontSize: '11px', color: '#cccccc', align: 'center', letterSpacing: 2 }).setOrigin(0.5);
    this.notifContainer.add(this.notifSub);
  }

  private triggerEffect(type: EffectType): void {
    const meta = EFFECT_META[type];
    this.activeEffect = { type };
    this.effectContainer.setAlpha(1);
    this.effectNameText.setText(type === 'headwind' ? 'ACTIVE:\nHEADWIND' : 'ACTIVE:\nTAILWIND').setColor(meta.hexColor);
    this.notifTitle.setText(meta.label + '!').setColor(meta.hexColor);
    this.notifSub.setText(`x${meta.multiplier} POWER MULTIPLIER`);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.tweens.add({ targets: this.notifContainer, alpha: 0, delay: 2000, duration: 500, ease: 'Power2' });
    this.updatePowerDisplay();
  }

  private showSurfaceNotification(surface: SurfaceType): void {
    const sub = surface === 'asphalt' ? 'BACK ON SMOOTH ROAD' : `+${Math.round((getCrrForSurface(surface) / getCrrForSurface('asphalt') - 1) * 100)}% ROLLING RESISTANCE`;
    this.notifTitle.setText(SURFACE_LABELS[surface]).setColor(THEME.colors.surfaces[surface] ? '#' + THEME.colors.surfaces[surface].toString(16) : '#aaaaaa');
    this.notifSub.setText(sub);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.tweens.add({ targets: this.notifContainer, alpha: 0, delay: 2000, duration: 500, ease: 'Power2' });
  }

  private clearEffect(): void {
    this.activeEffect = null;
    this.effectContainer.setAlpha(0);
    this.updatePowerDisplay();
  }

  private updatePowerDisplay(): void {
    const effectMult = this.activeEffect ? EFFECT_META[this.activeEffect.type].multiplier : 1;
    const net = Math.round(this.rawPower * effectMult * this.runModifiers.powerMult);
    this.latestPower = net;
    this.hud.updatePower(
      net,
      this.rawPower,
      !!this.activeEffect,
      this.activeEffect ? EFFECT_META[this.activeEffect.type].hexColor : undefined
    );
  }

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
    this.recordedPowerSum   += this.latestPower;
    this.recordedSpeedSum   += rec.speedMs;
    this.recordedCadenceSum += rec.cadenceRpm;
    if (this.latestPower > this.peakPowerW) this.peakPowerW = this.latestPower;
    if (rec.speedMs <= 0) this.challengeEverStopped = true;
  }

  private getCurrentAltitude(): number {
    // Basic approximation if elevation samples unavailable
    return 0;
  }

  private showRideEndOverlay(completed: boolean): void {
    this.overlayVisible = true;

    // Gather Stats
    const elapsedMs = Date.now() - this.rideStartTime;
    const recs = this.fitWriter.recordCount - this.edgeStartRecordCount;
    const avgPow = recs > 0 ? Math.round(this.recordedPowerSum / recs) : Math.round(this.rawPower);
    const avgSpdMs = recs > 0 ? this.recordedSpeedSum / recs : this.smoothVelocityMs;
    const segElevM = this.course.segments.reduce((sum, seg) => sum + (seg.grade > 0 ? seg.distanceM * seg.grade : 0), 0);

    const stats: RideStats = {
      distanceM: this.distanceM,
      elapsedMs,
      avgPowerW: avgPow,
      avgSpeedMs: avgSpdMs,
      elevGainM: segElevM,
    };

    // Boss results
    if (this.ghosts.length > 0 && completed) {
      const playerFinishedFirst = this.firstGhostFinishedTime === null || this.ghosts.every(gh => gh.distanceM < this.course.totalDistanceM);
      stats.bossResult = {
        playerWon: playerFinishedFirst,
        finishedCount: this.ghosts.filter(gh => gh.finishedTime !== null).length,
        totalCount: this.ghosts.length
      };
    }

    let isFinishNode = false;

    // Roguelike Logic
    if (this.isRoguelike && completed) {
      const isFirstClear = RunStateManager.completeActiveEdge();
      RunStateManager.recordSegmentStats(this.distanceM, recs, this.recordedPowerSum, this.recordedCadenceSum);
      stats.isNewClear = isFirstClear;

      if (isFirstClear) {
        let gradeSum = 0;
        let crrSum = 0;
        this.course.segments.forEach(seg => {
          gradeSum += Math.max(0, seg.grade);
          crrSum += getCrrForSurface(seg.surface) / getCrrForSurface('asphalt');
        });

        const avgGrade = gradeSum / this.course.segments.length;
        const avgCrrMult = crrSum / this.course.segments.length;
        const gold = Math.round(50 + (avgGrade * 100 * 10) + (avgCrrMult - 1) * 50);

        RunStateManager.addGold(gold);
        stats.goldEarned = gold;

        if (this.activeChallenge) {
          const challengeAvgPow = recs > 0 ? this.recordedPowerSum / recs : 0;
          const elapsedSec = (Date.now() - this.challengeStartMs) / 1000;
          const passed = evaluateChallenge(this.activeChallenge, {
            avgPowerW: challengeAvgPow,
            peakPowerW: this.peakPowerW,
            ftpW: this.effectiveFtpW,
            everStopped: this.challengeEverStopped,
            elapsedSeconds: elapsedSec,
          });

          if (passed) {
            grantChallengeReward(this.activeChallenge);
            stats.challengeResult = { success: true, reward: this.activeChallenge.reward.description.toUpperCase() };
          } else {
            stats.challengeResult = { success: false, reward: '' };
          }
        }
      }

      const run = RunStateManager.getRun();
      const currentNode = run ? run.nodes.find(n => n.id === run.currentNodeId) : undefined;
      isFinishNode = currentNode?.type === 'finish';

      // Boss Logic: Prepare Reward Text (Items are awarded via showBossReward)
      if (currentNode?.type === 'boss' && currentNode.metadata?.spokeId && stats.bossResult?.playerWon) {
        const spokeId = currentNode.metadata.spokeId;
        const medalId = `medal_${spokeId}`;

        if (run && !run.inventory.includes(medalId)) {
          let rewardText = `${spokeId.toUpperCase()} MEDAL`;

          // Check Key for the next spoke
          let keyId: string | null = null;
          if (spokeId === 'plains') keyId = 'ferry_token';
          else if (spokeId === 'coast') keyId = 'funicular_ticket';
          else if (spokeId === 'mountain') keyId = 'trail_machete';

          if (keyId && !run.inventory.includes(keyId)) {
            const keyName = keyId.replace('_', ' ').toUpperCase();
            rewardText += ` + ${keyName}`;
          }

          stats.challengeResult = { success: true, reward: rewardText };
        }
      }

      // First-clear non-finish: skip stats panel and show combined reward screen
      if (isFirstClear && !isFinishNode) {
        if (currentNode?.type === 'boss' && currentNode.metadata?.spokeId && stats.bossResult?.playerWon) {
          this.showBossReward(stats, currentNode.metadata.spokeId);
          return;
        } else if (currentNode?.type !== 'boss') {
          this.showRewardSelection(stats);
          return;
        }
      }
    }

    this.rideOverlay = new RideOverlay(
      this,
      stats,
      this.units,
      this.isRoguelike,
      completed,
      isFinishNode,
      this.isRealTrainer,
      () => {
        if (isFinishNode) {
          this.scene.start('VictoryScene');
        } else {
          const run = RunStateManager.getRun();
          const currentNode = run?.nodes.find(n => n.id === run?.currentNodeId);
          if (currentNode?.type === 'boss') {
             RunStateManager.returnToHub();
          }
          this.scene.start('MapScene');
        }
      },
      () => {
        this.downloadFit();
        this.scene.start('MenuScene');
      },
      () => {
        this.scene.start('MenuScene');
      }
    );
  }

  private showBossReward(stats: RideStats, spokeId: string): void {
    const medalId = `medal_${spokeId}`;
    let keyId: string | null = null;
    if (spokeId === 'plains') keyId = 'ferry_token';
    else if (spokeId === 'coast') keyId = 'funicular_ticket';
    else if (spokeId === 'mountain') keyId = 'trail_machete';

    const reward: RewardDefinition = {
      id: medalId,
      label: `item.${medalId}`,
      description: keyId ? `item.${keyId}` : 'reward.champion_victory',
      rarity: 'rare',
      apply: () => {
        const run = RunStateManager.getRun();
        if (run && !run.inventory.includes(medalId)) {
            RunStateManager.addToInventory(medalId);
        }
        if (run && keyId && !run.inventory.includes(keyId)) {
            RunStateManager.addToInventory(keyId);
        }
      }
    };

    new RewardOverlay(
      this,
      [reward],
      (picked) => {
        picked.apply();
        RunStateManager.returnToHub();
        this.scene.start('MapScene');
      },
      null,
      { stats, units: this.units }
    );
  }

  private showRewardSelection(initialStats?: RideStats): void {
    const goToMap = () => {
      this.scene.start('MapScene');
    };

    const showOverlay = (headerStats?: RideStats) => {
      const run = RunStateManager.getRun();
      const rerollCount = run?.inventory.filter(i => i === 'reroll_voucher').length ?? 0;
      const picks = pickRewards(3);

      const overlay = new RewardOverlay(
        this,
        picks,
        (reward) => {
          reward.apply();
          overlay.destroy();
          goToMap();
        },
        rerollCount > 0 ? () => {
          RunStateManager.removeFromInventory('reroll_voucher');
          overlay.destroy();
          // On reroll, drop the stats header so focus stays on the new cards
          showOverlay();
        } : null,
        headerStats ? { stats: headerStats, units: this.units } : undefined,
      );
    };

    showOverlay(initialStats);
  }

  private downloadFit(): void {
    const bytes = this.fitWriter.export();
    const blob  = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const date  = new Date(this.rideStartTime).toISOString().slice(0, 10);
    a.href     = url;
    a.download = `spokes-${date}.fit`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private buildDevToggle(): void {
    const on = this.isDevMode;
    const bg = this.add.rectangle(70, 20, 130, 26, on ? 0x224422 : 0x333333)
      .setScrollFactor(0).setDepth(50).setInteractive({ useHandCursor: true });
    const txt = this.add.text(70, 20, on ? 'DEV MODE: ON' : 'DEV MODE: OFF', {
      fontFamily: THEME.fonts.main, fontSize: '11px',
      color: on ? '#00ff00' : '#aaaaaa', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    bg.on('pointerdown', () => {
      this.isDevMode = !this.isDevMode;
      RunStateManager.setDevMode(this.isDevMode);
      bg.setFillStyle(this.isDevMode ? 0x224422 : 0x333333);
      txt.setText(this.isDevMode ? 'DEV MODE: ON' : 'DEV MODE: OFF');
      txt.setColor(this.isDevMode ? '#00ff00' : '#aaaaaa');
      if (this.trainer instanceof MockTrainerService) {
        if (this.isDevMode) {
          this.trainer.setPower(DEV_POWER_WATTS);
          this.setStatus('demo', `DEV (${DEV_POWER_WATTS}W)`);
        } else {
          this.trainer.setPower(DEMO_POWER_WATTS);
          this.setStatus('demo', 'SIM 200W');
        }
      }
    });
    bg.on('pointerover', () => bg.setFillStyle(this.isDevMode ? 0x336633 : 0x555555));
    bg.on('pointerout',  () => bg.setFillStyle(this.isDevMode ? 0x224422 : 0x333333));
  }

  private showPauseOverlay(): void {
    if (this.activePauseOverlay) return;
    this.overlayVisible = true;
    this.activePauseOverlay = new PauseOverlay(this, {
      onResume: () => {
        this.overlayVisible = false;
        this.activePauseOverlay = null;
        RemoteService.getInstance().sendResumeState();
      },
      onBackToMap: () => {
        this.overlayVisible = false;
        this.activePauseOverlay = null;
        if (this.isRoguelike) {
          this.scene.start('MapScene');
        } else {
          // Non-roguelike: no map to return to, go to menu
          this.scene.start('MenuScene');
        }
      },
      onQuit: () => {
        this.scene.start('MenuScene');
      }
    }, this.ftpW, this.isRoguelike);

    // Tell the remote the game is paused so it can show the pause screen
    const run = RunStateManager.getRun();
    RemoteService.getInstance().sendPauseState({
      inventory: run?.inventory ?? [],
      equipped: (run?.equipped ?? {}) as Record<string, string>,
      modifiers: this.runModifiers,
      modifierLog: run?.modifierLog ?? [],
      ftpW: this.ftpW,
      gold: run?.gold ?? 0,
      isRoguelike: this.isRoguelike,
    });
  }

  private onRemotePause(): void {
    if (!this.activePauseOverlay) {
      this.showPauseOverlay();
    }
  }

  private onRemoteCursorMove(dir: CursorDirection): void {
    if (this.activePauseOverlay) {
      this.activePauseOverlay.handleCursorMove(dir);
    }
  }

  private onRemoteCursorSelect(): void {
    if (this.activePauseOverlay) {
      this.activePauseOverlay.handleCursorSelect();
    }
  }

  private onRemoteUseItem(itemId: string): void {
    if (itemId === 'tailwind') {
      this.triggerEffect('tailwind');
    }
  }

  private onRemoteResume(): void {
    if (this.activePauseOverlay) {
      this.overlayVisible = false;
      this.activePauseOverlay.destroy();
      this.activePauseOverlay = null;
      RemoteService.getInstance().sendResumeState();
    }
  }

  private onRemoteBackToMap(): void {
    if (!this.activePauseOverlay) return;
    this.overlayVisible = false;
    this.activePauseOverlay.destroy();
    this.activePauseOverlay = null;
    if (this.isRoguelike) {
      this.scene.start('MapScene');
    } else {
      this.scene.start('MenuScene');
    }
  }

  private onRemoteSaveQuit(): void {
    if (!this.activePauseOverlay) return;
    this.overlayVisible = false;
    this.activePauseOverlay.destroy();
    this.activePauseOverlay = null;
    this.scene.start('MenuScene');
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    // Only disconnect mock trainers — real BT trainers persist in SessionService
    // across scenes and are cleaned up by MenuScene.create() when the player
    // returns to the main menu.
    if (this.trainer instanceof MockTrainerService) {
      this.trainer.disconnect();
    }
    RemoteService.getInstance().offUseItem(this.onRemoteUseItemBound);
    RemoteService.getInstance().offPause(this.onRemotePauseBound);
    RemoteService.getInstance().offCursorMove(this.onRemoteCursorMoveBound);
    RemoteService.getInstance().offCursorSelect(this.onRemoteCursorSelectBound);
    RemoteService.getInstance().offResume(this.onRemoteResumeBound);
    RemoteService.getInstance().offBackToMap(this.onRemoteBackToMapBound);
    RemoteService.getInstance().offSaveQuit(this.onRemoteSaveQuitBound);
    this.hud?.destroy();
    this.elevGraph?.destroy();
    this.rideOverlay?.destroy();
  }
}
