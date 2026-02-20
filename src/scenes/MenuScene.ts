/**
 * MenuScene.ts
 *
 * Main menu for Paper Peloton.
 *
 * Lets the player choose:
 *   • Distance    – 5–200 km in 5 km steps (quick-select presets available)
 *   • Rider weight – 40–130 kg in 1 kg steps
 *   • Difficulty  – Easy (max 5 %), Medium (max 10 %), Hard (max 15 %)
 *   • Units       – Imperial (mph / lb) or Metric (km/h / kg)
 *
 * On START, a course profile is procedurally generated and all selections
 * are passed to GameScene.
 */

import Phaser from 'phaser';
import { generateCourseProfile } from '../course/CourseProfile';

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

  // UI Containers/Elements for resizing
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private titleContainer!: Phaser.GameObjects.Container;
  private distSection!: Phaser.GameObjects.Container;
  private weightSection!: Phaser.GameObjects.Container;
  private unitsSection!: Phaser.GameObjects.Container;
  private diffSection!: Phaser.GameObjects.Container;
  private startBtnContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#e8dcc8');

    this.bgGraphics = this.add.graphics();

    this.buildTitle();
    this.buildDistanceSection();
    this.buildWeightSection();
    this.buildUnitsSection();
    this.buildDifficultySection();
    this.buildStartButton();

    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private onResize(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;

    // 1. Update Background
    this.drawBackground();

    // 2. Update Title (Top Center)
    if (this.titleContainer) {
      this.titleContainer.setPosition(cx, 50);
    }

    // 3. Middle Section Layout
    const middleY = 150;
    const distW = 385;
    const weightW = 215;
    const unitsW = 145;
    const gap = 20;
    const totalW = distW + weightW + unitsW + gap * 2;
    const startX = cx - totalW / 2;

    if (this.distSection) this.distSection.setPosition(startX, middleY);
    if (this.weightSection) this.weightSection.setPosition(startX + distW + gap, middleY);
    if (this.unitsSection) this.unitsSection.setPosition(startX + distW + weightW + gap * 2, middleY);

    // 4. Difficulty Section (Below middle)
    if (this.diffSection) {
      this.diffSection.setPosition(cx - 310, 298);
    }

    // 5. Start Button (Bottom)
    if (this.startBtnContainer) {
      this.startBtnContainer.setPosition(cx, height - 80);
    }
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
    const g = this.bgGraphics;
    const width = this.scale.width;
    const height = this.scale.height;

    g.clear();

    // Far mountain silhouette
    g.fillStyle(0xcec0a8, 0.7);
    g.fillPoints([
      { x:   0, y: height },
      { x:   0, y: height * 0.6 },
      { x:  width * 0.08, y: height * 0.46 },
      { x: width * 0.2, y: height * 0.57 },
      { x: width * 0.33, y: height * 0.47 },
      { x: width * 0.46, y: height * 0.59 },
      { x: width * 0.59, y: height * 0.46 },
      { x: width * 0.71, y: height * 0.53 },
      { x: width * 0.82, y: height * 0.45 },
      { x: width * 0.92, y: height * 0.51 },
      { x: width, y: height * 0.48 },
      { x: width, y: height },
    ], true);

    // Nearer hills
    g.fillStyle(0xb0a888, 0.45);
    g.fillPoints([
      { x:   0, y: height },
      { x:   0, y: height * 0.76 },
      { x: width * 0.13, y: height * 0.71 },
      { x: width * 0.27, y: height * 0.74 },
      { x: width * 0.41, y: height * 0.69 },
      { x: width * 0.54, y: height * 0.73 },
      { x: width * 0.68, y: height * 0.70 },
      { x: width * 0.82, y: height * 0.73 },
      { x: width * 0.94, y: height * 0.71 },
      { x: width, y: height * 0.73 },
      { x: width, y: height },
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

  // ── Distance selector (left panel) ────────────────────────────────────────
  //   Occupies x = 170–555 (width 385)

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

    // Step buttons
    this.distSection.add(this.addIconBtn(58, CY - 12, 48, 38, '−', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.max(MIN_KM, this.distanceKm - STEP_KM);
      this.distText.setText(this.fmtDist(this.distanceKm));
    }));
    this.distSection.add(this.addIconBtn(PW - 58, CY - 12, 48, 38, '+', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.min(MAX_KM, this.distanceKm + STEP_KM);
      this.distText.setText(this.fmtDist(this.distanceKm));
    }));

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
      const bx = startX + i * (btnW + gap) + btnW / 2;
      const lbl = this.addIconBtn(bx, presetY, btnW, 22, this.fmtPreset(km), 0x3a3a8b, 0x5555bb, () => {
        this.distanceKm = km;
        this.distText.setText(this.fmtDist(km));
      }, { fontSize: '11px', color: '#ccccff' });
      this.presetLabels.push(lbl);
      this.distSection.add(lbl);
    });
  }

  // ── Weight selector (right panel) ─────────────────────────────────────────
  //   Occupies x = 575–790 (width 215), same row as distance

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

    // Editable input field
    const FIELD_W = 180;
    const FIELD_H = 46;
    const fieldCY = 72;

    this.weightInputField = this.add
      .rectangle(CX, fieldCY, FIELD_W, FIELD_H, 0x1a1a3a)
      .setStrokeStyle(2, 0x3a3a8b, 0.8)
      .setInteractive({ useHandCursor: true });
    this.weightSection.add(this.weightInputField);

    // Value text centered in the field
    this.weightText = this.add.text(CX, fieldCY, this.fmtWeight(this.weightKg), {
      fontFamily: 'monospace',
      fontSize:   '26px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);
    this.weightSection.add(this.weightText);

    // Hint
    const hint = this.add.text(CX, PH - 14, 'click to edit · enter to confirm', {
      fontFamily: 'monospace',
      fontSize:   '8px',
      color:      '#666677',
      letterSpacing: 0,
    }).setOrigin(0.5);
    this.weightSection.add(hint);

    // ── Interaction ──────────────────────────────────────────────────────────

    this.weightInputField.on('pointerover', () => {
      if (!this.weightInputActive) {
        this.weightInputField.setStrokeStyle(2, 0x5555cc, 1);
      }
    });
    this.weightInputField.on('pointerout', () => {
      if (!this.weightInputActive) {
        this.weightInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
      }
    });

    this.weightInputField.on('pointerdown', () => {
      this.ignoreNextGlobalClick = true;
      this.startWeightEdit();
    });

    // Click anywhere else commits the edit
    this.input.on('pointerdown', () => {
      if (this.ignoreNextGlobalClick) {
        this.ignoreNextGlobalClick = false;
        return;
      }
      if (this.weightInputActive) this.commitWeightEdit();
    });

    // Keyboard capture (digits / backspace / enter / escape)
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

    const label = this.add.text(18, 10, 'DIFFICULTY', {
      fontFamily:    'monospace',
      fontSize:      '10px',
      color:         '#aaaaaa',
      letterSpacing: 3,
    });
    this.diffSection.add(label);

    const BTN_Y = 68;
    const BTN_W = 155;
    const BTN_H = 44;
    // relative to section container
    const xs: Record<Difficulty, number> = { easy: 135, medium: 310, hard: 485 };

    DIFF_ORDER.forEach((diff) => {
      const { label, hint, colorOff } = DIFF[diff];
      const x = xs[diff];

      const btn = this.add
        .rectangle(x, BTN_Y, BTN_W, BTN_H, colorOff)
        .setInteractive({ useHandCursor: true });

      const btnLabel = this.add.text(x, BTN_Y, label, {
        fontFamily:    'monospace',
        fontSize:      '14px',
        color:         '#ffffff',
        fontStyle:     'bold',
        letterSpacing: 2,
      }).setOrigin(0.5);

      const hintText = this.add.text(x, BTN_Y + 30, hint, {
        fontFamily:    'monospace',
        fontSize:      '9px',
        color:         '#888899',
        letterSpacing: 1,
      }).setOrigin(0.5);

      this.diffSection.add([btn, btnLabel, hintText]);
      this.diffBtns.set(diff, btn);

      btn.on('pointerdown', () => {
        this.difficulty = diff;
        this.refreshDiffStyles();
      });
      btn.on('pointerover', () => {
        if (this.difficulty !== diff) btn.setFillStyle(DIFF[diff].colorHov);
      });
      btn.on('pointerout', () => this.refreshDiffStyles());
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

  // ── Start button ───────────────────────────────────────────────────────────

  private buildStartButton(): void {
    this.startBtnContainer = this.add.container(0, 460);

    const btn = this.add
      .rectangle(0, 0, 250, 52, 0x00a892)
      .setInteractive({ useHandCursor: true });

    const txt = this.add.text(0, 0, '▶  START RIDE', {
      fontFamily:    'monospace',
      fontSize:      '18px',
      color:         '#ffffff',
      fontStyle:     'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);

    this.startBtnContainer.add([btn, txt]);

    btn.on('pointerover', () => btn.setFillStyle(0x00d4b8));
    btn.on('pointerout',  () => btn.setFillStyle(0x00a892));
    btn.on('pointerdown', () => {
      const course = generateCourseProfile(
        this.distanceKm,
        DIFF[this.difficulty].maxGrade,
      );
      this.scene.start('GameScene', { course, weightKg: this.weightKg, units: this.units });
    });
  }

  // ── Units selector (right panel, same row as distance/weight) ─────────────
  //   Occupies x = 800–945 (width 145)

  private buildUnitsSection(): void {
    const PW = 145; const PH = 132;
    const CX = PW / 2;

    this.unitsSection = this.add.container(0, 150);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.unitsSection.add(bg);

    const label = this.add.text(14, 10, 'UNITS', {
      fontFamily:    'monospace',
      fontSize:      '10px',
      color:         '#aaaaaa',
      letterSpacing: 3,
    });
    this.unitsSection.add(label);

    const BTN_W = 110;
    const BTN_H = 32;

    const unitOrder: Units[] = ['imperial', 'metric'];
    const labels: Record<Units, string> = {
      imperial: 'IMPERIAL',
      metric:   'METRIC',
    };
    const ys = [52, 96];

    unitOrder.forEach((u, i) => {
      const btn = this.add
        .rectangle(CX, ys[i], BTN_W, BTN_H, 0x1a1a3a)
        .setInteractive({ useHandCursor: true });

      const btnTxt = this.add.text(CX, ys[i], labels[u], {
        fontFamily:    'monospace',
        fontSize:      '11px',
        color:         '#ffffff',
        fontStyle:     'bold',
        letterSpacing: 1,
      }).setOrigin(0.5);

      this.unitsSection.add([btn, btnTxt]);
      this.unitsBtns.set(u, btn);

      btn.on('pointerdown', () => {
        this.units = u;
        this.refreshUnitsStyles();
        this.refreshUnitDisplays();
      });
      btn.on('pointerover', () => {
        if (this.units !== u) btn.setFillStyle(0x3a3a6b);
      });
      btn.on('pointerout', () => this.refreshUnitsStyles());
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

  /** Refresh all unit-sensitive text objects when the units toggle changes. */
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
    if (this.units === 'imperial') {
      return `${(km * KM_TO_MI).toFixed(1)} mi`;
    }
    return `${km} km`;
  }

  private fmtPreset(km: number): string {
    if (this.units === 'imperial') {
      return `${Math.round(km * KM_TO_MI)}`;
    }
    return `${km}`;
  }

  private fmtWeight(kg: number): string {
    if (this.units === 'imperial') {
      return `${Math.round(kg * KG_TO_LB)} lb`;
    }
    return `${kg} kg`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private addIconBtn(
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

    btn.on('pointerdown', onClick);
    btn.on('pointerover', () => btn.setFillStyle(colorHover));
    btn.on('pointerout',  () => btn.setFillStyle(colorNormal));

    return txt;
  }
}
