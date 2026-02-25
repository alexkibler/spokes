import Phaser from 'phaser';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';

export class BottomControls {
  private scene: Phaser.Scene;
  private bottomStrip!: Phaser.GameObjects.Graphics;
  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private btnMenu!: Button;
  private btnRemote!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, onPause: () => void, onRemoteClick: () => void) {
    this.scene = scene;
    this.buildBottomControls(onPause);
    this.buildRemoteButton(onRemoteClick);
  }

  private buildBottomControls(onPause: () => void): void {
    this.bottomStrip = this.scene.add.graphics().setDepth(10);
    this.statusDot = this.scene.add.arc(0, 0, 5, 0, 360, false, THEME.colors.status.off).setDepth(11);
    this.statusLabel = this.scene.add.text(0, 0, 'DISCONNECTED', { fontFamily: THEME.fonts.main, fontSize: '11px', color: '#' + THEME.colors.status.off.toString(16).padStart(6, '0') }).setOrigin(0, 0.5).setDepth(11);

    this.btnMenu = new Button(this.scene, {
      x: 0, y: 0, width: 120, height: 34,
      text: 'PAUSE',
      variant: 'primary',
      textColor: THEME.colors.text.main,
      onClick: onPause,
    });
    this.btnMenu.setDepth(11);
  }

  private buildRemoteButton(onClick: () => void): void {
    const x = this.scene.scale.width - 40;
    this.btnRemote = this.scene.add.text(x, 40, 'CONNECTING...', {
      fontFamily: THEME.fonts.main,
      fontSize: '20px',
      fontStyle: 'bold',
      color: THEME.colors.text.accent,
    })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);

    this.btnRemote.on('pointerdown', onClick);
  }

  public setStatus(state: 'ok' | 'demo' | 'off' | 'err', label: string): void {
    const col = THEME.colors.status[state] ?? 0x555566;
    const hex = '#' + col.toString(16).padStart(6, '0');
    this.statusDot.setFillStyle(col);
    this.statusLabel.setText(label).setColor(hex);
  }

  public setRemoteStatus(text: string, color?: string): void {
      if (this.btnRemote && this.scene.sys.isActive()) {
          this.btnRemote.setText(text);
          if (color) this.btnRemote.setColor(color);
      }
  }

  public onResize(width: number, height: number): void {
    if (this.bottomStrip) {
      this.bottomStrip.clear();
      this.bottomStrip.fillStyle(THEME.colors.ui.hudBackground, 0.50);
      this.bottomStrip.fillRect(0, height - THEME.layout.bottomStripHeight, width, THEME.layout.bottomStripHeight);

      const stY = height - 25;
      if (this.statusDot)   this.statusDot.setPosition(56, stY);
      if (this.statusLabel) this.statusLabel.setPosition(68, stY);

      // Re-position menu button (Container)
      if (this.btnMenu) {
        this.btnMenu.setPosition(width - 90, stY);
      }
    }

    if (this.btnRemote) {
        this.btnRemote.setPosition(width - 40, 40);
    }
  }
}
