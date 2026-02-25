import Phaser from 'phaser';
import { THEME } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

export interface ButtonConfig {
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fontSize?: string;
  textColor?: string;
  scrollFactor?: number;
}

export class Button extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  private baseColor: number;
  private hoverColor: number;
  private isDisabled: boolean = false;

  constructor(scene: Phaser.Scene, config: ButtonConfig) {
    super(scene, config.x, config.y);

    const width = config.width ?? 140;
    const height = config.height ?? 40;
    this.isDisabled = config.disabled ?? false;

    // Resolve colors based on variant
    const variant = config.variant || 'primary';

    // Explicit mapping to avoid TS index errors and missing hover states
    switch (variant) {
      case 'primary':
        this.baseColor = THEME.colors.buttons.primary;
        this.hoverColor = THEME.colors.buttons.primaryHover;
        break;
      case 'secondary':
        this.baseColor = THEME.colors.buttons.secondary;
        this.hoverColor = THEME.colors.buttons.secondaryHover;
        break;
      case 'danger':
        this.baseColor = THEME.colors.buttons.danger;
        this.hoverColor = THEME.colors.buttons.dangerHover;
        break;
      case 'success':
        this.baseColor = THEME.colors.buttons.success;
        this.hoverColor = 0x008877; // Manually brighter
        break;
      default:
        this.baseColor = THEME.colors.buttons.primary;
        this.hoverColor = THEME.colors.buttons.primaryHover;
    }

    this.background = scene.add.rectangle(0, 0, width, height, this.isDisabled ? THEME.colors.buttons.disabled : this.baseColor);
    // Add subtle stroke
    this.background.setStrokeStyle(1, 0xffffff, 0.2);

    this.add(this.background);

    this.label = scene.add.text(0, 0, config.text, {
      fontFamily: THEME.fonts.main,
      fontSize: config.fontSize ?? THEME.fonts.sizes.default,
      color: this.isDisabled ? THEME.colors.text.muted : (config.textColor ?? '#ffffff'),
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.label);

    this.setSize(width, height);

    if (config.scrollFactor !== undefined) {
      this.setScrollFactor(config.scrollFactor);
    }

    if (!this.isDisabled) {
      this.setInteractive({ useHandCursor: true });
      this.on('pointerover', this.onHover, this);
      this.on('pointerout', this.onOut, this);
      this.on('pointerdown', () => {
         this.background.setFillStyle(this.hoverColor, 0.8); // Click feedback
         this.scene.time.delayedCall(100, () => {
             if (!this.isDisabled) this.background.setFillStyle(this.hoverColor);
         });
         config.onClick();
      });
    }

    scene.add.existing(this);
  }

  private onHover(): void {
    if (this.isDisabled) return;
    this.background.setFillStyle(this.hoverColor);
    this.label.setScale(1.05);
  }

  private onOut(): void {
    if (this.isDisabled) return;
    this.background.setFillStyle(this.baseColor);
    this.label.setScale(1);
  }

  public setText(text: string): void {
    this.label.setText(text);
  }

  public getText(): string {
    return this.label.text;
  }

  public setTextColor(color: string): void {
    this.label.setColor(color);
  }

  public setEnabled(enabled: boolean): void {
    this.isDisabled = !enabled;
    if (enabled) {
      this.setInteractive({ useHandCursor: true });
      this.background.setFillStyle(this.baseColor);
      this.label.setColor('#ffffff');
      this.label.setAlpha(1);
    } else {
      this.disableInteractive();
      this.background.setFillStyle(THEME.colors.buttons.disabled);
      this.label.setColor(THEME.colors.text.muted);
      this.label.setAlpha(0.7);
    }
  }
}
