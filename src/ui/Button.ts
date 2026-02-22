import Phaser from 'phaser';
import { THEME } from '../theme';

export interface ButtonConfig {
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  onClick: () => void;
  color?: number;
  hoverColor?: number;
  textColor?: string;
  fontSize?: string;
  scrollFactor?: number;
}

export class Button extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private baseColor: number;
  private hoverColor: number;

  constructor(scene: Phaser.Scene, config: ButtonConfig) {
    super(scene, config.x, config.y);

    const width = config.width ?? 120;
    const height = config.height ?? 34;
    this.baseColor = config.color ?? THEME.colors.buttons.primary;
    this.hoverColor = config.hoverColor ?? THEME.colors.buttons.primaryHover;

    this.background = scene.add.rectangle(0, 0, width, height, this.baseColor);
    this.add(this.background);

    this.label = scene.add.text(0, 0, config.text, {
      fontFamily: THEME.fonts.main,
      fontSize: config.fontSize ?? THEME.fonts.sizes.default,
      color: config.textColor ?? '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
    this.add(this.label);

    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });

    if (config.scrollFactor !== undefined) {
      this.setScrollFactor(config.scrollFactor);
    }

    this.on('pointerover', this.onHover, this);
    this.on('pointerout', this.onOut, this);
    this.on('pointerdown', config.onClick, this);

    scene.add.existing(this);
  }

  private onHover(): void {
    this.background.setFillStyle(this.hoverColor);
  }

  private onOut(): void {
    this.background.setFillStyle(this.baseColor);
  }

  public setText(text: string): void {
    this.label.setText(text);
  }

  public setEnabled(enabled: boolean): void {
    if (enabled) {
      this.setInteractive();
      this.background.setFillStyle(this.baseColor);
      this.label.setAlpha(1);
    } else {
      this.disableInteractive();
      this.background.setFillStyle(THEME.colors.buttons.disabled);
      this.label.setAlpha(0.5);
    }
  }
}
