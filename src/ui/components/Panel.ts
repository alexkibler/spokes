import Phaser from 'phaser';
import { THEME } from '../../theme';

export interface PanelConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  onClose?: () => void;
  depth?: number;
}

export class Panel extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private titleText?: Phaser.GameObjects.Text;
  private closeButton?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: PanelConfig) {
    super(scene, config.x, config.y);

    this.setSize(config.width, config.height);

    // Draw Background
    this.background = scene.add.graphics();
    this.background.fillStyle(THEME.colors.ui.panelBg, 0.95);
    this.background.fillRoundedRect(0, 0, config.width, config.height, THEME.layout.borderRadius);
    this.background.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    this.background.strokeRoundedRect(0, 0, config.width, config.height, THEME.layout.borderRadius);
    this.add(this.background);

    // Title
    if (config.title) {
      this.titleText = scene.add.text(config.width / 2, 24, config.title.toUpperCase(), {
        fontFamily: THEME.fonts.main,
        fontSize: THEME.fonts.sizes.large,
        fontStyle: 'bold',
        color: THEME.colors.text.gold,
        letterSpacing: 2,
      }).setOrigin(0.5);
      this.add(this.titleText);
    }

    // Close Button
    if (config.onClose) {
      this.closeButton = scene.add.text(config.width - 20, 20, '✕', {
        fontFamily: THEME.fonts.main,
        fontSize: '18px',
        color: THEME.colors.text.muted,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      this.closeButton.on('pointerover', () => this.closeButton!.setColor(THEME.colors.text.danger));
      this.closeButton.on('pointerout', () => this.closeButton!.setColor(THEME.colors.text.muted));
      this.closeButton.on('pointerdown', config.onClose);

      this.add(this.closeButton);
    }

    if (config.depth !== undefined) {
      this.setDepth(config.depth);
    }

    this.setScrollFactor(0); // Panels are usually fixed to HUD
    scene.add.existing(this);
  }
}
