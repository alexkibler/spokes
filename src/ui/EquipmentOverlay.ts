import Phaser from 'phaser';
import { THEME } from '../theme';
import { EquipmentPanel } from './EquipmentPanel';
import { RunManager } from '../core/roguelike/RunManager';
import { BaseOverlay } from './BaseOverlay';
import { Button } from '../components/Button';

export class EquipmentOverlay extends BaseOverlay {
  private panel: EquipmentPanel;
  private closeBtn: Button;
  private closeHit: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, scrollY: number, runManager: RunManager, onClose: () => void) {
    // Initial panel creation to get height
    // We can't add it to scene yet if we want to add it to container later?
    // EquipmentPanel extends Container, so `new EquipmentPanel(scene, ...)` adds it to scene if we don't handle it.
    // EquipmentPanel constructor calls `super(scene, x, y)`.
    // We can create it, then remove from scene and add to our container.
    // Or just create it.

    // We need the height before calling super?
    // EquipmentPanel calculates height in constructor.
    // So we can instantiate it, read height, then call super?
    // No, `this` is not accessible before super.

    // We can pass a dummy height to super, then resize.

    super({
        scene,
        width: 520,
        height: 400, // Dummy
        scrollY,
        runManager,
        onClose: undefined,
        hasPanelBackground: false
    });

    this.onClose = onClose;

    this.panel = new EquipmentPanel(scene, 0, 0, runManager);
    this.panelContainer.add(this.panel);

    this.panel.onHeightChanged = () => this.updateLayout();

    // Close button (below panel)
    this.closeBtn = new Button(scene, {
        x: 260, // 520 / 2
        y: 0, // set in updateLayout
        text: 'CLOSE',
        onClick: () => {
            this.destroy();
            this.onClose?.();
        },
        variant: 'secondary',
    });
    this.panelContainer.add(this.closeBtn);

    // Close 'X' hit area (top right of panel)
    // EquipmentPanel width is 520.
    this.closeHit = scene.add.text(500, 18, '×', {
      fontFamily: THEME.fonts.main, fontSize: '24px', color: THEME.colors.text.muted,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.closeHit.on('pointerover', () => this.closeHit.setColor(THEME.colors.text.main));
    this.closeHit.on('pointerout',  () => this.closeHit.setColor(THEME.colors.text.muted));
    this.closeHit.on('pointerdown', () => { this.destroy(); this.onClose?.(); });
    this.panelContainer.add(this.closeHit);

    this.updateLayout();
  }

  private updateLayout(): void {
      const panelH = this.panel.panelHeight;
      const totalH = panelH + 60; // Space for button

      this.resizePanel(520, totalH);

      // Panel is at 0,0 in panelContainer
      // Close button
      this.closeBtn.setPosition(260, panelH + 20);

      // Close hit 'X'
      this.closeHit.setPosition(500, 18);
  }
}
