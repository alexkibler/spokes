import Phaser from 'phaser';
import { type RunData } from '../../roguelike/RunState';
import { THEME } from '../../theme';
import { RemoteService } from '../../services/RemoteService';

export class MapHUD {
  private scene: Phaser.Scene;

  private goldText!: Phaser.GameObjects.Text;

  private teleportBg: Phaser.GameObjects.Rectangle | null = null;
  private teleportTxt: Phaser.GameObjects.Text | null = null;

  private gearBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private gearBtnTxt: Phaser.GameObjects.Text | null = null;

  private remoteBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private remoteBtnTxt: Phaser.GameObjects.Text | null = null;

  private returnBtnBg: Phaser.GameObjects.Rectangle | null = null;
  private returnBtnTxt: Phaser.GameObjects.Text | null = null;

  private onGearClick: () => void;
  private onRemoteClick: () => void;
  private onReturnClick: () => void;
  private onTeleportClick: () => void;

  constructor(
    scene: Phaser.Scene,
    callbacks: {
      onGearClick: () => void;
      onRemoteClick: () => void;
      onReturnClick: () => void;
      onTeleportClick: () => void;
    }
  ) {
    this.scene = scene;
    this.onGearClick = callbacks.onGearClick;
    this.onRemoteClick = callbacks.onRemoteClick;
    this.onReturnClick = callbacks.onReturnClick;
    this.onTeleportClick = callbacks.onTeleportClick;

    this.createStaticElements();
  }

  private createStaticElements(): void {
    // Title
    this.scene.add.text(this.scene.scale.width / 2, 30, 'ROGUELIKE RUN', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.hero,
      color: THEME.colors.text.dark,
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    // Gold Text
    this.goldText = this.scene.add.text(this.scene.scale.width - 20, 20, 'GOLD: 0', {
      fontFamily: THEME.fonts.main, fontSize: '20px', color: THEME.colors.text.gold, fontStyle: 'bold',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);

    // Buttons
    this.createGearButton();
    this.createRemoteButton();
    // Return button depends on state, created dynamically or hidden
  }

  public update(run: RunData, isTeleportMode: boolean): void {
    // Update Gold
    this.goldText.setText(`GOLD: ${run.gold}`);
    this.goldText.setX(this.scene.scale.width - 20);

    // Update Teleport Button
    this.updateTeleportButton(run, isTeleportMode);

    // Update Return Button
    this.updateReturnButton(run);

    // Update Remote Button (status check)
    this.updateRemoteButton();
  }

  private createGearButton(): void {
    // Position at top-left
    this.gearBtnBg = this.scene.add.rectangle(70, 20, 130, 26, THEME.colors.buttons.primary)
      .setScrollFactor(0).setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.gearBtnTxt = this.scene.add.text(70, 20, '⚙ EQUIPMENT', {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ccccff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.gearBtnBg.on('pointerover', () => this.gearBtnBg!.setFillStyle(THEME.colors.buttons.primaryHover));
    this.gearBtnBg.on('pointerout',  () => this.gearBtnBg!.setFillStyle(THEME.colors.buttons.primary));
    this.gearBtnBg.on('pointerdown', this.onGearClick);
  }

  private createRemoteButton(): void {
    // Initial creation
    const y = 52;
    this.remoteBtnBg = this.scene.add.rectangle(70, y, 130, 26, THEME.colors.buttons.primary)
      .setScrollFactor(0).setDepth(30)
      .setInteractive({ useHandCursor: true });

    this.remoteBtnTxt = this.scene.add.text(70, y, '📡 REMOTE', {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: '#ccccff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

    this.remoteBtnBg.on('pointerover', () => this.remoteBtnBg!.setFillStyle(THEME.colors.buttons.primaryHover));
    this.remoteBtnBg.on('pointerout',  () => this.remoteBtnBg!.setFillStyle(THEME.colors.buttons.primary));
    this.remoteBtnBg.on('pointerdown', this.onRemoteClick);
  }

  public setRemoteButtonText(text: string, color?: string): void {
    if (this.remoteBtnTxt) {
        this.remoteBtnTxt.setText(text);
        if (color) this.remoteBtnTxt.setColor(color);
    }
  }

  private updateRemoteButton(): void {
    const code = RemoteService.getInstance().getRoomCode();
    const isConnected = !!code;
    const label = isConnected ? `REMOTE: ${code}` : '📡 REMOTE';
    const color = isConnected ? '#00ff88' : '#ccccff';

    if (this.remoteBtnTxt) {
         const currentText = this.remoteBtnTxt.text;
         // If connected, always show code.
         // If disconnected, respect transient messages.
         if (!isConnected && (currentText === 'CONNECTING...' || currentText === 'ERR')) {
             return;
         }

         this.remoteBtnTxt.setText(label);
         this.remoteBtnTxt.setColor(color);
    }
  }

  private updateTeleportButton(run: RunData, isTeleportMode: boolean): void {
    const teleCount = run.inventory.filter(i => i === 'teleport').length;
    const teleX = this.scene.scale.width - 90;

    if (teleCount > 0) {
      if (!this.teleportBg) {
        this.teleportBg = this.scene.add.rectangle(teleX, 60, 160, 30, THEME.colors.buttons.primary)
          .setScrollFactor(0).setDepth(20)
          .setInteractive({ useHandCursor: true });
        this.teleportTxt = this.scene.add.text(teleX, 60, `TELEPORT (${teleCount})`, {
          fontFamily: THEME.fonts.main, fontSize: '12px', color: '#ff88ff', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(21);

        this.teleportBg.on('pointerdown', this.onTeleportClick);
        this.teleportBg.on('pointerover', () =>
          this.teleportBg!.setFillStyle(isTeleportMode ? 0x995599 : THEME.colors.buttons.primaryHover));
        this.teleportBg.on('pointerout', () =>
          this.teleportBg!.setFillStyle(isTeleportMode ? 0x884488 : THEME.colors.buttons.primary));
      } else {
        this.teleportBg.setVisible(true).setX(teleX);
        this.teleportTxt!.setVisible(true).setX(teleX);
        this.teleportTxt!.setText(isTeleportMode ? 'CANCEL TELEPORT' : `TELEPORT (${teleCount})`);
        this.teleportBg.setFillStyle(isTeleportMode ? 0x884488 : THEME.colors.buttons.primary);

        // Update listeners for hover state based on mode
        this.teleportBg.off('pointerover').on('pointerover', () =>
            this.teleportBg!.setFillStyle(isTeleportMode ? 0x995599 : THEME.colors.buttons.primaryHover));
        this.teleportBg.off('pointerout').on('pointerout', () =>
            this.teleportBg!.setFillStyle(isTeleportMode ? 0x884488 : THEME.colors.buttons.primary));
      }
    } else {
      this.teleportBg?.setVisible(false);
      this.teleportTxt?.setVisible(false);
    }
  }

  private updateReturnButton(run: RunData): void {
    if (!run || run.currentNodeId === 'node_hub') {
        if (this.returnBtnBg) {
            this.returnBtnBg.destroy();
            this.returnBtnBg = null;
        }
        if (this.returnBtnTxt) {
            this.returnBtnTxt.destroy();
            this.returnBtnTxt = null;
        }
        return;
    }

    const x = this.scene.scale.width - 20;
    const y = this.scene.scale.height - 180;

    if (!this.returnBtnBg) {
        this.returnBtnBg = this.scene.add.rectangle(x, y, 160, 40, THEME.colors.buttons.danger)
            .setOrigin(1, 1).setScrollFactor(0).setDepth(30).setInteractive({ useHandCursor: true });

        this.returnBtnTxt = this.scene.add.text(x - 80, y - 20, 'RETURN TO BASE', {
            fontFamily: THEME.fonts.main, fontSize: '14px', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(31);

        this.returnBtnBg.on('pointerdown', this.onReturnClick);
        this.returnBtnBg.on('pointerover', () => this.returnBtnBg!.setFillStyle(THEME.colors.buttons.dangerHover));
        this.returnBtnBg.on('pointerout', () => this.returnBtnBg!.setFillStyle(THEME.colors.buttons.danger));
    } else {
        this.returnBtnBg.setPosition(x, y);
        this.returnBtnTxt!.setPosition(x - 80, y - 20);
    }
  }

  public destroy(): void {
    this.goldText.destroy();
    this.teleportBg?.destroy();
    this.teleportTxt?.destroy();
    this.gearBtnBg?.destroy();
    this.gearBtnTxt?.destroy();
    this.remoteBtnBg?.destroy();
    this.remoteBtnTxt?.destroy();
    this.returnBtnBg?.destroy();
    this.returnBtnTxt?.destroy();
  }
}
