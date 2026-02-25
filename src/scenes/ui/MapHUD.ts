import Phaser from 'phaser';
import { type RunData } from '../../roguelike/RunManager';
import { THEME } from '../../theme';
import { RemoteService } from '../../services/RemoteService';
import { Button } from '../../ui/Button';
import { Typography } from '../../ui/components/Typography';
import i18next from '../../i18n';

export class MapHUD {
  private scene: Phaser.Scene;

  private goldText!: Typography;

  private teleportBtn: Button | null = null;
  private gearBtn: Button | null = null;
  private remoteBtn: Button | null = null;
  private returnBtn: Button | null = null;

  private onGearClick: () => void;
  private onRemoteClick: () => void;
  private onReturnClick: () => void;
  private onTeleportClick: () => void;
  private remoteService: RemoteService;

  constructor(
    scene: Phaser.Scene,
    remoteService: RemoteService,
    callbacks: {
      onGearClick: () => void;
      onRemoteClick: () => void;
      onReturnClick: () => void;
      onTeleportClick: () => void;
    }
  ) {
    this.scene = scene;
    this.remoteService = remoteService;
    this.onGearClick = callbacks.onGearClick;
    this.onRemoteClick = callbacks.onRemoteClick;
    this.onReturnClick = callbacks.onReturnClick;
    this.onTeleportClick = callbacks.onTeleportClick;

    this.createStaticElements();
  }

  private createStaticElements(): void {
    // Title
    new Typography(this.scene, {
      x: this.scene.scale.width / 2,
      y: 30,
      text: i18next.t('ui.hud.title'),
      variant: 'hero',
      align: 'center',
      color: THEME.colors.text.dark,
      scrollFactor: 0
    }).setOrigin(0.5).setDepth(THEME.depths.ui);

    // Gold Text
    this.goldText = new Typography(this.scene, {
      x: this.scene.scale.width - 20,
      y: 20,
      text: i18next.t('ui.hud.gold', { amount: 0 }),
      variant: 'h2',
      color: THEME.colors.text.gold,
      align: 'right',
      fontSize: '20px', // Explicit size to match old style
      scrollFactor: 0
    });
    this.goldText.setOrigin(1, 0).setDepth(THEME.depths.ui);

    // Buttons
    this.createGearButton();
    this.createRemoteButton();
  }

  public update(run: RunData, isTeleportMode: boolean): void {
    // Update Gold
    this.goldText.setText(i18next.t('ui.hud.gold', { amount: run.gold }));
    this.goldText.setX(this.scene.scale.width - 20);

    // Update Teleport Button
    this.updateTeleportButton(run, isTeleportMode);

    // Update Return Button
    this.updateReturnButton(run);

    // Update Remote Button
    this.updateRemoteButton();
  }

  private createGearButton(): void {
    this.gearBtn = new Button(this.scene, {
      x: 70, // Centered
      y: 20,
      width: 130,
      height: 26,
      text: i18next.t('ui.hud.equipment'),
      variant: 'primary',
      textColor: '#ccccff',
      fontSize: '11px',
      onClick: this.onGearClick,
      scrollFactor: 0
    });
    this.gearBtn.setDepth(THEME.depths.ui + 10);
  }

  private createRemoteButton(): void {
    const y = 52;
    this.remoteBtn = new Button(this.scene, {
      x: 70,
      y: y,
      width: 130,
      height: 26,
      text: i18next.t('ui.hud.remote'),
      variant: 'primary',
      textColor: '#ccccff',
      fontSize: '11px',
      onClick: this.onRemoteClick,
      scrollFactor: 0
    });
    this.remoteBtn.setDepth(THEME.depths.ui + 10);
  }

  public setRemoteButtonText(text: string, color?: string): void {
    if (this.remoteBtn) {
        this.remoteBtn.setText(text);
        if (color) this.remoteBtn.setTextColor(color);
    }
  }

  private updateRemoteButton(): void {
    if (!this.remoteBtn) return;

    const code = this.remoteService.getRoomCode();
    const isConnected = !!code;
    const label = isConnected ? `REMOTE: ${code}` : i18next.t('ui.hud.remote');
    const color = isConnected ? '#00ff88' : '#ccccff';

    const currentText = this.remoteBtn.getText();
    if (!isConnected && (currentText === 'CONNECTING...' || currentText === 'ERR')) {
         return;
    }

    this.remoteBtn.setText(label);
    this.remoteBtn.setTextColor(color);
  }

  private updateTeleportButton(run: RunData, isTeleportMode: boolean): void {
    const teleCount = run.inventory.filter(i => i === 'teleport').length;
    const teleX = this.scene.scale.width - 90;

    if (teleCount > 0) {
      if (!this.teleportBtn) {
        this.teleportBtn = new Button(this.scene, {
            x: teleX,
            y: 60,
            width: 160,
            height: 30,
            text: i18next.t('ui.hud.teleport', { count: teleCount }),
            variant: 'primary',
            textColor: '#ff88ff',
            fontSize: '12px',
            onClick: this.onTeleportClick,
            scrollFactor: 0
        });
        this.teleportBtn.setDepth(THEME.depths.ui);
      } else {
        this.teleportBtn.setVisible(true);
        this.teleportBtn.setPosition(teleX, 60);

        const label = isTeleportMode
            ? i18next.t('ui.hud.cancel_teleport')
            : i18next.t('ui.hud.teleport', { count: teleCount });

        this.teleportBtn.setText(label);
      }
    } else {
      if (this.teleportBtn) this.teleportBtn.setVisible(false);
    }
  }

  private updateReturnButton(run: RunData): void {
    if (!run || run.currentNodeId === 'node_hub') {
        if (this.returnBtn) {
            this.returnBtn.destroy();
            this.returnBtn = null;
        }
        return;
    }

    const x = this.scene.scale.width - 20;
    const y = this.scene.scale.height - 180;

    // Center coords
    const cx = x - 80; // 160/2
    const cy = y - 20; // 40/2

    if (!this.returnBtn) {
        this.returnBtn = new Button(this.scene, {
            x: cx,
            y: cy,
            width: 160,
            height: 40,
            text: i18next.t('ui.hud.return_to_base'),
            variant: 'danger',
            onClick: this.onReturnClick,
            scrollFactor: 0
        });
        this.returnBtn.setDepth(THEME.depths.ui + 10);
    } else {
        this.returnBtn.setPosition(cx, cy);
    }
  }

  public destroy(): void {
    if (this.goldText) this.goldText.destroy();
    if (this.teleportBtn) this.teleportBtn.destroy();
    if (this.gearBtn) this.gearBtn.destroy();
    if (this.remoteBtn) this.remoteBtn.destroy();
    if (this.returnBtn) this.returnBtn.destroy();
  }
}
