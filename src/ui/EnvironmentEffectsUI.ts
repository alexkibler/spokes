import Phaser from 'phaser';
import { THEME } from '../theme';
import type { SurfaceType } from '../core/course/CourseProfile';
import { getCrrForSurface } from '../core/course/CourseProfile';

export type EffectType = 'headwind' | 'tailwind';

export interface ActiveEffect {
  type: EffectType;
}

export const EFFECT_META: Record<EffectType, {
  label: string;
  multiplier: number;
  color: number;
  hexColor: string;
}> = {
  headwind: { label: 'HEADWIND', multiplier: 0.5, color: 0xff5544, hexColor: '#ff5544' },
  tailwind: { label: 'TAILWIND', multiplier: 2,   color: 0xffcc00, hexColor: '#ffcc00' },
};

const SURFACE_LABELS: Record<SurfaceType, string> = {
  asphalt: 'ASPHALT',
  gravel:  'GRAVEL',
  dirt:    'DIRT',
  mud:     'MUD',
};

export class EnvironmentEffectsUI {
  private scene: Phaser.Scene;
  private effectContainer!:   Phaser.GameObjects.Container;
  private effectNameText!:    Phaser.GameObjects.Text;

  private btnHeadwind!: Phaser.GameObjects.Rectangle;
  private btnTailwind!: Phaser.GameObjects.Rectangle;
  private btnHeadwindLabel!: Phaser.GameObjects.Text;
  private btnTailwindLabel!: Phaser.GameObjects.Text;

  private notifContainer!: Phaser.GameObjects.Container;
  private notifTitle!:     Phaser.GameObjects.Text;
  private notifSub!:       Phaser.GameObjects.Text;
  private notifTween:      Phaser.Tweens.Tween | null = null;

  private activeEffect: ActiveEffect | null = null;
  private onEffectChange: (effect: ActiveEffect | null) => void;

  constructor(scene: Phaser.Scene, onEffectChange: (effect: ActiveEffect | null) => void) {
    this.scene = scene;
    this.onEffectChange = onEffectChange;
    this.buildEffectUI();
    this.buildManualEffectButtons();
  }

  private buildEffectUI(): void {
    const cx = 860, cy = 230;
    this.effectContainer = this.scene.add.container(cx, cy).setDepth(15).setAlpha(0);
    const bgGfx = this.scene.add.graphics();
    bgGfx.fillStyle(THEME.colors.ui.hudBackground, 0.65);
    bgGfx.fillCircle(0, 0, 42);
    this.effectContainer.add(bgGfx);
    this.effectNameText = this.scene.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, fontStyle: 'bold', color: THEME.colors.text.main, align: 'center' }).setOrigin(0.5);
    this.effectContainer.add(this.effectNameText);

    this.notifContainer = this.scene.add.container(this.scene.scale.width / 2, 200).setDepth(20).setAlpha(0);
    const notifBg = this.scene.add.graphics();
    notifBg.fillStyle(THEME.colors.ui.hudBackground, 0.80);
    notifBg.fillRect(-175, -38, 350, 76);
    this.notifContainer.add(notifBg);
    this.notifTitle = this.scene.add.text(0, -12, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.hudValue, fontStyle: 'bold', color: THEME.colors.text.main, align: 'center' }).setOrigin(0.5);
    this.notifContainer.add(this.notifTitle);
    this.notifSub = this.scene.add.text(0, 18, '', { fontFamily: THEME.fonts.main, fontSize: '11px', color: '#cccccc', align: 'center', letterSpacing: 2 }).setOrigin(0.5);
    this.notifContainer.add(this.notifSub);
  }

  private buildManualEffectButtons(): void {
    const x = 860;
    this.btnHeadwind = this.scene.add.rectangle(x, 120, 100, 34, 0x444444).setInteractive({ useHandCursor: true }).setDepth(15);
    this.btnHeadwindLabel = this.scene.add.text(x, 120, 'HEADWIND', { fontFamily: THEME.fonts.main, fontSize: '12px', color: THEME.colors.text.main }).setOrigin(0.5).setDepth(16);
    this.btnTailwind = this.scene.add.rectangle(x, 170, 100, 34, 0x444444).setInteractive({ useHandCursor: true }).setDepth(15);
    this.btnTailwindLabel = this.scene.add.text(x, 170, 'TAILWIND', { fontFamily: THEME.fonts.main, fontSize: '12px', color: THEME.colors.text.main }).setOrigin(0.5).setDepth(16);

    this.btnHeadwind.on('pointerdown', () => this.toggleEffect('headwind'));
    this.btnTailwind.on('pointerdown', () => this.toggleEffect('tailwind'));
    this.updateEffectButtonStyles();
  }

  private toggleEffect(type: EffectType): void {
    if (this.activeEffect?.type === type) { this.clearEffect(); } else { this.triggerEffect(type); }
    this.updateEffectButtonStyles();
  }

  public triggerEffect(type: EffectType): void {
    const meta = EFFECT_META[type];
    this.activeEffect = { type };
    this.effectContainer.setAlpha(1);
    this.effectNameText.setText(type === 'headwind' ? 'ACTIVE:\nHEADWIND' : 'ACTIVE:\nTAILWIND').setColor(meta.hexColor);
    this.notifTitle.setText(meta.label + '!').setColor(meta.hexColor);
    this.notifSub.setText(`x${meta.multiplier} POWER MULTIPLIER`);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.scene.tweens.add({ targets: this.notifContainer, alpha: 0, delay: 2000, duration: 500, ease: 'Power2' });
    this.onEffectChange(this.activeEffect);
    this.updateEffectButtonStyles();
  }

  public clearEffect(): void {
    this.activeEffect = null;
    this.effectContainer.setAlpha(0);
    this.onEffectChange(null);
    this.updateEffectButtonStyles();
  }

  public getActiveEffect(): ActiveEffect | null {
    return this.activeEffect;
  }

  private updateEffectButtonStyles(): void {
    const isHead = this.activeEffect?.type === 'headwind';
    const isTail = this.activeEffect?.type === 'tailwind';
    this.btnHeadwind.setFillStyle(isHead ? 0xff5544 : 0x444444);
    this.btnTailwind.setFillStyle(isTail ? 0xffcc00 : 0x444444);
  }

  public showSurfaceNotification(surface: SurfaceType): void {
    const sub = surface === 'asphalt' ? 'BACK ON SMOOTH ROAD' : `+${Math.round((getCrrForSurface(surface) / getCrrForSurface('asphalt') - 1) * 100)}% ROLLING RESISTANCE`;
    this.showNotification(
      SURFACE_LABELS[surface],
      sub,
      THEME.colors.surfaces[surface] ? '#' + THEME.colors.surfaces[surface].toString(16) : '#aaaaaa'
    );
  }

  public showNotification(title: string, subtitle: string, color: string): void {
    this.notifTitle.setText(title).setColor(color);
    this.notifSub.setText(subtitle);
    if (this.notifTween) this.notifTween.stop();
    this.notifContainer.setAlpha(1);
    this.notifTween = this.scene.tweens.add({ targets: this.notifContainer, alpha: 0, delay: 2000, duration: 500, ease: 'Power2' });
  }

  public onResize(width: number, _height: number): void {
    const cx = width / 2;
    // Effect Buttons
    const effectBtnX = width - 100;
    if (this.btnHeadwind) {
      this.btnHeadwind.setPosition(effectBtnX, 120);
      if (this.btnHeadwindLabel) this.btnHeadwindLabel.setPosition(effectBtnX, 120);
    }
    if (this.btnTailwind) {
      this.btnTailwind.setPosition(effectBtnX, 170);
      if (this.btnTailwindLabel) this.btnTailwindLabel.setPosition(effectBtnX, 170);
    }

    // Notifications
    if (this.notifContainer) this.notifContainer.setPosition(cx, 200);
    if (this.effectContainer) this.effectContainer.setPosition(width - 100, 230);
  }
}
