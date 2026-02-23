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
import QRCode from 'qrcode';
import { RunStateManager } from '../roguelike/RunState';
import type { ITrainerService } from '../services/ITrainerService';
import { TrainerService } from '../services/TrainerService';
import { HeartRateService } from '../services/HeartRateService';
import { RemoteService } from '../services/RemoteService';
import { SaveService } from '../services/SaveService';
import {
  KM_TO_MI,
  MI_TO_KM,
  KG_TO_LB,
  LB_TO_KG,
  formatFixed
} from '../utils/UnitConversions';

// ─── Units ────────────────────────────────────────────────────────────────────

export type Units = 'imperial' | 'metric';

// ─── Difficulty config ────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'normal' | 'hard';

interface DiffConfig {
  label:    string;
  hint:     string;
  maxGrade: number;
  colorOn:  number;
  colorOff: number;
  colorHov: number;
}

const DIFF: Record<Difficulty, DiffConfig> = {
  easy:   { label: 'EASY',   hint: '',    maxGrade: 0.03, colorOn: 0x1a7040, colorOff: 0x0e3d20, colorHov: 0x25a558 },
  normal: { label: 'NORMAL', hint: '',     maxGrade: 0.07, colorOn: 0x8b5a00, colorOff: 0x4a3000, colorHov: 0xcc8800 },
  hard:   { label: 'HARD',   hint: '',  maxGrade: 0.12, colorOn: 0x8b2020, colorOff: 0x4a1010, colorHov: 0xcc3333 },
};

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

// ─── Distance config ──────────────────────────────────────────────────────────

const MIN_KM  =   1;
const MAX_KM  = 400;
const PRESETS_KM: number[] = [10, 25, 50, 100, 150, 200];
// Imperial presets stored internally as km (converted from round mile values)
const PRESETS_MI_KM: number[] = [5, 10, 20, 40, 62, 100, 200].map(mi => mi * MI_TO_KM);

// ─── Weight config ────────────────────────────────────────────────────────────

const MIN_KG            =  40;
const MAX_KG            = 200;
const DEFAULT_WEIGHT_KG =  150 * LB_TO_KG; // 150 lb default

const CURSOR_BLINK_MS = 530;

// ─── Scene ────────────────────────────────────────────────────────────────────

export class MenuScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private distanceKm = 20 * MI_TO_KM; // 20 miles default
  private weightKg   = DEFAULT_WEIGHT_KG;
  private ftpW       = 200; // Functional Threshold Power in watts
  private units: Units = 'imperial';

  private distText!: Phaser.GameObjects.Text;
  private distInputField!: Phaser.GameObjects.Rectangle;
  private distInputActive = false;
  private distInputStr    = '';
  private distCursorMs    = 0;
  private distCursorOn    = true;

  private weightText!: Phaser.GameObjects.Text;
  private weightInputField!: Phaser.GameObjects.Rectangle;
  private weightInputActive  = false;
  private weightInputStr     = '';
  private weightCursorMs     = 0;
  private weightCursorOn     = true;

  private ftpText!: Phaser.GameObjects.Text;
  private ftpInputField!: Phaser.GameObjects.Rectangle;
  private ftpInputActive  = false;
  private ftpInputStr     = '';
  private ftpCursorMs     = 0;
  private ftpCursorOn     = true;

  private ignoreNextGlobalClick = false;
  private diffBtns   = new Map<Difficulty, Phaser.GameObjects.Rectangle>();
  private unitsBtns  = new Map<Units, Phaser.GameObjects.Rectangle>();
  private presetLabels: Phaser.GameObjects.Text[] = [];
  private presetObjects: Phaser.GameObjects.GameObject[] = [];

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
  private ftpSection!: Phaser.GameObjects.Container;
  private devicesSection!: Phaser.GameObjects.Container;
  private startBtnContainer!: Phaser.GameObjects.Container;
  private saveBannerContainer: Phaser.GameObjects.Container | null = null;

  // ── Dev Mode ──────────────────────────────────────────────────────────────
  private isDevMode = RunStateManager.getDevMode();
  private isStartWarningActive = false;
  private devModeToggle!: Phaser.GameObjects.Container;

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
    this.buildFtpSection();
    this.buildDevicesSection();
    this.buildStartButton();
    this.setupInputHandlers();

    this.buildDevToggle();

    // Check for an existing save and build the save banner if one exists
    const { save: existingSave, wasIncompatible } = SaveService.loadResult();
    if (existingSave) {
      this.buildSaveBanner(existingSave);
    } else if (wasIncompatible) {
      this.buildIncompatibleSaveNotice();
    }

    // Delay check slightly to allow BleClient polyfill to populate navigator.bluetooth
    this.time.delayedCall(2000, () => {
      this.showBannerIfNeeded();
    });

    this.scale.on('resize', this.onResize, this);
    this.onResize();
  }

  private showBannerIfNeeded(): void {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
    const hasBt = 'bluetooth' in navigator;
    const isCapacitor = !!(window as any).Capacitor;
    const banner = document.getElementById('unsupported-banner');
    if (!banner || banner.dataset.dismissed === 'true') return;
    if (!isCapacitor && (isIOS || !hasBt)) banner.style.display = 'block';
  }

  private hideBanner(): void {
    const el = document.getElementById('unsupported-banner');
    if (el) el.style.display = 'none';
  }

  private onResize(): void {
    const width  = this.scale.width;
    const height = this.scale.height;
    const cx     = width / 2;

    this.drawBackground();

    const s = Math.min(1, width / 960, height / 540);

    if (this.titleContainer) this.titleContainer.setScale(s).setPosition(cx, 50 * s);

    // Row 1: Distance | Weight | Units (centred)
    const totalW = (385 + 215 + 145 + 40) * s; // 785*s
    const startX = cx - totalW / 2;

    if (this.distSection)   this.distSection.setScale(s).setPosition(startX, 145 * s);
    if (this.weightSection) this.weightSection.setScale(s).setPosition(startX + 405 * s, 145 * s);
    if (this.unitsSection)  this.unitsSection.setScale(s).setPosition(startX + 640 * s, 145 * s);

    // Row 2: Difficulty | FTP (centred together)
    const row2StartX = cx - 250 * s;
    if (this.diffSection) this.diffSection.setScale(s).setPosition(row2StartX, 288 * s);
    if (this.ftpSection)  this.ftpSection.setScale(s).setPosition(row2StartX + 320 * s, 288 * s);

    // Reserve space for the iOS home indicator / Android nav bar so interactive
    // elements never land in the system-gesture zone at the bottom of the screen.
    const safeBottom = MenuScene.getSafeAreaInsetBottom();

    // Row 3: Devices — pushed up when save banner occupies the row above buttons
    // Bottom-anchored (use height - X*s)
    const devicesY = this.saveBannerContainer ? height - safeBottom - 210 * s : height - safeBottom - 165 * s;
    if (this.devicesSection) this.devicesSection.setScale(s).setPosition(cx - 310 * s, devicesY);

    // Save banner — sits between devices and start buttons
    if (this.saveBannerContainer) this.saveBannerContainer.setScale(s).setPosition(cx, height - safeBottom - 110 * s);

    // Row 4: Start buttons
    if (this.startBtnContainer) this.startBtnContainer.setScale(s).setPosition(cx, height - safeBottom - 60 * s);

    // Dev Toggle
    if (this.devModeToggle) this.devModeToggle.setScale(s).setPosition(width - 120 * s, 30 * s);
  }

  /**
   * Read the CSS env(safe-area-inset-bottom) value in pixels.
   * Returns 0 on platforms without a home indicator / nav bar.
   * We measure via a throwaway DOM element rather than parsing env() directly,
   * since CSS environment variables aren't accessible via getPropertyValue().
   */
  private static getSafeAreaInsetBottom(): number {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;';
    document.body.appendChild(probe);
    const inset = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    return inset;
  }

  update(_time: number, delta: number): void {
    if (this.weightInputActive) {
      this.weightCursorMs += delta;
      if (this.weightCursorMs >= CURSOR_BLINK_MS) {
        this.weightCursorMs = 0;
        this.weightCursorOn = !this.weightCursorOn;
        this.showWeightInputDisplay();
      }
    }
    if (this.distInputActive) {
      this.distCursorMs += delta;
      if (this.distCursorMs >= CURSOR_BLINK_MS) {
        this.distCursorMs = 0;
        this.distCursorOn = !this.distCursorOn;
        this.showDistInputDisplay();
      }
    }
    if (this.ftpInputActive) {
      this.ftpCursorMs += delta;
      if (this.ftpCursorMs >= CURSOR_BLINK_MS) {
        this.ftpCursorMs = 0;
        this.ftpCursorOn = !this.ftpCursorOn;
        this.showFtpInputDisplay();
      }
    }
  }

  // ── Input Handling ────────────────────────────────────────────────────────

  private setupInputHandlers(): void {
    this.input.on('pointerdown', () => {
      if (this.ignoreNextGlobalClick) { this.ignoreNextGlobalClick = false; return; }
      if (this.weightInputActive) this.commitWeightEdit();
      if (this.distInputActive)   this.commitDistEdit();
      if (this.ftpInputActive)    this.commitFtpEdit();
    });

    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      const active = this.weightInputActive || this.distInputActive || this.ftpInputActive;
      if (!active) return;

      if ((event.key >= '0' && event.key <= '9') || event.key === '.') {
        if (this.weightInputActive && this.weightInputStr.length < 5) {
          if (event.key === '.' && this.weightInputStr.includes('.')) return;
          this.weightInputStr += event.key;
          this.weightCursorOn = true;
          this.weightCursorMs = 0;
          this.showWeightInputDisplay();
        } else if (this.distInputActive && this.distInputStr.length < 5) {
          if (event.key === '.' && this.distInputStr.includes('.')) return;
          this.distInputStr += event.key;
          this.distCursorOn = true;
          this.distCursorMs = 0;
          this.showDistInputDisplay();
        } else if (this.ftpInputActive && this.ftpInputStr.length < 4) {
          if (event.key === '.') return; // FTP is integers only
          this.ftpInputStr += event.key;
          this.ftpCursorOn = true;
          this.ftpCursorMs = 0;
          this.showFtpInputDisplay();
        }
      } else if (event.key === 'Backspace') {
        if (this.weightInputActive) {
          this.weightInputStr = this.weightInputStr.slice(0, -1);
          this.weightCursorOn = true;
          this.weightCursorMs = 0;
          this.showWeightInputDisplay();
        } else if (this.distInputActive) {
          this.distInputStr = this.distInputStr.slice(0, -1);
          this.distCursorOn = true;
          this.distCursorMs = 0;
          this.showDistInputDisplay();
        } else if (this.ftpInputActive) {
          this.ftpInputStr = this.ftpInputStr.slice(0, -1);
          this.ftpCursorOn = true;
          this.ftpCursorMs = 0;
          this.showFtpInputDisplay();
        }
      } else if (event.key === 'Enter' || event.key === 'Escape') {
        if (this.weightInputActive) this.commitWeightEdit();
        if (this.distInputActive)   this.commitDistEdit();
        if (this.ftpInputActive)    this.commitFtpEdit();
      }
    });
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

    const FIELD_W = 180;
    const FIELD_H = 46;
    const fieldCY = 54;

    this.distInputField = this.add
      .rectangle(CX, fieldCY, FIELD_W, FIELD_H, 0x1a1a3a)
      .setStrokeStyle(2, 0x3a3a8b, 0.8)
      .setInteractive({ useHandCursor: true });
    this.distSection.add(this.distInputField);

    // Value display
    this.distText = this.add.text(CX, fieldCY, this.fmtDist(this.distanceKm), {
      fontFamily: 'monospace',
      fontSize:   '26px',
      color:      '#ffffff',
      fontStyle:  'bold',
    }).setOrigin(0.5);
    this.distSection.add(this.distText);

    const hint = this.add.text(CX, fieldCY + 34, 'click to edit · enter to confirm', {
      fontFamily: 'monospace',
      fontSize:   '8px',
      color:      '#666677',
    }).setOrigin(0.5);
    this.distSection.add(hint);

    this.distInputField.on('pointerover', () => {
      if (!this.distInputActive) this.distInputField.setStrokeStyle(2, 0x5555cc, 1);
    });
    this.distInputField.on('pointerout', () => {
      if (!this.distInputActive) this.distInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    });
    this.distInputField.on('pointerdown', () => {
      this.ignoreNextGlobalClick = true;
      this.startDistEdit();
    });

    this.buildPresetButtons();
  }

  private buildPresetButtons(): void {
    const PW = 385;
    const CX = PW / 2;
    const presetY = 112; // PH - 20
    const btnW    = 50;
    const gap     = 6;

    // Destroy previous preset objects
    for (const obj of this.presetObjects) obj.destroy();
    this.presetObjects = [];
    this.presetLabels  = [];

    const presets = this.units === 'imperial' ? PRESETS_MI_KM : PRESETS_KM;
    const totalW  = presets.length * btnW + (presets.length - 1) * gap;
    const startX  = Math.round(CX - totalW / 2);

    presets.forEach((km, i) => {
      const bx  = startX + i * (btnW + gap) + btnW / 2;
      const lbl = this.addIconBtnTracked(
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
  }

  // ── FTP selector ───────────────────────────────────────────────────────────

  private buildFtpSection(): void {
    const PW = 180; const PH = 110;
    const CX = PW / 2;

    this.ftpSection = this.add.container(0, 0);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.ftpSection.add(bg);

    this.ftpSection.add(this.add.text(14, 10, 'FTP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const FIELD_W = 150;
    const FIELD_H = 44;
    const fieldCY = 60;

    this.ftpInputField = this.add
      .rectangle(CX, fieldCY, FIELD_W, FIELD_H, 0x1a1a3a)
      .setStrokeStyle(2, 0x3a3a8b, 0.8)
      .setInteractive({ useHandCursor: true });
    this.ftpSection.add(this.ftpInputField);

    this.ftpText = this.add.text(CX, fieldCY, `${this.ftpW} W`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.ftpSection.add(this.ftpText);

    const hint = this.add.text(CX, PH - 12, 'click to edit · enter to confirm', {
      fontFamily: 'monospace', fontSize: '8px', color: '#666677',
    }).setOrigin(0.5);
    this.ftpSection.add(hint);

    this.ftpInputField.on('pointerover', () => {
      if (!this.ftpInputActive) this.ftpInputField.setStrokeStyle(2, 0x5555cc, 1);
    });
    this.ftpInputField.on('pointerout', () => {
      if (!this.ftpInputActive) this.ftpInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    });
    this.ftpInputField.on('pointerdown', () => {
      this.ignoreNextGlobalClick = true;
      this.startFtpEdit();
    });
  }

  private startFtpEdit(): void {
    if (this.ftpInputActive) return;
    if (this.weightInputActive) this.commitWeightEdit();
    if (this.distInputActive)   this.commitDistEdit();

    this.ftpInputActive = true;
    this.ftpCursorMs    = 0;
    this.ftpCursorOn    = true;
    this.ftpInputStr    = String(this.ftpW);
    this.ftpInputField.setStrokeStyle(2, 0x5588ff, 1);
    this.showFtpInputDisplay();
  }

  private commitFtpEdit(): void {
    if (!this.ftpInputActive) return;
    this.ftpInputActive = false;
    this.ftpInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    const parsed = parseInt(this.ftpInputStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      this.ftpW = Math.max(50, Math.min(9999, parsed));
    }
    this.ftpText.setText(`${this.ftpW} W`);
  }

  private showFtpInputDisplay(): void {
    const cursor = this.ftpCursorOn ? '|' : ' ';
    this.ftpText.setText((this.ftpInputStr || '0') + cursor + ' W');
  }

  private startDistEdit(): void {
    if (this.distInputActive) return;
    if (this.weightInputActive) this.commitWeightEdit();
    
    this.distInputActive = true;
    this.distCursorMs    = 0;
    this.distCursorOn    = true;
    
    const displayVal = this.units === 'imperial'
      ? (this.distanceKm * KM_TO_MI)
      : this.distanceKm;
    
    this.distInputStr = formatFixed(displayVal);
    this.distInputField.setStrokeStyle(2, 0x5588ff, 1);
    this.showDistInputDisplay();
  }

  private commitDistEdit(): void {
    if (!this.distInputActive) return;
    this.distInputActive = false;
    this.distInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    
    const parsed = parseFloat(this.distInputStr);
    if (!isNaN(parsed) && parsed > 0) {
      const asKm = this.units === 'imperial'
        ? (parsed * MI_TO_KM)
        : parsed;
      this.distanceKm = Math.max(MIN_KM, Math.min(MAX_KM, asKm));
    }
    this.distText.setText(this.fmtDist(this.distanceKm));
  }

  private showDistInputDisplay(): void {
    const cursor = this.distCursorOn ? '|' : ' ';
    const unit = this.units === 'imperial' ? ' mi' : ' km';
    this.distText.setText((this.distInputStr || '0') + cursor + unit);
  }

  private startWeightEdit(): void {
    if (this.weightInputActive) return;
    if (this.distInputActive) this.commitDistEdit();

    this.weightInputActive = true;
    this.weightCursorMs    = 0;
    this.weightCursorOn    = true;
    const displayVal = this.units === 'imperial'
      ? (this.weightKg * KG_TO_LB)
      : this.weightKg;
    this.weightInputStr = formatFixed(displayVal);
    this.weightInputField.setStrokeStyle(2, 0x5588ff, 1);
    this.showWeightInputDisplay();
  }

  private commitWeightEdit(): void {
    if (!this.weightInputActive) return;
    this.weightInputActive = false;
    this.weightInputField.setStrokeStyle(2, 0x3a3a8b, 0.8);
    const parsed = parseFloat(this.weightInputStr);
    if (!isNaN(parsed) && parsed > 0) {
      const asKg = this.units === 'imperial'
        ? (parsed * LB_TO_KG)
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
    const PW = 300; const PH = 110;

    this.diffSection = this.add.container(0, 0);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.40);
    bg.fillRoundedRect(0, 0, PW, PH, 6);
    this.diffSection.add(bg);

    this.diffSection.add(this.add.text(12, 10, 'DIFFICULTY', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa', letterSpacing: 3,
    }));

    const BTN_Y = 68;
    const BTN_W = 88;
    const BTN_H = 44;
    const xs: Record<Difficulty, number> = { easy: 54, normal: 150, hard: 246 };

    DIFF_ORDER.forEach((diff) => {
      const { label, hint, colorOff } = DIFF[diff];
      const x = xs[diff];

      const btn = this.add
        .rectangle(x, BTN_Y, BTN_W, BTN_H, colorOff)
        .setInteractive({ useHandCursor: true });

      const btnLabel = this.add.text(x, BTN_Y - 8, label, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
        fontStyle: 'bold', letterSpacing: 1,
      }).setOrigin(0.5);

      const hintText = this.add.text(x, BTN_Y + 12, hint.replace('max ', ''), {
        fontFamily: 'monospace', fontSize: '8px', color: '#888899',
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
      } catch (err: any) {
        const msg = err?.message || JSON.stringify(err);
        console.error('[MenuScene] Trainer connection failed:', msg);
        this.trainerService = null;
        this.trainerStatusDot.setFillStyle(0xff4444);
        this.trainerStatusLabel.setText('FAILED').setColor('#ff4444');
        btnTrainer.setFillStyle(0x1a3a6b);
        btnTrainerTxt.setText('CONNECT BT');
      }
    });


    // ── Remote Control (Center) ──────────────────────────────────────────────

    const btnRemote = this.add
      .rectangle(295, 50, 80, 32, 0x4a4a5a)
      .setInteractive({ useHandCursor: true });

    const btnRemoteTxt = this.add.text(295, 50, 'REMOTE', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);

    this.devicesSection.add([btnRemote, btnRemoteTxt]);

    btnRemote.on('pointerover', () => {
      const code = RemoteService.getInstance().getRoomCode();
      if (!code) btnRemote.setFillStyle(0x5a5a6a);
    });
    btnRemote.on('pointerout', () => {
      const code = RemoteService.getInstance().getRoomCode();
      if (!code) btnRemote.setFillStyle(0x4a4a5a);
    });
    btnRemote.on('pointerdown', async () => {
      const existingCode = RemoteService.getInstance().getRoomCode();
      if (existingCode) {
        this.showRemoteQR(existingCode);
        return;
      }

      btnRemote.setFillStyle(0x6a6a7a);
      btnRemoteTxt.setText('...');

      try {
        const roomCode = await RemoteService.getInstance().initHost();
        btnRemoteTxt.setText(roomCode).setFontSize(14).setColor('#00ff88');
        btnRemote.setFillStyle(0x222233).setStrokeStyle(1, 0x00ff88);
        this.showRemoteQR(roomCode);
      } catch (e) {
        console.error('Remote init failed', e);
        btnRemoteTxt.setText('ERR');
        this.time.delayedCall(2000, () => btnRemoteTxt.setText('REMOTE'));
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
      } catch (err: any) {
        const msg = err?.message || JSON.stringify(err);
        console.error('[MenuScene] HRM connection failed:', msg);
        this.hrmService = null;
        this.hrmStatusDot.setFillStyle(0xff4444);
        this.hrmStatusLabel.setText('FAILED').setColor('#ff4444');
        btnHrm.setFillStyle(0x3a1a5a);
        btnHrmTxt.setText('CONNECT HRM');
      }
    });
  }

  // ── Save Banner ────────────────────────────────────────────────────────────

  private buildSaveBanner(saved: import('../services/SaveService').SavedRun): void {
    const BANNER_W = 620;

    this.saveBannerContainer = this.add.container(0, 0);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a3320, 0.85);
    bg.fillRoundedRect(-BANNER_W / 2, -18, BANNER_W, 36, 6);
    bg.lineStyle(1, 0x2a6640, 0.8);
    bg.strokeRoundedRect(-BANNER_W / 2, -18, BANNER_W, 36, 6);
    this.saveBannerContainer.add(bg);

    const rd = saved.runData;
    const date = new Date(saved.savedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const clearedEdgesArr = rd.edges.filter(e => e.isCleared);
    const clearedEdges = clearedEdgesArr.length;
    const totalElevationM = clearedEdgesArr.reduce((sum, edge) =>
      sum + edge.profile.segments.reduce((s, seg) =>
        s + (seg.grade > 0 ? seg.distanceM * seg.grade : 0), 0), 0);
    const elevStr = rd.units === 'imperial'
      ? `${Math.round(totalElevationM * 3.28084)} ft`
      : `${Math.round(totalElevationM)} m`;
    const bannerText = `SAVED RUN  ·  Floor ${clearedEdges}/${rd.runLength}  ·  ${rd.gold}g  ·  ${elevStr} gain  ·  ${dateStr}`;

    this.saveBannerContainer.add(this.add.text(-BANNER_W / 2 + 16, 0, bannerText, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#88ffaa',
      letterSpacing: 1,
    }).setOrigin(0, 0.5));

    this.saveBannerContainer.add(this.add.text(BANNER_W / 2 - 16, 0, '▲ SAVED', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#44aa66',
    }).setOrigin(1, 0.5));
  }

  /** Shown in place of the save banner when a save exists but has a stale schema version. */
  private buildIncompatibleSaveNotice(): void {
    const BANNER_W = 620;
    const bg = this.add.graphics();
    bg.fillStyle(0x2a1a00, 0.85);
    bg.fillRoundedRect(-BANNER_W / 2, -18, BANNER_W, 36, 6);
    bg.lineStyle(1, 0x886600, 0.8);
    bg.strokeRoundedRect(-BANNER_W / 2, -18, BANNER_W, 36, 6);

    const notice = this.add.container(0, 0);
    notice.add(bg);
    notice.add(this.add.text(0, 0,
      'SAVE INCOMPATIBLE  ·  Game was updated  ·  Previous run discarded  ·  Start a fresh run',
      { fontFamily: 'monospace', fontSize: '11px', color: '#ffcc44', letterSpacing: 1 },
    ).setOrigin(0.5, 0.5));

    // saveBannerContainer is used by onResize to position the banner
    this.saveBannerContainer = notice;
  }

  private buildDevToggle(): void {
    this.isDevMode = RunStateManager.getDevMode();
    this.devModeToggle = this.add.container(0, 0);

    const btn = this.add.rectangle(0, 0, 100, 24, this.isDevMode ? 0x224422 : 0x444444)
      .setInteractive({ useHandCursor: true });
    
    const txt = this.add.text(0, 0, this.isDevMode ? 'DEV MODE: ON' : 'DEV MODE: OFF', {
      fontFamily: 'monospace', fontSize: '10px', 
      color: this.isDevMode ? '#00ff00' : '#aaaaaa', 
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.devModeToggle.add([btn, txt]);

    btn.on('pointerdown', () => {
      this.isDevMode = !this.isDevMode;
      RunStateManager.setDevMode(this.isDevMode);
      txt.setText(this.isDevMode ? 'DEV MODE: ON' : 'DEV MODE: OFF');
      txt.setColor(this.isDevMode ? '#00ff00' : '#aaaaaa');
      btn.setFillStyle(this.isDevMode ? 0x224422 : 0x444444);
    });
  }

  // ── Start buttons ──────────────────────────────────────────────────────────

  private buildStartButton(): void {
    this.startBtnContainer = this.add.container(0, 0); // positioned by onResize

    const hasSave = SaveService.hasSave();
    const btnW = 215;
    const gap = 20;

    if (hasSave) {
      // Layout: [CONTINUE RUN] [START NEW RUN]
      const totalW = btnW * 2 + gap;
      const startX = -totalW / 2 + btnW / 2;
      this.buildContinueRunButton(startX, btnW);
      this.buildStartNewRunButton(startX + btnW + gap, btnW);
    } else {
      // Layout: [START RUN] (centred)
      this.buildStartRunButton(0, btnW);
    }
  }

  private buildContinueRunButton(x: number, btnW: number): void {
    const btn = this.add
      .rectangle(x, 0, btnW, 52, 0x1a7040)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, 0, '▶  CONTINUE RUN', {
      fontFamily: 'monospace', fontSize: '13px',
      color: '#ffffff', fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0.5);
    this.startBtnContainer.add([btn, txt]);

    btn.on('pointerover', () => btn.setFillStyle(0x25a558));
    btn.on('pointerout',  () => btn.setFillStyle(0x1a7040));
    btn.on('pointerdown', () => {
      const saved = SaveService.load();
      if (!saved) return;
      const run = RunStateManager.loadFromSave(saved);
      this.scene.start('MapScene', {
        weightKg: run.weightKg,
        units:    run.units,
        trainer:  this.trainerService,
        hrm:      this.hrmService,
        isDevMode: this.isDevMode,
      });
    });
  }

  private buildStartNewRunButton(x: number, btnW: number): void {
    const btn = this.add
      .rectangle(x, 0, btnW, 52, 0x6b3a00)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, 0, '▶  START NEW RUN', {
      fontFamily: 'monospace', fontSize: '12px',
      color: '#ffcc88', fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0.5);
    this.startBtnContainer.add([btn, txt]);

    let confirmPending = false;

    btn.on('pointerover', () => { if (!confirmPending) btn.setFillStyle(0xaa5a00); });
    btn.on('pointerout',  () => { if (!confirmPending) btn.setFillStyle(0x6b3a00); });
    btn.on('pointerdown', () => {
      if (!this.trainerService && !this.isDevMode) {
        if (this.isStartWarningActive) return;
        this.isStartWarningActive = true;
        const origText = '▶  START NEW RUN';
        const origColor = 0x6b3a00;
        txt.setText('TRAINER REQUIRED');
        btn.setFillStyle(0xa82222);
        this.time.delayedCall(1500, () => {
          this.isStartWarningActive = false;
          txt.setText(origText);
          btn.setFillStyle(origColor);
        });
        return;
      }

      if (!confirmPending) {
        // First click: ask for confirmation
        confirmPending = true;
        txt.setText('ERASE SAVE? CONFIRM');
        btn.setFillStyle(0xaa2222);
        this.time.delayedCall(2500, () => {
          if (confirmPending) {
            confirmPending = false;
            txt.setText('▶  START NEW RUN');
            btn.setFillStyle(0x6b3a00);
          }
        });
        return;
      }

      // Second click: confirmed — wipe save and start fresh
      confirmPending = false;
      const floors = Math.max(4, Math.round(this.distanceKm / 1.25));
      RunStateManager.startNewRun(
        floors,
        this.distanceKm,
        this.difficulty,
        this.ftpW,
        this.weightKg,
        this.units,
      );
      this.scene.start('MapScene', {
        weightKg: this.weightKg,
        units:    this.units,
        trainer:  this.trainerService,
        hrm:      this.hrmService,
        isDevMode: this.isDevMode,
      });
    });
  }

  private buildStartRunButton(x: number, btnW: number): void {
    const runBtn = this.add
      .rectangle(x, 0, btnW, 52, 0x8b5a00)
      .setInteractive({ useHandCursor: true });
    const runTxt = this.add.text(x, 0, '▶  START RUN', {
      fontFamily: 'monospace', fontSize: '15px',
      color: '#ffffff', fontStyle: 'bold', letterSpacing: 1,
    }).setOrigin(0.5);
    this.startBtnContainer.add([runBtn, runTxt]);

    runBtn.on('pointerover', () => {
      if (!this.isStartWarningActive) runBtn.setFillStyle(0xcc8800);
    });
    runBtn.on('pointerout',  () => {
      if (!this.isStartWarningActive) runBtn.setFillStyle(0x8b5a00);
    });
    runBtn.on('pointerdown', () => {
      console.log('[MenuScene] START RUN. isDevMode:', this.isDevMode);
      if (!this.trainerService && !this.isDevMode) {
        if (this.isStartWarningActive) return;
        this.isStartWarningActive = true;
        runTxt.setText('TRAINER REQUIRED');
        runBtn.setFillStyle(0xa82222);
        this.time.delayedCall(1500, () => {
          this.isStartWarningActive = false;
          runTxt.setText('▶  START RUN');
          runBtn.setFillStyle(0x8b5a00);
        });
        return;
      }

      const floors = Math.max(4, Math.round(this.distanceKm / 1.25));
      RunStateManager.startNewRun(
        floors,
        this.distanceKm,
        this.difficulty,
        this.ftpW,
        this.weightKg,
        this.units,
      );
      this.scene.start('MapScene', {
        weightKg: this.weightKg,
        units:    this.units,
        trainer:  this.trainerService,
        hrm:      this.hrmService,
        isDevMode: this.isDevMode,
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
    this.buildPresetButtons();
  }

  // ── Format helpers ─────────────────────────────────────────────────────────

  private fmtDist(km: number): string {
    const val = this.units === 'imperial' ? (km * KM_TO_MI) : km;
    const str = formatFixed(val);
    return this.units === 'imperial' ? `${str} mi` : `${str} km`;
  }

  private fmtPreset(km: number): string {
    const val = this.units === 'imperial' ? (km * KM_TO_MI) : km;
    return formatFixed(val);
  }

  private fmtWeight(kg: number): string {
    const val = this.units === 'imperial' ? (kg * KG_TO_LB) : kg;
    const str = formatFixed(val);
    return this.units === 'imperial' ? `${str} lb` : `${str} kg`;
  }

  // ── Button helper ──────────────────────────────────────────────────────────

  /**
   * Creates an interactive rectangle button + label text, adds BOTH to the
   * given container (fixing the bug where only the text was added), and
   * returns the text object so callers can store it for later updates.
   */
  /** Like addIconBtn but records created objects into presetObjects for later cleanup. */
  private addIconBtnTracked(
    container: Phaser.GameObjects.Container,
    x: number, y: number, w: number, h: number,
    label: string,
    colorNormal: number, colorHover: number,
    onClick: () => void,
    textStyle?: object,
  ): Phaser.GameObjects.Text {
    const txt = this.addIconBtn(container, x, y, w, h, label, colorNormal, colorHover, onClick, textStyle);
    // The rect was added just before txt; grab both from the container's last two entries
    const list = container.list;
    this.presetObjects.push(list[list.length - 2], list[list.length - 1]);
    return txt;
  }

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

  private async showRemoteQR(roomCode: string): Promise<void> {
    const remoteUrl = `${window.location.protocol}//${window.location.host}/remote.html?code=${roomCode}`;
    const CW = 960, CH = 540;
    const QR_SIZE = 200;
    const PANEL_W = 300, PANEL_H = 300;
    const cx = CW / 2, cy = CH / 2;

    // Backdrop
    const backdrop = this.add.rectangle(cx, cy, CW, CH, 0x000000, 0.7)
      .setDepth(100)
      .setInteractive(); // blocks clicks through

    // Panel
    const panel = this.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x1a1a2a)
      .setStrokeStyle(2, 0x00ff88)
      .setDepth(101);

    // Title
    const title = this.add.text(cx, cy - PANEL_H / 2 + 20, 'SCAN TO CONNECT', {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ff88', letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(102);

    // Code label
    const codeLabel = this.add.text(cx, cy + PANEL_H / 2 - 20, `CODE: ${roomCode}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5, 1).setDepth(102);

    // Close hint
    const closeHint = this.add.text(cx + PANEL_W / 2 - 8, cy - PANEL_H / 2 + 8, '✕', {
      fontFamily: 'monospace', fontSize: '14px', color: '#aaaaaa',
    }).setOrigin(1, 0).setDepth(102).setInteractive({ useHandCursor: true });

    const destroy = () => {
      backdrop.destroy(); panel.destroy(); title.destroy();
      codeLabel.destroy(); closeHint.destroy(); qrImage?.destroy();
    };

    backdrop.on('pointerdown', destroy);
    closeHint.on('pointerdown', destroy);

    let qrImage: Phaser.GameObjects.Image | null = null;

    try {
      const dataUrl = await QRCode.toDataURL(remoteUrl, {
        width: QR_SIZE, margin: 1,
        color: { dark: '#000000', light: '#e8dcc8' },
      });

      const texKey = `qr_${roomCode}`;
      if (this.textures.exists(texKey)) this.textures.remove(texKey);
      this.textures.addBase64(texKey, dataUrl);

      this.textures.once(`addtexture-${texKey}`, () => {
        qrImage = this.add.image(cx, cy - 4, texKey)
          .setDisplaySize(QR_SIZE, QR_SIZE)
          .setDepth(102);
      });
    } catch (e) {
      console.error('QR generation failed', e);
    }
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.hideBanner();
  }
}
