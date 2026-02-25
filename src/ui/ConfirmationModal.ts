import Phaser from 'phaser';
import { THEME } from '../theme';

interface ConfirmationModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: number; // Defaults to success/primary
  onConfirm: () => void;
  onCancel?: () => void;
}

export class ConfirmationModal extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, opts: ConfirmationModalOptions) {
    super(scene);
    this.setDepth(3000); // High depth

    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // Dim background
    const dim = scene.add.graphics();
    dim.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    dim.fillRect(0, 0, w, h);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal Panel
    const MW = 400;
    const MH = 220;
    const panel = scene.add.graphics();
    panel.fillStyle(THEME.colors.ui.panelBg, 1);
    panel.fillRoundedRect(cx - MW / 2, cy - MH / 2, MW, MH, 12);
    panel.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    panel.strokeRoundedRect(cx - MW / 2, cy - MH / 2, MW, MH, 12);
    this.add(panel);

    // Title
    const title = scene.add.text(cx, cy - MH / 2 + 30, opts.title.toUpperCase(), {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      color: THEME.colors.text.gold,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add(title);

    // Message
    const msg = scene.add.text(cx, cy - MH / 2 + 80, opts.message, {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.default,
      color: THEME.colors.text.main,
      align: 'center',
      wordWrap: { width: MW - 40 }
    }).setOrigin(0.5);
    this.add(msg);

    // Buttons
    const btnY = cy + MH / 2 - 40;
    const btnW = 120;
    const btnH = 36;
    const gap = 20;

    // Confirm Button
    const confirmLabel = opts.confirmLabel ?? 'CONFIRM';
    const confirmColor = opts.confirmColor ?? THEME.colors.buttons.primary;

    const confirmBtn = scene.add.rectangle(cx + btnW / 2 + gap / 2, btnY, btnW, btnH, confirmColor)
      .setInteractive({ useHandCursor: true });
    const confirmTxt = scene.add.text(confirmBtn.x, confirmBtn.y, confirmLabel, {
      fontFamily: THEME.fonts.main, fontSize: '12px', color: THEME.colors.text.main, fontStyle: 'bold'
    }).setOrigin(0.5);

    confirmBtn.on('pointerover', () => confirmBtn.setAlpha(0.8));
    confirmBtn.on('pointerout', () => confirmBtn.setAlpha(1));
    confirmBtn.on('pointerdown', () => {
      this.destroy();
      opts.onConfirm();
    });

    // Cancel Button
    const cancelLabel = opts.cancelLabel ?? 'CANCEL';
    const cancelBtn = scene.add.rectangle(cx - btnW / 2 - gap / 2, btnY, btnW, btnH, THEME.colors.buttons.secondary)
      .setInteractive({ useHandCursor: true });
    const cancelTxt = scene.add.text(cancelBtn.x, cancelBtn.y, cancelLabel, {
      fontFamily: THEME.fonts.main, fontSize: '12px', color: THEME.colors.text.muted, fontStyle: 'bold'
    }).setOrigin(0.5);

    cancelBtn.on('pointerover', () => cancelBtn.setAlpha(0.8));
    cancelBtn.on('pointerout', () => cancelBtn.setAlpha(1));
    cancelBtn.on('pointerdown', () => {
      this.destroy();
      if (opts.onCancel) opts.onCancel();
    });

    this.add([confirmBtn, confirmTxt, cancelBtn, cancelTxt]);

    scene.add.existing(this);
  }
}
