import Phaser from 'phaser';
import { THEME } from '../theme';
import { RunManager } from '../core/roguelike/RunManager';
import { Button } from '../components/Button';

export interface BaseOverlayConfig {
  scene: Phaser.Scene;
  width: number;
  height: number;
  scrollY?: number;
  runManager: RunManager;
  onClose?: () => void;
  title?: string;
  hasPanelBackground?: boolean;
}

export abstract class BaseOverlay extends Phaser.GameObjects.Container {
  protected runManager: RunManager;
  protected panelContainer: Phaser.GameObjects.Container;
  protected onClose: (() => void) | undefined;

  protected panelX: number;
  protected panelY: number;
  protected panelWidth: number;
  protected panelHeight: number;
  protected panelBg?: Phaser.GameObjects.Graphics;
  protected dimBg: Phaser.GameObjects.Graphics;

  constructor(config: BaseOverlayConfig) {
    super(config.scene, 0, config.scrollY || 0);
    this.runManager = config.runManager;
    this.onClose = config.onClose;
    this.setDepth(2000);

    const w = config.scene.scale.width;
    const h = config.scene.scale.height;

    // ── Dim background ───────────────────────────────────────────────────────
    this.dimBg = config.scene.add.graphics();
    this.dimBg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    this.dimBg.fillRect(0, 0, w, h);
    this.dimBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(this.dimBg);

    // ── Panel Geometry ───────────────────────────────────────────────────────
    this.panelWidth = config.width;
    this.panelHeight = config.height;
    this.panelX = Math.floor((w - this.panelWidth) / 2);
    this.panelY = Math.floor((h - this.panelHeight) / 2);

    // ── Panel Background ─────────────────────────────────────────────────────
    if (config.hasPanelBackground !== false) {
        this.panelBg = config.scene.add.graphics();
        this.drawPanelBackground();
        this.add(this.panelBg);
    }

    // ── Content Container ────────────────────────────────────────────────────
    // This container is positioned at the top-left of the panel area
    this.panelContainer = config.scene.add.container(this.panelX, this.panelY);
    this.add(this.panelContainer);

    // ── Title ────────────────────────────────────────────────────────────────
    if (config.title) {
        const titleText = config.scene.add.text(this.panelWidth / 2, 22, config.title.toUpperCase(), {
            fontFamily: THEME.fonts.main,
            fontSize: THEME.fonts.sizes.title,
            color: THEME.colors.text.gold,
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.panelContainer.add(titleText);
    }

    // ── Close Button ─────────────────────────────────────────────────────────
    if (this.onClose) {
        const closeBtn = new Button(config.scene, {
            x: this.panelWidth / 2,
            y: this.panelHeight - 24, // Assuming footer height roughly
            text: 'CLOSE',
            onClick: () => {
                this.destroy();
                this.onClose?.();
            },
            variant: 'secondary',
        });

        this.panelContainer.add(closeBtn);
    }

    config.scene.add.existing(this);
  }

  protected drawPanelBackground(color: number = THEME.colors.ui.panelBg, borderColor: number = THEME.colors.ui.panelBorder): void {
      if (!this.panelBg) return;
      this.panelBg.clear();
      this.panelBg.fillStyle(color, 1);
      this.panelBg.fillRoundedRect(this.panelX, this.panelY, this.panelWidth, this.panelHeight, 12);
      this.panelBg.lineStyle(2, borderColor, 1);
      this.panelBg.strokeRoundedRect(this.panelX, this.panelY, this.panelWidth, this.panelHeight, 12);
  }

  public resizePanel(width: number, height: number, color?: number, borderColor?: number): void {
      const w = this.scene.scale.width;
      const h = this.scene.scale.height;

      this.panelWidth = width;
      this.panelHeight = height;
      this.panelX = Math.floor((w - this.panelWidth) / 2);
      this.panelY = Math.floor((h - this.panelHeight) / 2);

      // Redraw background
      this.drawPanelBackground(color, borderColor);

      // Reposition container
      this.panelContainer.setPosition(this.panelX, this.panelY);
  }
}
