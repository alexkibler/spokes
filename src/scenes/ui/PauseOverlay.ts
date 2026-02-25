import Phaser from 'phaser';
import { THEME } from '../../theme';
import { EquipmentPanel } from './EquipmentPanel';
import { ConfirmationModal } from '../../ui/ConfirmationModal';
import { RunManager } from '../../roguelike/RunManager';
import i18n from '../../i18n';

export class PauseOverlay extends Phaser.GameObjects.Container {
  private panel: EquipmentPanel;
  private menuContainer: Phaser.GameObjects.Container;
  private onResume: () => void;
  private onQuit: () => void; // Save & Quit
  private onBackToMap: () => void; // Back to Map
  private runManager: RunManager;

  private menuButtons: Phaser.GameObjects.Rectangle[] = [];
  private selectedButtonIndex: number = -1;

  // FTP Input
  private ftpW: number;
  private ftpText!: Phaser.GameObjects.Text;
  private ftpInputField!: Phaser.GameObjects.Rectangle;
  private ftpInputActive = false;
  private ftpInputStr = '';
  private ftpCursorOn = true;
  private ftpCursorEvent?: Phaser.Time.TimerEvent;

  constructor(
    scene: Phaser.Scene,
    callbacks: { onResume: () => void; onQuit: () => void; onBackToMap: () => void },
    currentFtpW: number,
    isRoguelike: boolean,
    runManager: RunManager
  ) {
    super(scene);
    this.setDepth(2000);
    this.runManager = runManager;
    this.onResume = callbacks.onResume;
    this.onQuit = callbacks.onQuit;
    this.onBackToMap = callbacks.onBackToMap;
    this.ftpW = currentFtpW;
    this.ftpInputStr = String(this.ftpW);

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim Background
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    // Block clicks going through
    this.add(bg);

    // Layout
    const GAP = 20;
    const MENU_W = 220;
    const PANEL_W = 520;
    const TOTAL_W = PANEL_W + GAP + MENU_W;

    const startX = (w - TOTAL_W) / 2;

    // Equipment Panel
    this.panel = new EquipmentPanel(scene, 0, 0, this.runManager);
    const panelY = (h - this.panel.panelHeight) / 2;
    this.panel.setPosition(startX, panelY);
    this.panel.onHeightChanged = () => {
        const newY = (h - this.panel.panelHeight) / 2;
        this.panel.setPosition(startX, newY);
    };
    this.add(this.panel);

    // Menu Container
    this.menuContainer = scene.add.container(startX + PANEL_W + GAP, 0);
    this.buildMenu(isRoguelike);

    const MENU_H = 300;
    this.menuContainer.setPosition(startX + PANEL_W + GAP, (h - MENU_H) / 2);
    this.add(this.menuContainer);

    this.setupInput();

    scene.add.existing(this);
  }

  private buildMenu(isRoguelike: boolean): void {
    const w = 220;
    const h = 300;

    const bg = this.scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.panelBg, 1);
    bg.fillRoundedRect(0, 0, w, h, 12);
    bg.lineStyle(2, THEME.colors.ui.panelBorder, 1);
    bg.strokeRoundedRect(0, 0, w, h, 12);
    this.menuContainer.add(bg);

    const cx = w / 2;
    let cy = 40;

    // Title
    const title = this.scene.add.text(cx, cy, i18n.t('pause.title'), {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.title, color: THEME.colors.text.main, fontStyle: 'bold'
    }).setOrigin(0.5);
    this.menuContainer.add(title);

    cy += 50;

    // Resume Button
    this.createButton(cx, cy, i18n.t('pause.resume'), THEME.colors.buttons.primary, () => {
      this.destroy();
      this.onResume();
    });

    cy += 50;

    // FTP Input Section
    const ftpLabel = this.scene.add.text(cx, cy - 15, i18n.t('pause.ftp_setting'), {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.caption, color: THEME.colors.text.muted
    }).setOrigin(0.5);
    this.menuContainer.add(ftpLabel);

    this.ftpInputField = this.scene.add.rectangle(cx, cy + 10, 140, 36, THEME.colors.menu.inputBg)
        .setStrokeStyle(2, THEME.colors.menu.inputBorder)
        .setInteractive({ useHandCursor: true });

    this.ftpText = this.scene.add.text(cx, cy + 10, `${this.ftpW} ${i18n.t('menu.ftp_unit')}`, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.large, color: THEME.colors.text.main, fontStyle: 'bold'
    }).setOrigin(0.5);

    this.menuContainer.add([this.ftpInputField, this.ftpText]);

    this.ftpInputField.on('pointerdown', () => this.startFtpEdit());

    cy += 60;

    // Back to Map / Main Menu Button
    const backLabel = isRoguelike ? i18n.t('pause.back_to_map') : i18n.t('pause.main_menu');
    const backMessage = isRoguelike
      ? i18n.t('pause.abandon_msg_rogue')
      : i18n.t('pause.abandon_msg_menu');
    this.createButton(cx, cy, backLabel, THEME.colors.buttons.secondary, () => {
        new ConfirmationModal(this.scene, {
            title: i18n.t('pause.abandon_title'),
            message: backMessage,
            confirmLabel: i18n.t('pause.yes_abandon'),
            confirmColor: THEME.colors.buttons.danger,
            onConfirm: () => {
                this.destroy();
                this.onBackToMap();
            }
        });
    });

    cy += 50;

    // Save & Quit Button
    this.createButton(cx, cy, i18n.t('pause.save_quit'), THEME.colors.buttons.secondary, () => {
         new ConfirmationModal(this.scene, {
            title: i18n.t('pause.save_quit_title'),
            message: i18n.t('pause.save_quit_msg'),
            confirmLabel: i18n.t('pause.confirm_save'),
            onConfirm: () => {
                this.destroy();
                this.onQuit();
            }
        });
    });
  }

  private createButton(x: number, y: number, label: string, color: number, onClick: () => void): void {
      const w = 180;
      const h = 36;
      const btn = this.scene.add.rectangle(x, y, w, h, color)
        .setInteractive({ useHandCursor: true });
      const txt = this.scene.add.text(x, y, label, {
          fontFamily: THEME.fonts.main, fontSize: '12px', color: THEME.colors.text.main, fontStyle: 'bold'
      }).setOrigin(0.5);

      btn.on('pointerover', () => btn.setAlpha(0.8));
      btn.on('pointerout', () => {
        // Only reset if not selected via D-pad
        if (this.menuButtons.indexOf(btn) !== this.selectedButtonIndex) {
          btn.setAlpha(1);
        }
      });
      btn.on('pointerdown', onClick);

      this.menuContainer.add([btn, txt]);
      this.menuButtons.push(btn);
  }

  public handleCursorMove(direction: 'up' | 'down' | 'left' | 'right') {
    if (this.menuButtons.length === 0) return;

    if (direction === 'up') {
      if (this.selectedButtonIndex < 0) this.selectedButtonIndex = this.menuButtons.length - 1;
      else this.selectedButtonIndex = (this.selectedButtonIndex - 1 + this.menuButtons.length) % this.menuButtons.length;
    } else if (direction === 'down') {
      if (this.selectedButtonIndex < 0) this.selectedButtonIndex = 0;
      else this.selectedButtonIndex = (this.selectedButtonIndex + 1) % this.menuButtons.length;
    }

    this.updateFocus();
  }

  public handleCursorSelect() {
    if (this.selectedButtonIndex >= 0 && this.selectedButtonIndex < this.menuButtons.length) {
      const btn = this.menuButtons[this.selectedButtonIndex];
      btn.emit('pointerdown');
    }
  }

  private updateFocus() {
    this.menuButtons.forEach((btn, index) => {
      if (index === this.selectedButtonIndex) {
        btn.setAlpha(0.8);
        btn.setStrokeStyle(2, 0xffffff, 1);
      } else {
        btn.setAlpha(1);
        btn.setStrokeStyle(0);
      }
    });
  }

  // FTP Logic
  private setupInput(): void {
      // Just setup global click handler to commit edit if clicked outside?
      // Actually we use pointerdown on the field to start.
      // We can use a global pointerdown to stop.
      this.scene.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
          if (this.ftpInputActive && !gameObjects.includes(this.ftpInputField)) {
              this.stopFtpEdit();
          }
      });
  }

  private startFtpEdit(): void {
      if (this.ftpInputActive) return;
      this.ftpInputActive = true;
      this.ftpInputStr = String(this.ftpW);
      this.ftpInputField.setStrokeStyle(2, THEME.colors.menu.inputBorderFocus);

      this.ftpCursorOn = true;
      this.ftpCursorEvent = this.scene.time.addEvent({
          delay: 500,
          loop: true,
          callback: () => {
              this.ftpCursorOn = !this.ftpCursorOn;
              this.updateFtpDisplay();
          }
      });
      this.updateFtpDisplay();

      this.scene.input.keyboard!.on('keydown', this.handleKey, this);
  }

  private stopFtpEdit(): void {
      if (!this.ftpInputActive) return;
      this.ftpInputActive = false;
      this.ftpInputField.setStrokeStyle(2, THEME.colors.menu.inputBorder);
      if (this.ftpCursorEvent) this.ftpCursorEvent.remove();
      this.scene.input.keyboard!.off('keydown', this.handleKey, this);

      const val = parseInt(this.ftpInputStr, 10);
      if (!isNaN(val) && val > 0) {
          this.ftpW = Math.max(1, val);
          this.runManager.setFtp(this.ftpW);
          if ('setFtp' in this.scene) {
             (this.scene as any).setFtp(this.ftpW);
          }
      }
      this.ftpText.setText(`${this.ftpW} ${i18n.t('menu.ftp_unit')}`);
  }

  private updateFtpDisplay(): void {
      const cursor = this.ftpCursorOn ? '|' : ' ';
      this.ftpText.setText(this.ftpInputStr + cursor + ' ' + i18n.t('menu.ftp_unit'));
  }

  private handleKey(event: KeyboardEvent): void {
      if (!this.ftpInputActive) return;
      event.stopPropagation();

      if (event.key === 'Enter') {
          this.stopFtpEdit();
      } else if (event.key === 'Escape') {
          this.stopFtpEdit();
          this.ftpText.setText(`${this.ftpW} ${i18n.t('menu.ftp_unit')}`);
      } else if (event.key === 'Backspace') {
          this.ftpInputStr = this.ftpInputStr.slice(0, -1);
          this.updateFtpDisplay();
      } else if (event.key >= '0' && event.key <= '9') {
          if (this.ftpInputStr.length < 7) {
              this.ftpInputStr += event.key;
              this.updateFtpDisplay();
          }
      }
  }

  destroy(fromScene?: boolean): void {
      if (this.ftpCursorEvent) this.ftpCursorEvent.remove();
      this.scene.input.keyboard!.off('keydown', this.handleKey, this);
      super.destroy(fromScene);
  }
}
