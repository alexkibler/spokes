/**
 * MenuScene.ts
 *
 * Main menu for Paper Peloton.
 *
 * Lets the player choose:
 *   • Distance    – 5–200 km in 5 km steps (quick-select presets available)
 *   • Rider weight – 40–130 kg in 1 kg steps
 *   • Difficulty  – Easy (max 5 %), Medium (max 10 %), Hard (max 15 %)
 *
 * On START, a course profile is procedurally generated and all selections
 * are passed to GameScene.
 */

import Phaser from 'phaser';
import { generateCourseProfile } from '../course/CourseProfile';

// ─── Layout ───────────────────────────────────────────────────────────────────

const W = 960;
const H = 540;

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

const MIN_KG   =  40;
const MAX_KG   = 130;
const STEP_KG  =   1;
const DEFAULT_WEIGHT_KG = 75;

// ─── Scene ────────────────────────────────────────────────────────────────────

export class MenuScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private distanceKm = 50;
  private weightKg   = DEFAULT_WEIGHT_KG;

  private distText!: Phaser.GameObjects.Text;
  private weightText!: Phaser.GameObjects.Text;
  private diffBtns = new Map<Difficulty, Phaser.GameObjects.Rectangle>();

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#e8dcc8');
    this.drawBackground();
    this.buildTitle();
    this.buildDistanceSection();
    this.buildWeightSection();
    this.buildDifficultySection();
    this.buildStartButton();
  }

  // ── Decorative background ──────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.add.graphics();

    // Far mountain silhouette
    g.fillStyle(0xcec0a8, 0.7);
    g.fillPoints([
      { x:   0, y: H },
      { x:   0, y: 322 },
      { x:  78, y: 250 },
      { x: 198, y: 308 },
      { x: 318, y: 255 },
      { x: 440, y: 320 },
      { x: 568, y: 248 },
      { x: 685, y: 288 },
      { x: 784, y: 244 },
      { x: 884, y: 278 },
      { x: 960, y: 262 },
      { x: 960, y: H },
    ], true);

    // Nearer hills
    g.fillStyle(0xb0a888, 0.45);
    g.fillPoints([
      { x:   0, y: H },
      { x:   0, y: 412 },
      { x: 128, y: 384 },
      { x: 258, y: 398 },
      { x: 398, y: 374 },
      { x: 518, y: 392 },
      { x: 648, y: 378 },
      { x: 790, y: 396 },
      { x: 900, y: 382 },
      { x: 960, y: 392 },
      { x: 960, y: H },
    ], true);

    // Road strip at bottom
    g.fillStyle(0x9a8870, 0.35);
    g.fillRect(0, H - 44, W, 44);
  }

  // ── Title ──────────────────────────────────────────────────────────────────

  private buildTitle(): void {
    this.add.text(W / 2, 50, 'PAPER PELOTON', {
      fontFamily: 'monospace',
      fontSize:   '52px',
      color:      '#2a2018',
      fontStyle:  'bold',
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 116, 'CHOOSE YOUR RIDE', {
      fontFamily:    'monospace',
      fontSize:      '13px',
      color:         '#7a6850',
      letterSpacing: 5,
    }).setOrigin(0.5, 0);
  }

  // ── Distance selector (left panel) ────────────────────────────────────────
  //   Occupies x = 170–555 (width 385)

  private buildDistanceSection(): void {
    const PX = 170; const PY = 150;
    const PW = 385; const PH = 132;
    const CX = PX + PW / 2;   // 362.5 → ~363
    const CY = PY + PH / 2;   // 216

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(PX, PY, PW, PH, 6);

    this.addSectionLabel(PX + 18, PY + 10, 'DISTANCE');

    // Step buttons
    this.addIconBtn(PX + 58, CY - 12, 48, 38, '−', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.max(MIN_KM, this.distanceKm - STEP_KM);
      this.distText.setText(`${this.distanceKm} km`);
    });
    this.addIconBtn(PX + PW - 58, CY - 12, 48, 38, '+', 0x2a2a6b, 0x4444aa, () => {
      this.distanceKm = Math.min(MAX_KM, this.distanceKm + STEP_KM);
      this.distText.setText(`${this.distanceKm} km`);
    });

    // Value display
    this.distText = this.add.text(CX, CY - 12, `${this.distanceKm} km`, {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);

    // Preset quick-select row (btnW=56, gap=7 → totalW=371, fits within panel)
    const presetY = PY + PH - 20;
    const btnW    = 56;
    const gap     = 7;
    const totalW  = PRESETS.length * btnW + (PRESETS.length - 1) * gap;
    const startX  = Math.round(CX - totalW / 2);

    PRESETS.forEach((km, i) => {
      const bx = startX + i * (btnW + gap) + btnW / 2;
      this.addIconBtn(bx, presetY, btnW, 22, `${km}`, 0x3a3a8b, 0x5555bb, () => {
        this.distanceKm = km;
        this.distText.setText(`${km} km`);
      }, { fontSize: '11px', color: '#ccccff' });
    });
  }

  // ── Weight selector (right panel) ─────────────────────────────────────────
  //   Occupies x = 575–790 (width 215), same row as distance

  private buildWeightSection(): void {
    const PX = 575; const PY = 150;
    const PW = 215; const PH = 132;
    const CX = PX + PW / 2;   // 682.5 → ~683
    const CY = PY + PH / 2;   // 216

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(PX, PY, PW, PH, 6);

    this.addSectionLabel(PX + 18, PY + 10, 'RIDER WEIGHT');

    // Step buttons (1 kg per click)
    this.addIconBtn(PX + 48, CY - 12, 44, 38, '−', 0x2a2a6b, 0x4444aa, () => {
      this.weightKg = Math.max(MIN_KG, this.weightKg - STEP_KG);
      this.weightText.setText(`${this.weightKg} kg`);
    });
    this.addIconBtn(PX + PW - 48, CY - 12, 44, 38, '+', 0x2a2a6b, 0x4444aa, () => {
      this.weightKg = Math.min(MAX_KG, this.weightKg + STEP_KG);
      this.weightText.setText(`${this.weightKg} kg`);
    });

    // Value display
    this.weightText = this.add.text(CX, CY - 12, `${this.weightKg} kg`, {
      fontFamily: 'monospace',
      fontSize:   '32px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);

    // Hint label at bottom
    this.add.text(CX, PY + PH - 20, 'rider only', {
      fontFamily: 'monospace',
      fontSize:   '9px',
      color:      '#888899',
      letterSpacing: 1,
    }).setOrigin(0.5);
  }

  // ── Difficulty selector ────────────────────────────────────────────────────

  private buildDifficultySection(): void {
    const PX = 170; const PY = 298;
    const PW = 620; const PH = 110;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(PX, PY, PW, PH, 6);

    this.addSectionLabel(PX + 18, PY + 10, 'DIFFICULTY');

    const BTN_Y = PY + 68;
    const BTN_W = 155;
    const BTN_H = 44;
    const xs: Record<Difficulty, number> = { easy: 305, medium: W / 2, hard: 655 };

    DIFF_ORDER.forEach((diff) => {
      const { label, hint, colorOff } = DIFF[diff];
      const x = xs[diff];

      const btn = this.add
        .rectangle(x, BTN_Y, BTN_W, BTN_H, colorOff)
        .setInteractive({ useHandCursor: true });

      this.add.text(x, BTN_Y, label, {
        fontFamily:    'monospace',
        fontSize:      '14px',
        color:         '#ffffff',
        fontStyle:     'bold',
        letterSpacing: 2,
      }).setOrigin(0.5);

      this.add.text(x, BTN_Y + 30, hint, {
        fontFamily:    'monospace',
        fontSize:      '9px',
        color:         '#888899',
        letterSpacing: 1,
      }).setOrigin(0.5);

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
    const x = W / 2;
    const y = 460;

    const btn = this.add
      .rectangle(x, y, 250, 52, 0x00a892)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y, '▶  START RIDE', {
      fontFamily:    'monospace',
      fontSize:      '18px',
      color:         '#ffffff',
      fontStyle:     'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x00d4b8));
    btn.on('pointerout',  () => btn.setFillStyle(0x00a892));
    btn.on('pointerdown', () => {
      const course = generateCourseProfile(
        this.distanceKm,
        DIFF[this.difficulty].maxGrade,
      );
      this.scene.start('GameScene', { course, weightKg: this.weightKg });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private addSectionLabel(x: number, y: number, text: string): void {
    this.add.text(x, y, text, {
      fontFamily:    'monospace',
      fontSize:      '10px',
      color:         '#aaaaaa',
      letterSpacing: 3,
    });
  }

  private addIconBtn(
    x: number, y: number, w: number, h: number,
    label: string,
    colorNormal: number, colorHover: number,
    onClick: () => void,
    textStyle?: object,
  ): void {
    const btn = this.add
      .rectangle(x, y, w, h, colorNormal)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y, label, {
      fontFamily: 'monospace',
      fontSize:   '16px',
      color:      '#ffffff',
      ...textStyle,
    }).setOrigin(0.5);

    btn.on('pointerdown', onClick);
    btn.on('pointerover', () => btn.setFillStyle(colorHover));
    btn.on('pointerout',  () => btn.setFillStyle(colorNormal));
  }
}
