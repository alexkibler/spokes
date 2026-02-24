import Phaser from 'phaser';
import { THEME } from '../../theme';
import { EquipmentPanel } from './EquipmentPanel';
import { RunManager } from '../../roguelike/RunState';

export class EquipmentOverlay extends Phaser.GameObjects.Container {
  private onClose: () => void;
  private panel: EquipmentPanel;
  private closeBg: Phaser.GameObjects.Rectangle;
  private closeLbl: Phaser.GameObjects.Text;
  private closeHit: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, scrollY: number, runManager: RunManager, onClose: () => void) {
    super(scene, 0, scrollY);
    this.setDepth(2100);
    this.onClose = onClose;

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background — blocks all input beneath the overlay.
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    this.panel = new EquipmentPanel(scene, 0, 0, runManager);
    this.panel.onHeightChanged = () => this.positionElements();
    this.add(this.panel);

    this.closeBg = scene.add.rectangle(0, 0, 120, 30, THEME.colors.buttons.secondary)
      .setInteractive({ useHandCursor: true });
    this.closeLbl = scene.add.text(0, 0, 'CLOSE', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.closeBg.on('pointerover', () => this.closeBg.setFillStyle(THEME.colors.buttons.secondaryHover));
    this.closeBg.on('pointerout',  () => this.closeBg.setFillStyle(THEME.colors.buttons.secondary));
    this.closeBg.on('pointerdown', () => { this.destroy(); this.onClose(); });

    this.add([this.closeBg, this.closeLbl]);

    this.closeHit = scene.add.text(0, 0, '×', {
      fontFamily: THEME.fonts.main, fontSize: '24px', color: THEME.colors.text.muted,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.closeHit.on('pointerover', () => this.closeHit.setColor(THEME.colors.text.main));
    this.closeHit.on('pointerout',  () => this.closeHit.setColor(THEME.colors.text.muted));
    this.closeHit.on('pointerdown', () => { this.destroy(); this.onClose(); });
    this.add(this.closeHit);

    this.positionElements();

    scene.add.existing(this);
  }

  private positionElements(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cx = w / 2;

    const panelW = 520;
    const panelH = this.panel.panelHeight;

    const px = cx - panelW / 2;
    const py = Math.max(10, (h - panelH - 52) / 2);

    this.panel.setPosition(px, py);

    const closeBtnY = py + panelH + 20;
    this.closeBg.setPosition(cx, closeBtnY);
    this.closeLbl.setPosition(cx, closeBtnY);

    this.closeHit.setPosition(px + panelW - 20, py + 18);
  }
}
