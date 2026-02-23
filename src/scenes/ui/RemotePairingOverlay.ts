import Phaser from 'phaser';
import QRCode from 'qrcode';
import { THEME } from '../../theme';
import { FocusManager } from '../../ui/FocusManager';

export class RemotePairingOverlay extends Phaser.GameObjects.Container {
  public focusManager: FocusManager;

  constructor(scene: Phaser.Scene, roomCode: string, onClose: () => void) {
    super(scene);
    this.setDepth(3000);

    this.focusManager = new FocusManager(scene);

    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const PANEL_W = 300;
    const PANEL_H = 300;

    // Dim Background
    const bg = scene.add.rectangle(cx, cy, w, h, THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerdown', () => { this.destroy(); onClose(); });
    this.add(bg);

    // Panel
    const panel = scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, THEME.colors.ui.panelBg)
      .setStrokeStyle(2, THEME.colors.status.ok);
    this.add(panel);

    // Title
    const title = scene.add.text(cx, cy - PANEL_H / 2 + 20, 'SCAN TO CONNECT', {
      fontFamily: THEME.fonts.main, fontSize: '12px', color: '#00ff88', letterSpacing: 2,
    }).setOrigin(0.5, 0);
    this.add(title);

    // Code Label
    const codeLabel = scene.add.text(cx, cy + PANEL_H / 2 - 20, `CODE: ${roomCode}`, {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5, 1);
    this.add(codeLabel);

    // Close Hint
    const closeHit = scene.add.text(cx + PANEL_W / 2 - 8, cy - PANEL_H / 2 + 8, '✕', {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: THEME.colors.text.muted,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });

    const doClose = () => { this.destroy(); onClose(); };
    closeHit.on('pointerdown', doClose);

    this.focusManager.add({
        object: closeHit,
        onFocus: () => closeHit.setColor(THEME.colors.text.main),
        onBlur: () => closeHit.setColor(THEME.colors.text.muted),
        onSelect: doClose
    });
    // Default focus
    this.focusManager.focus({ object: closeHit } as any);

    this.add(closeHit);

    // QR Code
    const remoteUrl = `${window.location.protocol}//${window.location.host}/remote.html?code=${roomCode}`;
    const QR_SIZE = 200;

    // Generate QR
    QRCode.toDataURL(remoteUrl, {
      width: QR_SIZE, margin: 1,
      color: { dark: '#000000', light: '#e8dcc8' },
    }).then((dataUrl) => {
      if (!this.scene) return; // Scene might be destroyed
      const texKey = `qr_${roomCode}`;
      if (this.scene.textures.exists(texKey)) {
        this.scene.textures.remove(texKey);
      }
      this.scene.textures.addBase64(texKey, dataUrl);

      this.scene.textures.once(`addtexture-${texKey}`, () => {
         if (!this.scene) return;
         const qrImage = this.scene.add.image(cx, cy - 4, texKey)
           .setDisplaySize(QR_SIZE, QR_SIZE);
         this.add(qrImage);
      });
    }).catch((err) => {
        console.error('QR generation failed', err);
    });

    scene.add.existing(this);
  }
}
