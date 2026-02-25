/**
 * GameScene.ts
 *
 * Primary Phaser 3 scene for Spokes.
 * Refactored to act as an orchestrator/controller.
 */

import Phaser from 'phaser';
import { FitWriter } from '../fit/FitWriter';
import type { RideRecord } from '../fit/FitWriter';
import type { ITrainerService, TrainerData } from '../services/hardware/ITrainerService';
import { MockTrainerService } from '../services/hardware/MockTrainerService';
import type { HeartRateData } from '../services/hardware/HeartRateService';
import type { CursorDirection } from '../network/RemoteService';
import type { RunManager, RunModifiers } from '../core/roguelike/RunManager';
import { ContentRegistry } from '../core/roguelike/registry/ContentRegistry';
import { ContentBootstrapper } from '../core/roguelike/content/ContentBootstrapper';
import { evaluateChallenge, grantChallengeReward, type EliteChallenge } from '../core/roguelike/EliteChallenge';
import type { RacerProfile } from '../core/race/RacerProfile';
import {
  calculateAcceleration,
  DEFAULT_PHYSICS,
  type PhysicsConfig,
} from '../core/physics/CyclistPhysics';
import {
  draftFactor,
  DRAFT_MAX_CDA_REDUCTION,
} from '../core/physics/DraftingPhysics';
import type { Units } from './MenuScene';
import {
  DEFAULT_COURSE,
  getGradeAtDistance,
  getSurfaceAtDistance,
  getCrrForSurface,
  CRR_BY_SURFACE,
  type CourseProfile,
  type SurfaceType,
} from '../core/course/CourseProfile';
import { THEME } from '../theme';
import { GameHUD } from '../ui/GameHUD';
import { ElevationGraph } from '../ui/ElevationGraph';
import { RideOverlay, type RideStats } from '../ui/overlay/RideOverlay';
import { RewardOverlay } from '../ui/overlay/RewardOverlay';
import { pickRewards } from '../core/roguelike/RewardPool';
import { PauseOverlay } from '../ui/overlay/PauseOverlay';
import { RemotePairingOverlay } from '../ui/overlay/RemotePairingOverlay';

// Visuals & UI Modules
import { ParallaxBackground } from '../rendering/ParallaxBackground';
import { CyclistRenderer, type RenderableGhost } from '../rendering/CyclistRenderer';
import { RaceGapPanel } from '../ui/RaceGapPanel';
import { ChallengePanel, type ChallengeStats } from '../ui/ChallengePanel';
import { BottomControls } from '../ui/BottomControls';
import { EnvironmentEffectsUI, type ActiveEffect, EFFECT_META } from '../ui/EnvironmentEffectsUI';
import type { SaveManager } from '../services/SaveManager';
import type { GameServices } from '../services/ServiceLocator';
import { RunManager as RunManagerClass } from '../core/roguelike/RunManager';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_LERP_RATE = 1.0;

interface GhostState {
  racer:        RacerProfile;
  distanceM:    number;
  velocityMs:   number;
  crankAngle:   number;
  physics:      PhysicsConfig;
  graphics:     Phaser.GameObjects.Graphics; // Visual resource managed here for now
  finishedTime: number | null;
  draftFactor:  number;
}

const W = 960;
const H = 540;
const ROAD_TOP_FRAC = 420 / H;
const DEMO_POWER_WATTS = 200;

// ─── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private units: Units = 'imperial';
  private weightKg = 75;
  private isRoguelike = false;
  private isBackwards = false;
  private ftpW = 200;
  private get effectiveFtpW(): number { return this.ftpW * this.runModifiers.powerMult; }
  private activeChallenge: EliteChallenge | null = null;

  private racerProfiles: RacerProfile[] = [];
  private ghosts: GhostState[] = [];
  private firstGhostFinishedTime: number | null = null;

  private playerDraftFactor = 0;
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
  private lastTrainerUpdateMs = 0;
  private lastSentSurface: SurfaceType | null = null;
  private smoothGrade = 0;

  private worldContainer!: Phaser.GameObjects.Container;
  private crankAngle = 0;
  private cadenceHistory: Array<{ rpm: number; timeMs: number }> = [];
  private avgCadence = 0;

  private activeEffect: ActiveEffect | null = null;
  private rawPower     = DEMO_POWER_WATTS;
  private runModifiers: RunModifiers = { powerMult: 1.0, dragReduction: 0.0, weightMult: 1.0, crrMult: 1.0 };

  // Sub-modules
  private parallaxBg!: ParallaxBackground;
  private cyclistRenderer!: CyclistRenderer;
  private raceGapPanel!: RaceGapPanel;
  private challengePanel!: ChallengePanel;
  private bottomControls!: BottomControls;
  private envEffectsUI!: EnvironmentEffectsUI;

  // UI Components
  private hud!: GameHUD;
  private elevGraph!: ElevationGraph;
  private rideOverlay: RideOverlay | null = null;
  private activePauseOverlay: PauseOverlay | null = null;

  private isRealTrainer = false;
  private rawTrainerSpeedMs: number = 0;

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

  private cycGroundY = 150;

  private lastStateUpdateMs = 0;
  private onRemoteUseItemBound = this.onRemoteUseItem.bind(this);
  private onRemotePauseBound = this.onRemotePause.bind(this);
  private onRemoteCursorMoveBound = this.onRemoteCursorMove.bind(this);
  private onRemoteCursorSelectBound = this.onRemoteCursorSelect.bind(this);
  private onRemoteResumeBound = this.onRemoteResume.bind(this);
  private onRemoteBackToMapBound = this.onRemoteBackToMap.bind(this);
  private onRemoteSaveQuitBound = this.onRemoteSaveQuit.bind(this);

  private runManager!: RunManager;
  private saveManager!: SaveManager;
  private services!: GameServices;

  constructor() {
    super({ key: 'GameScene' });
  }

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;

    if (this.worldContainer) {
      this.worldContainer.setPosition(cx, height / 2);
      this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);
      this.cycGroundY = height * (ROAD_TOP_FRAC - 0.5);
    }

    this.parallaxBg?.onResize(width, height);
    this.hud?.onResize(width);
    this.elevGraph?.onResize(width, height);
    this.bottomControls?.onResize(width, height);
    this.envEffectsUI?.onResize(width, height);
  }

  init(data?: {
    course?: CourseProfile;
    isRoguelike?: boolean;
    isBackwards?: boolean;
    activeChallenge?: EliteChallenge | null;
    racers?: RacerProfile[];
    racer?: RacerProfile | null;
  }): void {
    this.services = this.registry.get('services') as GameServices;
    if (!this.services) {
        throw new Error('GameServices not found in registry!');
    }
    const preConnectedTrainer = this.services.sessionService.trainer;
    const isRealTrainer = preConnectedTrainer && !(preConnectedTrainer instanceof MockTrainerService);
    const initialPower = isRealTrainer ? 0 : DEMO_POWER_WATTS;
    this.runManager = this.services.runManager;
    this.saveManager = this.services.saveManager;

    this.course = data?.course ?? DEFAULT_COURSE;
    this.units    = this.services.sessionService.units;
    this.weightKg = this.services.sessionService.weightKg;
    this.latestPower      = initialPower;
    this.rawPower         = initialPower;
    this.isRoguelike         = data?.isRoguelike ?? false;
    this.isBackwards         = data?.isBackwards ?? false;
    this.activeChallenge     = data?.activeChallenge ?? null;
    this.racerProfiles = data?.racers ?? (data?.racer ? [data.racer] : []);

    if (this.isRoguelike) {
        if (!this.runManager) {
             console.error('RunManager missing in roguelike mode');
             // Fallback registry
             const reg = this.registry.get('contentRegistry') ?? new ContentRegistry();
             if (!this.registry.get('contentRegistry')) ContentBootstrapper.bootstrap(reg);
             this.runManager = new RunManagerClass(reg);
        }
        this.ftpW = this.runManager.getRun()?.ftpW ?? 200;
    } else {
        // Non-roguelike mode still needs a run manager instance for some logic (or we refactor to not need it)
        // For now, create a dummy one with a registry.
        const reg = this.registry.get('contentRegistry') ?? new ContentRegistry();
        if (!this.registry.get('contentRegistry')) ContentBootstrapper.bootstrap(reg);
        this.runManager = new RunManagerClass(reg);
        this.ftpW = 200; // Default for demo
    }

    console.log(`[SPOKES] GameScene.init: isRoguelike=${this.isRoguelike} activeChallenge=${this.activeChallenge?.id ?? 'none'} racers=${this.racerProfiles.length} ftpW=${this.ftpW}`);

    const massKg = this.weightKg + 8;
    // Scale the aerodynamic profile dynamically from our known 114.3 kg (252 lb) calibrated baseline
    const cdA = 0.416 * Math.pow(this.weightKg / 114.3, 0.66);
    const crr = 0.0041; // Our calibrated Saris H3 baseline friction
    this.basePhysics = { ...DEFAULT_PHYSICS, massKg, cdA, crr };

    // Reset state
    this.distanceM        = 0;
    this.smoothVelocityMs = 0;
    this.currentGrade     = 0;
    this.currentSurface   = 'asphalt';
    this.smoothGrade      = 0;
    this.lastSentGrade       = -999;
    this.lastSentSurface     = null;
    this.lastTrainerUpdateMs = 0;
    this.latestPower      = initialPower;
    this.crankAngle       = 0;
    this.cadenceHistory   = [];
    this.avgCadence       = 0;
    this.rawPower         = initialPower;
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
      const run = this.runManager.getRun();
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

    // World Container
    this.worldContainer = this.add.container(W / 2, H / 2).setDepth(0);

    // Instantiate Visuals & UI
    this.parallaxBg = new ParallaxBackground(this, this.worldContainer);

    // Ghost States & Graphics (Visuals managed by Renderer, but objects held here for now)
    this.buildGhostStates();

    this.cyclistRenderer = new CyclistRenderer(this, this.worldContainer);

    // Draft Badge (UI overlay)
    this.draftBadgeBg = this.add.graphics().setDepth(15);
    this.draftBadgeText = this.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, fontStyle: 'bold', color: THEME.colors.text.accent, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(16).setAlpha(0);

    // Initial Physics Config
    this.currentGrade   = getGradeAtDistance(this.course, 0);
    this.currentSurface = getSurfaceAtDistance(this.course, 0);
    this.smoothGrade = this.currentGrade;
    this.physicsConfig = {
      ...this.basePhysics,
      grade: this.currentGrade,
      crr: this.basePhysics.crr * (getCrrForSurface(this.currentSurface) / CRR_BY_SURFACE['asphalt']) * (this.runModifiers.crrMult ?? 1),
    };
    this.parallaxBg.setSurface(this.currentSurface);

    this.worldContainer.rotation = -Math.atan(this.smoothGrade);
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    // HUD & UI
    this.hud = new GameHUD(this, this.units);
    this.elevGraph = new ElevationGraph(this, this.course, this.units, this.isBackwards);

    this.raceGapPanel = new RaceGapPanel(this);
    this.challengePanel = new ChallengePanel(this);

    this.envEffectsUI = new EnvironmentEffectsUI(this, (effect) => {
      this.activeEffect = effect;
      this.updatePowerDisplay();
    });

    this.bottomControls = new BottomControls(this,
      () => this.showPauseOverlay(),
      () => {
        const code = this.services.remoteService.getRoomCode();
        if (code) {
          new RemotePairingOverlay(this, code, () => {});
        }
      }
    );

    // Init Remote
    this.services.remoteService.initHost()
      .then((code) => {
        if (this.bottomControls && this.sys.isActive()) {
          this.bottomControls.setRemoteStatus(`CODE: ${code}`);
        }
      })
      .catch((err) => {
        console.error('Remote init failed', err);
        if (this.bottomControls && this.sys.isActive()) {
          this.bottomControls.setRemoteStatus('OFFLINE', THEME.colors.text.danger);
        }
      });

    this.scale.on('resize', this.onResize, this);
    this.onResize();

    // ── Trainer ─────────────────────────────────────────────────────────────
    this.services.sessionService.disconnectMock();
    const preConnectedTrainer = this.services.sessionService.trainer;

    if (preConnectedTrainer) {
      this.trainer = preConnectedTrainer;
      this.trainer.onData((data) => this.handleData(data));
      this.isDemoMode = false;
      this.isRealTrainer = true;
      if (this.isRoguelike) this.runManager.setRealTrainerRun(true);
      this.bottomControls.setStatus('ok', 'BT CONNECTED');
    } else {
      // SIM Mode
      const simPower = this.ftpW * 3;
      this.trainer = new MockTrainerService({ power: simPower, speed: 45, cadence: 80 });
      this.trainer.onData((data) => this.handleData(data));
      void this.trainer.connect();
      this.isDemoMode = false;
      this.bottomControls.setStatus('demo', `SIM ${simPower}W`);
    }

    const preConnectedHrm = this.services.sessionService.hrm;
    if (preConnectedHrm) {
      preConnectedHrm.onData((data) => this.handleHrmData(data));
    }

    if (this.isRoguelike) {
      const run = this.runManager.getRun();
      if (run && run.inventory.includes('tailwind')) {
        this.envEffectsUI.triggerEffect('tailwind');
      }
      this.runModifiers = this.runManager.getModifiers();
    }

    this.services.remoteService.onUseItem(this.onRemoteUseItemBound);
    this.services.remoteService.onPause(this.onRemotePauseBound);
    this.services.remoteService.onCursorMove(this.onRemoteCursorMoveBound);
    this.services.remoteService.onCursorSelect(this.onRemoteCursorSelectBound);
    this.services.remoteService.onResume(this.onRemoteResumeBound);
    this.services.remoteService.onBackToMap(this.onRemoteBackToMapBound);
    this.services.remoteService.onSaveQuit(this.onRemoteSaveQuitBound);
  }

  private buildGhostStates(): void {
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
  }

  update(_time: number, delta: number): void {
    if (this.overlayVisible) return;

    const nowMs = Date.now();
    if (nowMs - this.lastStateUpdateMs >= 250) {
      this.lastStateUpdateMs = nowMs;
      this.services.remoteService.sendStateUpdate({
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
      this.envEffectsUI.showSurfaceNotification(newSurface);
      this.parallaxBg.setSurface(newSurface);
    }

    if (gradeChanged || surfaceChanged) {
      this.physicsConfig = {
        ...this.basePhysics,
        grade: this.currentGrade,
        crr: this.basePhysics.crr * (getCrrForSurface(this.currentSurface) / CRR_BY_SURFACE['asphalt']) * (this.runModifiers.crrMult ?? 1),
      };
    }

    this.smoothGrade += (this.currentGrade - this.smoothGrade) * dt * GRADE_LERP_RATE;

    const rotationAngle = this.isBackwards ? Math.atan(this.smoothGrade) : -Math.atan(this.smoothGrade);
    this.worldContainer.rotation = rotationAngle;
    this.worldContainer.setScale(Math.sqrt(1 + this.smoothGrade * this.smoothGrade) * 1.02);

    const trainerGradeChanged = this.currentGrade !== this.lastSentGrade;
    const trainerSurfaceChanged = this.currentSurface !== this.lastSentSurface;
    const timeToPing = nowMs - this.lastTrainerUpdateMs > 2000;

    if (this.trainer.setSimulationParams && (trainerGradeChanged || trainerSurfaceChanged || timeToPing)) {
      this.lastSentGrade   = this.currentGrade;
      this.lastSentSurface = this.currentSurface;
      this.lastTrainerUpdateMs = nowMs;

      // The FTMS spec assumes a standard system mass (usually ~83kg).
      // We must scale the incline and friction so the trainer applies the correct torque for the player's actual weight.
      const assumedTrainerMass = 83;
      const massRatio = this.physicsConfig.massKg / assumedTrainerMass;

      const effectiveGrade = this.currentGrade * massRatio;
      const effectiveCrr = this.physicsConfig.crr * massRatio;
      // Scale CWA to force the trainer to clamp harder at high speeds
      const cwa = this.physicsConfig.cdA;
      // commented out to see if this feels better
      // const cwa = (0.5 * this.physicsConfig.rhoAir * this.physicsConfig.cdA);

      void this.trainer.setSimulationParams(effectiveGrade, effectiveCrr, cwa);
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
    if (this.isRealTrainer) {
      // Directly tie in-game speed to the physical flywheel's speed (bypassing virtual inertia)
      // We use a fast lerp to smooth out any Bluetooth packet jitter
      this.smoothVelocityMs += (this.rawTrainerSpeedMs - this.smoothVelocityMs) * dt * 5.0;
    } else {
      // Fallback to virtual acceleration for Mock Trainers
      const draftModifiers: RunModifiers = this.playerDraftFactor > 0
        ? { ...this.runModifiers, dragReduction: Math.min(0.99, this.runModifiers.dragReduction + this.playerDraftFactor) }
        : this.runModifiers;
      const acceleration = calculateAcceleration(this.latestPower, this.smoothVelocityMs, this.physicsConfig, draftModifiers);
      this.smoothVelocityMs += acceleration * dt;
    }

    if (this.smoothVelocityMs < 0) this.smoothVelocityMs = 0;

    // Parallax
    this.parallaxBg.update(this.smoothVelocityMs, this.isBackwards, dt);

    // Updates
    this.hud.updateSpeed(this.smoothVelocityMs);
    this.hud.updateDistance(this.distanceM);
    this.hud.updateGrade(this.smoothGrade);

    // Update Challenge Panel
    const challengeStats: ChallengeStats = {
      recordCount: this.fitWriter.recordCount,
      edgeStartRecordCount: this.edgeStartRecordCount,
      recordedPowerSum: this.recordedPowerSum,
      latestPower: this.latestPower,
      peakPowerW: this.peakPowerW,
      effectiveFtpW: this.effectiveFtpW,
      challengeEverStopped: this.challengeEverStopped,
      challengeStartMs: this.challengeStartMs,
    };
    this.challengePanel.update(this.activeChallenge, challengeStats);

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

    // Rendering
    this.cyclistRenderer.render(
      { distanceM: this.distanceM, crankAngle: this.crankAngle, draftAnimOffset: this.draftAnimOffset, isBackwards: this.isBackwards },
      this.ghosts as RenderableGhost[],
      this.cycGroundY
    );

    this.updateDraftBadge();

    const ghostsForGraph = this.ghosts.map(g => ({ distanceM: g.distanceM, color: g.racer.color, accentColor: g.racer.accentColor }));
    this.elevGraph.updateGraph(wrappedDist, this.smoothGrade, ghostsForGraph);
    this.raceGapPanel.update(this.distanceM, this.ghosts);
  }

  private updateDraftBadge(): void {
    if (this.ghosts.length === 0) return;
    const pct = Math.round(this.playerDraftFactor * 100);
    if (pct <= 0) { this.draftBadgeBg.clear(); this.draftBadgeText.setAlpha(0); return; }
    const intensity = this.playerDraftFactor / DRAFT_MAX_CDA_REDUCTION;
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

      let bestDraft = draftFactor(this.distanceM - ghost.distanceM);
      for (const other of this.ghosts) {
        if (other === ghost) continue;
        bestDraft = Math.max(bestDraft, draftFactor(other.distanceM - ghost.distanceM));
      }
      ghost.draftFactor = bestDraft;
      const accel = calculateAcceleration(ghost.racer.powerW, ghost.velocityMs, { ...ghost.physics, cdA: ghost.physics.cdA * (1 - ghost.draftFactor) });
      ghost.velocityMs = Math.max(0, ghost.velocityMs + accel * dt);
      const prevDist = ghost.distanceM;
      ghost.distanceM += ghost.velocityMs * dt;

      // Finish Logic (using EnvironmentEffectsUI for notification re-use? No, manual logic for now)
      if (ghost.finishedTime === null && prevDist < courseLen && ghost.distanceM >= courseLen) {
        ghost.finishedTime = Date.now();
        if (this.firstGhostFinishedTime === null) {
          this.firstGhostFinishedTime = ghost.finishedTime;
          this.envEffectsUI.showNotification(
            'RIVAL FINISHED!',
            `${ghost.racer.displayName} crossed the line first`,
            ghost.racer.hexColor
          );
        }
      }
    }
  }

  public setFtp(w: number): void {
    this.ftpW = w;
    // this.updateChallengePanel(); // Handled in update loop
    if (this.trainer instanceof MockTrainerService) {
      this.trainer.setPower(w);
      this.bottomControls.setStatus('demo', `SIM ${w}W`);
    }
  }

  private handleData(data: Partial<TrainerData>): void {
    if (!this.sys.isActive()) return;
    if (data.instantaneousPower !== undefined) {
      this.rawPower = data.instantaneousPower;
      this.updatePowerDisplay();
    }
    if (data.instantaneousSpeed !== undefined) {
      this.rawTrainerSpeedMs = data.instantaneousSpeed / 3.6; // Convert km/h to m/s
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
      console.log(`[SPOKES] GameScene ride complete: distanceM=${this.distanceM.toFixed(0)} recs=${recs} activeChallenge=${this.activeChallenge?.id ?? 'none'} ghosts=${this.ghosts.length}`);
      const isFirstClear = this.runManager.completeActiveEdge();
      console.log(`[SPOKES] completeActiveEdge returned isFirstClear=${isFirstClear}, currentNodeId=${this.runManager.getRun()?.currentNodeId}`);
      this.runManager.recordSegmentStats(this.distanceM, recs, this.recordedPowerSum, this.recordedCadenceSum);
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

        this.runManager.addGold(gold);
        stats.goldEarned = gold;

        if (this.activeChallenge) {
          const challengeAvgPow = recs > 0 ? this.recordedPowerSum / recs : 0;
          const elapsedSec = (Date.now() - this.challengeStartMs) / 1000;
          const metrics = {
            avgPowerW: challengeAvgPow,
            peakPowerW: this.peakPowerW,
            ftpW: this.effectiveFtpW,
            everStopped: this.challengeEverStopped,
            elapsedSeconds: elapsedSec,
          };
          console.log(`[SPOKES] Challenge eval: id=${this.activeChallenge.id} condition=${this.activeChallenge.condition.type} ftpMult=${this.activeChallenge.condition.ftpMultiplier} timeLimitS=${this.activeChallenge.condition.timeLimitSeconds}`, metrics);
          const passed = evaluateChallenge(this.activeChallenge, metrics);
          console.log(`[SPOKES] Challenge result: passed=${passed} reward=${this.activeChallenge.reward.description}`);

          if (passed) {
            grantChallengeReward(this.activeChallenge, this.runManager);
            stats.challengeResult = { success: true, reward: this.activeChallenge.reward.description.toUpperCase() };
          } else {
            stats.challengeResult = { success: false, reward: '' };
          }
        }
      }

      const run = this.runManager.getRun();
      const currentNode = run ? run.nodes.find(n => n.id === run.currentNodeId) : undefined;
      isFinishNode = currentNode?.type === 'finish';

      // Boss Logic: Award Medal & Unlock Key
      console.log(`[SPOKES] Boss medal check: currentNode=${currentNode?.id} type=${currentNode?.type} spokeId=${currentNode?.metadata?.spokeId} bossResult=${JSON.stringify(stats.bossResult)} ghosts=${this.ghosts.length}`);
      if (currentNode?.type === 'boss' && currentNode.metadata?.spokeId && stats.bossResult?.playerWon) {
        const spokeId = currentNode.metadata.spokeId;
        const medalId = `medal_${spokeId}`;

        if (run && !run.inventory.includes(medalId)) {
          this.runManager.addToInventory(medalId);

          let rewardText = `${spokeId.toUpperCase()} MEDAL`;

          // Award Key for the next spoke
          let keyId: string | null = null;
          if (spokeId === 'plains') keyId = 'ferry_token';
          else if (spokeId === 'coast') keyId = 'funicular_ticket';
          else if (spokeId === 'mountain') keyId = 'trail_machete';

          if (keyId && !run.inventory.includes(keyId)) {
            this.runManager.addToInventory(keyId);
            const keyName = keyId.replace('_', ' ').toUpperCase();
            rewardText += ` + ${keyName}`;
          }

          stats.challengeResult = { success: true, reward: rewardText };
        }
      }

      // Save progress
      if (this.saveManager) {
          this.saveManager.saveRun(this.runManager.exportData());
      }

      // First-clear non-finish: skip stats panel and show combined reward screen
      // EXCEPTION: Boss nodes don't give random rewards, they give a medal (handled above)
      if (isFirstClear && !isFinishNode && currentNode?.type !== 'boss') {
        this.showRewardSelection(stats);
        return;
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
          const run = this.runManager.getRun();
          const currentNode = run?.nodes.find(n => n.id === run?.currentNodeId);
          if (currentNode?.type === 'boss') {
             this.runManager.returnToHub();
             if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
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

  private showRewardSelection(initialStats?: RideStats): void {
    const goToMap = () => {
      this.scene.start('MapScene');
    };

    const showOverlay = (headerStats?: RideStats) => {
      const run = this.runManager.getRun();
      const rerollCount = run?.inventory.filter(i => i === 'reroll_voucher').length ?? 0;
      const picks = pickRewards(3, this.runManager);

      const overlay = new RewardOverlay(
        this,
        picks,
        (reward) => {
          reward.apply(this.runManager);
          if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
          overlay.destroy();
          goToMap();
        },
        rerollCount > 0 ? () => {
          this.runManager.removeFromInventory('reroll_voucher');
          if (this.saveManager) this.saveManager.saveRun(this.runManager.exportData());
          overlay.destroy();
          // On reroll, drop the stats header so focus stays on the new cards
          showOverlay();
        } : null,
        this.runManager,
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

  private showPauseOverlay(): void {
    if (this.activePauseOverlay) return;
    this.overlayVisible = true;
    this.activePauseOverlay = new PauseOverlay(this, {
      onResume: () => {
        this.overlayVisible = false;
        this.activePauseOverlay = null;
        this.services.remoteService.sendResumeState();
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
    }, this.ftpW, this.isRoguelike, this.runManager);

    // Tell the remote the game is paused so it can show the pause screen
    const run = this.runManager.getRun();
    this.services.remoteService.sendPauseState({
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
      this.envEffectsUI.triggerEffect('tailwind');
    }
  }

  private onRemoteResume(): void {
    if (this.activePauseOverlay) {
      this.overlayVisible = false;
      this.activePauseOverlay.destroy();
      this.activePauseOverlay = null;
      this.services.remoteService.sendResumeState();
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
    if (this.trainer instanceof MockTrainerService) {
      this.trainer.disconnect();
    }
    this.services.remoteService.offUseItem(this.onRemoteUseItemBound);
    this.services.remoteService.offPause(this.onRemotePauseBound);
    this.services.remoteService.offCursorMove(this.onRemoteCursorMoveBound);
    this.services.remoteService.offCursorSelect(this.onRemoteCursorSelectBound);
    this.services.remoteService.offResume(this.onRemoteResumeBound);
    this.services.remoteService.offBackToMap(this.onRemoteBackToMapBound);
    this.services.remoteService.offSaveQuit(this.onRemoteSaveQuitBound);
    this.hud?.destroy();
    this.elevGraph?.destroy();
    this.rideOverlay?.destroy();

    this.raceGapPanel?.destroy();
    this.challengePanel?.destroy();
  }
}
