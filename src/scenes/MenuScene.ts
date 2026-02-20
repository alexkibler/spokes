/**
 * MenuScene.ts
 *
 * Main menu for Paper Peloton.
 *
 * Lets the player:
 *   • Choose distance, rider weight, difficulty, and units
 *   • Connect a Bluetooth trainer (FTMS) before starting
 *   • Connect a Bluetooth heart rate monitor before starting
 *   • Launch a quick demo (easy mode, mock data) via QUICK DEMO
 *   • Launch a configured ride via START RIDE (uses BT trainer if connected)
 */

import Phaser from 'phaser';
import { generateCourseProfile, DEFAULT_COURSE } from '../course/CourseProfile';
import type { ITrainerService } from '../services/ITrainerService';
import { TrainerService } from '../services/TrainerService';
import { HeartRateService } from '../services/HeartRateService';

// ─── Units ────────────────────────────────────────────────────────────────────

export type Units = 'imperial' | 'metric';

const KG_TO_LB  = 2.20462;
const KM_TO_MI  = 0.621371;

// ─── Difficulty config ────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';

interface DiffConfig {
  label:    string;
  hint:     string;
  maxGrade: number;
  colorOn:  number;
  colorOff: number;
  colorHov: number;
}

const DIFF: Record<Difficulty, DiffConfig> = {
  easy:   { label: 'EASY',   hint: 'max +5% grade',  maxGrade: 0.05, colorOn: 0x1a7040, colorOff: 0x0e3d20, colorHov: 0x25a558 },
  medium: { label: 'MEDIUM', hint: 'max +10% grade', maxGrade: 0.10, colorOn: 0x8b5a00, colorOff: 0x4a3000, colorHov: 0xcc8800 },
  hard:   { label: 'HARD',   hint: 'max +15% grade', maxGrade: 0.15, colorOn: 0x8b2020, colorOff: 0x4a1010, colorHov: 0xcc3333 },
};

const DIFF_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

// ─── Distance config ──────────────────────────────────────────────────────────

const MIN_KM  =   5;
const MAX_KM  = 200;
const STEP_KM =   5;
const PRESETS = [10, 25, 50, 100, 150, 200];

// ─── Weight config ────────────────────────────────────────────────────────────

const MIN_KG            =  40;
const MAX_KG            = 130;
const DEFAULT_WEIGHT_KG =  75;

// ─── Scene ────────────────────────────────────────────────────────────────────

export class MenuScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private distanceKm = 50;
  private weightKg   = DEFAULT_WEIGHT_KG;
  private units: Units = 'imperial';

  private distText!: Phaser.GameObjects.Text;
  private weightText!: Phaser.GameObjects.Text;
  private weightInputField!: Phaser.GameObjects.Rectangle;
  private weightInputActive  = false;
  private weightInputStr     = '';
  private weightCursorMs     = 0;
  private weightCursorOn     = true;
  private ignoreNextGlobalClick = false;
  private diffBtns   = new Map<Difficulty, Phaser.GameObjects.Rectangle>();
  private unitsBtns  = new Map<Units, Phaser.GameObjects.Rectangle>();
  private presetLabels: Phaser.GameObjects.Text[] = [];

  // ── Device services (connected from menu, passed to GameScene) ────────────
  private trainerService: ITrainerService | null = null;
  private hrmService: HeartRateService | null = null;

  // Device status UI
  private trainerStatusDot!: Phaser.GameObjects.Arc;
  private trainerStatusLabel!: Phaser.GameObjects.Text;
  private hrmStatusDot!: Phaser.GameObjects.Arc;
  private hrmStatusLabel!: Phaser.GameObjects.Text;

  // ── UI containers ─────────────────────────────────────────────────────────
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private titleContainer!: Phaser.GameObjects.Container;
  private distSection!: Phaser.GameObjects.Container;
  private weightSection!: Phaser.GameObjects.Container;
  private unitsSection!: Phaser.GameObjects.Container;
  private diffSection!: Phaser.GameObjects.Container;
  private devicesSection!: Phaser.GameObjects.Container;
  private startBtnContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Reset device state each time the menu starts — the game scene disconnects
    // both services on shutdown, so we start fresh.
    this.trainerService = null;
    this.hrmService     = null;

    this.cameras.main.setBackgroundColor('#e8dcc8');
    this.bgGraphics = this.add.graphics();

    this.buildTitle();
    this.buildDistanceSection();
    this.buildWeightSection();
    this.buildUnitsSection();
    this.buildDifficultySection();
    this.buildDevicesSection();
    this.buildStartButton();

    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private onResize(): void {
    const width  = this.scale.width;
    const height = this.scale.height;
    const cx     = width / 2;

    this.drawBackground();

    if (this.titleContainer) this.titleContainer.setPosition(cx, 50);

    // Row 1: Distance | Weight | Units (centred)
    const middleY = 150;
    const distW   = 385;
    const weightW = 215;
    const unitsW  = 145;
    const gap     = 20;
    const totalW  = distW + weightW + unitsW + gap * 2;
    const startX  = cx - totalW / 2;

    if (this.distSection)   this.distSection.setPosition(startX, middleY);
    if (this.weightSection) this.weightSection.setPosition(startX + distW + gap, middleY);
    if (this.unitsSection)  this.unitsSection.setPosition(startX + distW + weightW + gap * 2, middleY);

    // Row 2: Difficulty (centred 620 px panel)
    if (this.diffSection) this.diffSection.setPosition(cx - 310, 298);

    // Row 3: Devices – sits just above the start buttons
    if (this.devicesSection) this.devicesSection.setPosition(cx - 310, height - 170);

    // Row 4: Start buttons
    if (this.startBtnContainer) this.startBtnContainer.setPosition(cx, height - 65);
  }

  update(_time: number, delta: number): void {
    if (!this.weightInputActive) return;
    this.weightCursorMs += delta;
    if (this.weightCursorMs >= 530) {
      this.weightCursorMs = 0;
      this.weightCursorOn = !this.weightCursorOn;
      this.showWeightInputDisplay();
    }
  }

  // ── Decorative background ──────────────────────────────────────────────────

  private drawBackground(): void {
    const g      = this.bgGraphics;
    const width  = this.scale.width;
    const height = this.scale.height;

    g.clear();

    // Far mountain silhouette
    g.fillStyle(0xcec0a8, 0.7);
    g.fillPoints([
      { x:   0,             y: height },
      { x:   0,             y: height * 0.60 },
      { x: width * 0.08,   y: height * 0.46 },
      { x: width * 0.20,   y: height * 0.57 },
      { x: width * 0.33,   y: height * 0.47 },
      { x: width * 0.46,   y: height * 0.59 },
      { x: width * 0.59,   y: height * 0.46 },
      { x: width * 0.71,   y: height * 0.53 },
      { x: width * 0.82,   y: height * 0.45 },
      { x: width * 0.92,   y: height * 0.51 },
      { x: width,           y: height * 0.48 },
      { x: width,           y: height },
    ], true);

    // Nearer hills
    g.fillStyle(0xb0a888, 0.45);
    g.fillPoints([
      { x:   0,             y: height },
      { x:   0,             y: height * 0.76 },
      { x: width * 0.13,   y: height * 0.71 },
      { x: width * 0.27,   y: height * 0.74 },
      { x: width * 0.41,   y: height * 0.69 },
      { x: width * 0.54,   y: height * 0.73 },
      { x: width * 0.68,   y: height * 0.70 },
      { x: width * 0.82,   y: height * 0.73 },
      { x: width * 0.94,   y: height * 0.71 },
      { x: width,           y: height * 0.73 },
      { x: width,           y: height },
    ], true);

    // Road strip at bottom
    g.fillStyle(0x9a8870, 0.35);
    g.fillRect(0, height - 44, width, 44);
  }

  // ── Title ──────────────────────────────────────────────────────────────────

  private buildTitle(): void {
    this.titleContainer = this.add.container(0, 50);

    const title = this.add.text(0, 0, 'PAPER PELOTON', {
      fontFamily: 'monospace',
      fontSize:   '52px',
      color:      '#2a2018',
      fontStyle:  'bold',
    }).setOrigin(0.5, 0);

    const subtitle = this.add.text(0, 66, 'CHOOSE YOUR RIDE', {
      fontFamily:    'monospace',
      fontSize:      '13px',
      color:         '#7a6850',
      letterSpacing: 5,
    }).setOrigin(0.5, 0);

    this.titleContainer.add([title, subtitle]);
  }

  // ── Distance selector ──────────────────────────────────────────────────────

  private buildDistanceSection(): void {
    const PW = 385; const PH = 132;
    const CX = PW / 2;
    const CY = PH / 2;

    this.distSection = this.add.container(0, 150);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.distSection.add(bg);

    const label = this.add.text(18, 10, 'DISTANCE', {
      fontFamily:    'monospace',
      fontSize:      '10px',
      color:         '#aaaaaa',
      letterSpacing: 3,
    });
    this.distSection.add(label);

    // Step buttons – addIconBtn now adds both the rect AND the text to the container
    this.addIconBtn(this.distSection, 58, CY - 12, 48, 38, '−', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.max(MIN_KM, this.distanceKm - STEP_KM);
      this.distText.setText(this.fmtDist(this.distanceKm));
    });
    this.addIconBtn(this.distSection, PW - 58, CY - 12, 48, 38, '+', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.min(MAX_KM, this.distanceKm + STEP_KM);
      this.distText.setText(this.fmtDist(this.distanceKm));
    });

    // Value display
    this.distText = this.add.text(CX, CY - 12, this.fmtDist(this.distanceKm), {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);
    this.distSection.add(this.distText);

    // Preset quick-select row
    const presetY = PH - 20;
    const btnW    = 56;
    const gap     = 7;
    const totalW  = PRESETS.length * btnW + (PRESETS.length - 1) * gap;
    const startX  = Math.round(CX - totalW / 2);

    this.presetLabels = [];
    PRESETS.forEach((km, i) => {
      const bx  = startX + i * (btnW + gap) + btnW / 2;
      const lbl = this.addIconBtn(
        this.distSection, bx, presetY, btnW, 22,
        this.fmtPreset(km), 0x3a3a8b, 0x5555bb,
        () => {
          this.distanceKm = km;
          this.distText.setText(this.fmtDist(km));
        },
        { fontSize: '11px', color: '#ccccff' },
      );
      this.presetLabels.push(lbl);
    });
  }

  // ── Weight selector ────────────────────────────────────────────────────────

  private buildWeightSection(): void {
    const PW = 215; const PH = 132;
    const CX = PW / 2;

    this.weightSection = this.add.container(0, 150);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.weightSection.add(bg);

    const label = this.add.text(18, 10, 'RIDER WEIGHT', {
      fontFamily:    'monospace',
      fontSize:      '10px',
      color:         '#aaaaaa',
      letterSpacing: 3,
    });
    this.weightSection.add(label);

    const FIELD_W = 180;
    const FIELD_H = 46;
    const fieldCY = 72;

    this.weightInputField = this.add
      .rectangle(CX, fieldCY, FIELD_W, FIELD_H, 0x1a1a3a)
      .setStrokeStyle(2, 0x3a3a8b, 0.8)
      .setInteractive({ useHandCursor: true });
    this.weightSection.add(this.weightInputField);

    this.weightText = this.add.text(CX, fieldCY, this.fmtWeight(this.weightKg), {
      fontFamily: 'monospace',
      fontSize:   '26px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);
    this.weightSection.add(this.weightText);

    const hint = this.add.text(CX, PH - 14, 'click to edit · enter to confirm', {
      fontFamily: 'monospace',
      fontSize:   '8px',
      color:      '#666677',
    }).setOrigin(0.5);
    this.weightSection.add(hint);

    this.weightInputField.on('pointerover', () => {
      if (!this.weightInputActive) this.weightInputField.setStrokeStyle(2, 0x5555cc, 1);
    });
    this.weightInputField.on('pointerout', () => {
      if (!this.weightInputActive) this.weightInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    });
    this.weightInputField.on('pointerdown', () => {
      this.ignoreNextGlobalClick = true;
      this.startWeightEdit();
    });

    this.input.on('pointerdown', () => {
      if (this.ignoreNextGlobalClick) { this.ignoreNextGlobalClick = false; return; }
      if (this.weightInputActive) this.commitWeightEdit();
    });

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (!this.weightInputActive) return;
      if (event.key >= '0' && event.key <= '9') {
        if (this.weightInputStr.length < 4) {
          this.weightInputStr += event.key;
          this.weightCursorOn = true;
          this.weightCursorMs = 0;
          this.showWeightInputDisplay();
        }
      } else if (event.key === 'Backspace') {
        this.weightInputStr = this.weightInputStr.slice(0, -1);
        this.weightCursorOn = true;
        this.weightCursorMs = 0;
        this.showWeightInputDisplay();
      } else if (event.key === 'Enter' || event.key === 'Escape') {
        this.commitWeightEdit();
      }
    });
  }

  private startWeightEdit(): void {
    if (this.weightInputActive) return;
    this.weightInputActive = true;
    this.weightCursorMs    = 0;
    this.weightCursorOn    = true;
    const displayVal = this.units === 'imperial'
      ? Math.round(this.weightKg * KG_TO_LB)
      : this.weightKg;
    this.weightInputStr = String(displayVal);
    this.weightInputField.setStrokeStyle(2, 0x5588ff, 1);
    this.showWeightInputDisplay();
  }

  private commitWeightEdit(): void {
    if (!this.weightInputActive) return;
    this.weightInputActive = false;
    this.weightInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    const parsed = parseInt(this.weightInputStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const asKg = this.units === 'imperial'
        ? Math.round(parsed / KG_TO_LB)
        : parsed;
      this.weightKg = Math.max(MIN_KG, Math.min(MAX_KG, asKg));
    }
    this.weightText.setText(this.fmtWeight(this.weightKg));
  }

  private showWeightInputDisplay(): void {
    const cursor = this.weightCursorOn ? '|' : ' ';
    this.weightText.setText((this.weightInputStr || '0') + cursor);
  }

  // ── Difficulty selector ────────────────────────────────────────────────────

  private buildDifficultySection(): void {
    const PW = 620; const PH = 110;

    this.diffSection = this.add.container(0, 298);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.diffSection.add(bg);

    this.diffSection.add(this.add.text(18, 10, 'DIFFICULTY', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const BTN_Y = 68;
    const BTN_W = 155;
    const BTN_H = 44;
    const xs: Record<Difficulty, number> = { easy: 135, medium: 310, hard: 485 };

    DIFF_ORDER.forEach((diff) => {
      const { label, hint, colorOff } = DIFF[diff];
      const x = xs[diff];

      const btn = this.add
        .rectangle(x, BTN_Y, BTN_W, BTN_H, colorOff)
        .setInteractive({ useHandCursor: true });

      const btnLabel = this.add.text(x, BTN_Y, label, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
        fontStyle: 'bold', letterSpacing: 2,
      }).setOrigin(0.5);

      const hintText = this.add.text(x, BTN_Y + 30, hint, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888899', letterSpacing: 1,
      }).setOrigin(0.5);

      this.diffSection.add([btn, btnLabel, hintText]);
      this.diffBtns.set(diff, btn);

      btn.on('pointerdown', () => { this.difficulty = diff; this.refreshDiffStyles(); });
      btn.on('pointerover', () => { if (this.difficulty !== diff) btn.setFillStyle(DIFF[diff].colorHov); });
      btn.on('pointerout',  () => this.refreshDiffStyles());
    });

    this.refreshDiffStyles();
  }

  private refreshDiffStyles(): void {
    for (const [diff, btn] of this.diffBtns) {
      const { colorOn, colorOff } = DIFF[diff];
      const selected = diff === this.difficulty;
      btn.setFillStyle(selected ? colorOn : colorOff);
      btn.setStrokeStyle(selected ? 2 : 0, 0xffffff, selected ? 0.85 : 0);
    }
  }

  // ── Devices section ────────────────────────────────────────────────────────

  private buildDevicesSection(): void {
    const PW = 620;
    const PH = 80;

    this.devicesSection = this.add.container(0, 0); // positioned by onResize

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.devicesSection.add(bg);

    // ── Trainer (left half) ─────────────────────────────────────────────────

    this.devicesSection.add(this.add.text(18, 11, 'TRAINER', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const btnTrainer = this.add
      .rectangle(100, 50, 170, 32, 0x1a3a6b)
      .setInteractive({ useHandCursor: true });
    const btnTrainerTxt = this.add.text(100, 50, 'CONNECT BT', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);
    this.devicesSection.add([btnTrainer, btnTrainerTxt]);

    this.trainerStatusDot = this.add.arc(194, 50, 4, 0, 360, false, 0x555566);
    this.trainerStatusLabel = this.add.text(202, 50, 'DISCONNECTED', {
      fontFamily: 'monospace', fontSize: '10px', color: '#888899',
    }).setOrigin(0, 0.5);
    this.devicesSection.add([this.trainerStatusDot, this.trainerStatusLabel]);

    btnTrainer.on('pointerover', () => {
      if (!this.trainerService) btnTrainer.setFillStyle(0x2a5aaa);
    });
    btnTrainer.on('pointerout', () => {
      btnTrainer.setFillStyle(this.trainerService ? 0x1a5a3a : 0x1a3a6b);
    });
    btnTrainer.on('pointerdown', async () => {
      btnTrainer.setFillStyle(0x2a2a6b);
      btnTrainerTxt.setText('CONNECTING…');
      this.trainerStatusDot.setFillStyle(0x888888);
      this.trainerStatusLabel.setText('CONNECTING…').setColor('#888888');
      try {
        const svc = new TrainerService();
        await svc.connect();
        this.trainerService = svc;
        this.trainerStatusDot.setFillStyle(0x00ff88);
        this.trainerStatusLabel.setText('CONNECTED').setColor('#00ff88');
        btnTrainer.setFillStyle(0x1a5a3a);
        btnTrainerTxt.setText('RECONNECT BT');
      } catch {
        this.trainerService = null;
        this.trainerStatusDot.setFillStyle(0xff4444);
        this.trainerStatusLabel.setText('FAILED').setColor('#ff4444');
        btnTrainer.setFillStyle(0x1a3a6b);
        btnTrainerTxt.setText('CONNECT BT');
      }
    });

    // ── Heart Rate Monitor (right half) ────────────────────────────────────

    this.devicesSection.add(this.add.text(330, 11, 'HEART RATE', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const btnHrm = this.add
      .rectangle(430, 50, 160, 32, 0x3a1a5a)
      .setInteractive({ useHandCursor: true });
    const btnHrmTxt = this.add.text(430, 50, 'CONNECT HRM', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);
    this.devicesSection.add([btnHrm, btnHrmTxt]);

    this.hrmStatusDot = this.add.arc(515, 50, 4, 0, 360, false, 0x555566);
    this.hrmStatusLabel = this.add.text(523, 50, 'DISCONNECTED', {
      fontFamily: 'monospace', fontSize: '10px', color: '#888899',
    }).setOrigin(0, 0.5);
    this.devicesSection.add([this.hrmStatusDot, this.hrmStatusLabel]);

    btnHrm.on('pointerover', () => {
      if (!this.hrmService) btnHrm.setFillStyle(0x6a2a9b);
    });
    btnHrm.on('pointerout', () => {
      btnHrm.setFillStyle(this.hrmService ? 0x5a1a5a : 0x3a1a5a);
    });
    btnHrm.on('pointerdown', async () => {
      btnHrm.setFillStyle(0x4a1a8b);
      btnHrmTxt.setText('CONNECTING…');
      this.hrmStatusDot.setFillStyle(0x888888);
      this.hrmStatusLabel.setText('CONNECTING…').setColor('#888888');
      try {
        const svc = new HeartRateService();
        await svc.connect();
        this.hrmService = svc;
        this.hrmStatusDot.setFillStyle(0xff4488);
        this.hrmStatusLabel.setText('CONNECTED').setColor('#ff4488');
        btnHrm.setFillStyle(0x5a1a5a);
        btnHrmTxt.setText('RECONNECT HRM');
      } catch {
        this.hrmService = null;
        this.hrmStatusDot.setFillStyle(0xff4444);
        this.hrmStatusLabel.setText('FAILED').setColor('#ff4444');
        btnHrm.setFillStyle(0x3a1a5a);
        btnHrmTxt.setText('CONNECT HRM');
      }
    });
  }

  // ── Start / Demo buttons ───────────────────────────────────────────────────

  private buildStartButton(): void {
    this.startBtnContainer = this.add.container(0, 0); // positioned by onResize

    // ── Quick Demo (left) ──────────────────────────────────────────────────
    const demoBtn = this.add
      .rectangle(-160, 0, 220, 52, 0x3a4a6b)
      .setInteractive({ useHandCursor: true });
    const demoTxt = this.add.text(-160, 0, '▶  QUICK DEMO', {
      fontFamily: 'monospace', fontSize: '15px',
      color: '#bbbbff', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0.5);
    this.startBtnContainer.add([demoBtn, demoTxt]);

    demoBtn.on('pointerover', () => demoBtn.setFillStyle(0x5a6aab));
    demoBtn.on('pointerout',  () => demoBtn.setFillStyle(0x3a4a6b));
    demoBtn.on('pointerdown', () => {
      // Quick demo: use the default curated course (has surface variety)
      this.scene.start('GameScene', {
        course: DEFAULT_COURSE,
        weightKg: this.weightKg,
        units:    this.units,
        trainer:  null,           // null → GameScene uses MockTrainerService
        hrm:      this.hrmService,
      });
    });

    // ── Start Ride (right) ─────────────────────────────────────────────────
    const startBtn = this.add
      .rectangle(+160, 0, 220, 52, 0x00a892)
      .setInteractive({ useHandCursor: true });
    const startTxt = this.add.text(+160, 0, '▶  START RIDE', {
      fontFamily: 'monospace', fontSize: '18px',
      color: '#ffffff', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0.5);
    this.startBtnContainer.add([startBtn, startTxt]);

    startBtn.on('pointerover', () => startBtn.setFillStyle(0x00d4b8));
    startBtn.on('pointerout',  () => startBtn.setFillStyle(0x00a892));
    startBtn.on('pointerdown', () => {
      const course = generateCourseProfile(
        this.distanceKm,
        DIFF[this.difficulty].maxGrade,
      );
      this.scene.start('GameScene', {
        course,
        weightKg: this.weightKg,
        units:    this.units,
        trainer:  this.trainerService, // may be null → demo mode in GameScene
        hrm:      this.hrmService,
      });
    });
  }

  // ── Units selector ─────────────────────────────────────────────────────────

  private buildUnitsSection(): void {
    const PW = 145; const PH = 132;
    const CX = PW / 2;

    this.unitsSection = this.add.container(0, 150);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.unitsSection.add(bg);

    this.unitsSection.add(this.add.text(14, 10, 'UNITS', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const BTN_W = 110;
    const BTN_H = 32;

    const unitOrder: Units[] = ['imperial', 'metric'];
    const labels: Record<Units, string> = { imperial: 'IMPERIAL', metric: 'METRIC' };
    const ys = [52, 96];

    unitOrder.forEach((u, i) => {
      const btn = this.add
        .rectangle(CX, ys[i], BTN_W, BTN_H, 0x1a1a3a)
        .setInteractive({ useHandCursor: true });

      const btnTxt = this.add.text(CX, ys[i], labels[u], {
        fontFamily: 'monospace', fontSize: '11px',
        color: '#ffffff', fontStyle: 'bold', letterSpacing: 1,
      }).setOrigin(0.5);

      this.unitsSection.add([btn, btnTxt]);
      this.unitsBtns.set(u, btn);

      btn.on('pointerdown', () => {
        this.units = u;
        this.refreshUnitsStyles();
        this.refreshUnitDisplays();
      });
      btn.on('pointerover', () => { if (this.units !== u) btn.setFillStyle(0x3a3a6b); });
      btn.on('pointerout',  () => this.refreshUnitsStyles());
    });

    this.refreshUnitsStyles();
  }

  private refreshUnitsStyles(): void {
    for (const [u, btn] of this.unitsBtns) {
      const selected = u === this.units;
      btn.setFillStyle(selected ? 0x2a5a8b : 0x1a1a3a);
      btn.setStrokeStyle(selected ? 2 : 0, 0xffffff, selected ? 0.85 : 0);
    }
  }

  private refreshUnitDisplays(): void {
    if (this.weightInputActive) this.commitWeightEdit();
    this.distText.setText(this.fmtDist(this.distanceKm));
    this.weightText.setText(this.fmtWeight(this.weightKg));
    PRESETS.forEach((km, i) => {
      this.presetLabels[i]?.setText(this.fmtPreset(km));
    });
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

  private fmtDist(km: number): string {
    return this.units === 'imperial' ? `${(km * KM_TO_MI).toFixed(1)} mi` : `${km} km`;
  }

  private fmtPreset(km: number): string {
    return this.units === 'imperial' ? `${Math.round(km * KM_TO_MI)}` : `${km}`;
  }

  private fmtWeight(kg: number): string {
    return this.units === 'imperial' ? `${Math.round(kg * KG_TO_LB)} lb` : `${kg} kg`;
  }

  // ── Button helper ──────────────────────────────────────────────────────────

  /**
   * Creates an interactive rectangle button + label text, adds BOTH to the
   * given container (fixing the bug where only the text was added), and
   * returns the text object so callers can store it for later updates.
   */
  private addIconBtn(
    container: Phaser.GameObjects.Container,
    x: number, y: number, w: number, h: number,
    label: string,
    colorNormal: number, colorHover: number,
    onClick: () => void,
    textStyle?: object,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .rectangle(x, y, w, h, colorNormal)
      .setInteractive({ useHandCursor: true });

    const txt = this.add.text(x, y, label, {
      fontFamily: 'monospace',
      fontSize:   '16px',
      color:      '#ffffff',
      ...textStyle,
    }).setOrigin(0.5);

    // Add BOTH objects to the container so they move together on resize
    container.add([btn, txt]);

    btn.on('pointerdown', onClick);
    btn.on('pointerover', () => btn.setFillStyle(colorHover));
    btn.on('pointerout',  () => btn.setFillStyle(colorNormal));

    return txt;
  }
}
