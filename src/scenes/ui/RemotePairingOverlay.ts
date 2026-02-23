import Phaser from 'phaser';
import QRCode from 'qrcode';
import { THEME } from '../../theme';

export class RemotePairingOverlay extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, roomCode: string, onClose: () => void) {
    super(scene);
    this.setDepth(3000);

    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    const PANEL_W = 320;
    const PANEL_H = 380;

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
    const title = scene.add.text(cx, cy - PANEL_H / 2 + 25, 'SCAN TO CONNECT', {
      fontFamily: THEME.fonts.main, fontSize: '12px', color: '#00ff88', letterSpacing: 2,
    }).setOrigin(0.5, 0);
    this.add(title);

    // URL Label
    const remoteUrl = `${window.location.protocol}//${window.location.host}/remote.html?code=${roomCode}`;
    const urlLabel = scene.add.text(cx, cy - PANEL_H / 2 + 50, remoteUrl, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#8888aa', align: 'center',
      wordWrap: { width: PANEL_W - 30 }
    }).setOrigin(0.5, 0);
    this.add(urlLabel);

    // Code Label
    const codeLabel = scene.add.text(cx, cy + PANEL_H / 2 - 25, `CODE: ${roomCode}`, {
      fontFamily: THEME.fonts.main, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 1);
    this.add(codeLabel);

    // Close Hint
    const closeHit = scene.add.text(cx + PANEL_W / 2 - 8, cy - PANEL_H / 2 + 8, '✕', {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: THEME.colors.text.muted,
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeHit.on('pointerdown', () => { this.destroy(); onClose(); });
    this.add(closeHit);

    // QR Code
    const QR_SIZE = 200;
    const qrY = cy + 20;

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
         const qrImage = this.scene.add.image(cx, qrY, texKey)
           .setDisplaySize(QR_SIZE, QR_SIZE);
         this.add(qrImage);
      });
    }).catch((err) => {
        console.error('QR generation failed', err);
    });

    scene.add.existing(this);
  }
}
