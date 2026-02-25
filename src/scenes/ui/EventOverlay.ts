import Phaser from 'phaser';
import { RunManager } from '../../roguelike/RunManager';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';
import { ItemDefinition } from '../../roguelike/registry/types';
import i18n from '../../i18n';
import { BaseOverlay } from './BaseOverlay';

export class EventOverlay extends BaseOverlay {
  private onAction: () => void;
  // private onClose: () => void; // Inherited

  constructor(scene: Phaser.Scene, scrollY: number, runManager: RunManager, onAction: () => void, onClose: () => void) {
    const w = scene.scale.width;

    // Panel dimensions logic (moved from original)
    const btnWidth = Math.min(520, w - 80);
    const descWidth = btnWidth;
    const descFontSize = 16;
    const titleFontSize = 24;
    const padV = 36;
    const padH = 40;
    const btnHeight = 58;
    const btnGap = 14;
    const numOptions = 2;
    const totalBtnsHeight = numOptions * (btnHeight + btnGap) - btnGap;

    const run = runManager.getRun();
    const currentFloor = run ? run.visitedNodeIds.length : 1;
    const totalFloors = run ? run.runLength : 10;

    const equipmentItems = runManager.registry.getAllItems().filter(i => i.slot !== undefined);
    const item = EventOverlay.pickEventItem(equipmentItems, currentFloor, totalFloors);

    const titleText = i18n.t('event.title');
    const itemLabel = i18n.t(item.label);
    const description = i18n.t('event.description', { item: itemLabel });

    const charsPerLine = Math.floor(descWidth / (descFontSize * 0.6));
    const descLines = Math.ceil(description.length / charsPerLine) + 1;
    const descHeight = descLines * (descFontSize * 1.55);

    const ph = padV + titleFontSize + 20 + descHeight + 28 + totalBtnsHeight + padV;
    const pw = btnWidth + padH * 2;

    super({
        scene,
        width: pw,
        height: ph,
        scrollY,
        runManager,
        onClose: undefined, // We implement custom buttons
        hasPanelBackground: true
    });

    this.onAction = onAction;
    this.onClose = onClose;

    // Custom panel colors
    this.drawPanelBackground(0x0d0d12, 0x2a1a4a);

    // Title banner strip (relative to panel)
    const bannerH = titleFontSize + 24;
    const banner = scene.add.graphics();
    banner.fillStyle(0x1a0a2a, 1);
    banner.fillRoundedRect(0, 0, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.panelContainer.add(banner);

    // Title text
    const titleObj = scene.add.text(pw / 2, bannerH / 2, titleText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${titleFontSize}px`,
      color: '#e8c87a',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.panelContainer.add(titleObj);

    // Description text
    const descY = bannerH + 20;
    const descObj = scene.add.text(padH, descY, description, {
      fontFamily: THEME.fonts.main,
      fontSize: `${descFontSize}px`,
      color: '#d0c8b8',
      wordWrap: { width: descWidth },
      lineSpacing: 4,
    }).setOrigin(0, 0);
    this.panelContainer.add(descObj);

    // Buttons
    const btnsStartY = descY + descHeight + 18;
    const successChance = EventOverlay.getSuccessChance(item.rarity || 'common');
    const successPct = Math.round(successChance * 100);

    // Attempt Button
    const attemptBtn = new Button(scene, {
        x: pw / 2,
        y: btnsStartY + btnHeight / 2,
        width: btnWidth,
        height: btnHeight,
        text: i18n.t('event.attempt', { chance: successPct }),
        variant: 'primary',
        onClick: () => {
            this.handleAttempt(item, successChance);
        }
    });
    this.panelContainer.add(attemptBtn);

    // Leave Button
    const leaveBtn = new Button(scene, {
        x: pw / 2,
        y: btnsStartY + btnHeight + btnGap + btnHeight / 2,
        width: btnWidth,
        height: btnHeight,
        text: i18n.t('event.leave'),
        variant: 'secondary',
        onClick: () => {
            this.destroy();
            onAction();
            onClose();
        }
    });
    this.panelContainer.add(leaveBtn);
  }

  // Changed to static so it can be called before super()
  private static pickEventItem(items: ItemDefinition[], currentFloor: number, totalFloors: number): ItemDefinition {
      const progress = Math.min(1, currentFloor / Math.max(1, totalFloors));
      const weightedItems = items.map(item => {
          let weight = 0;
          const r = item.rarity || 'common';
          if (r === 'common') {
              weight = 100 * (1 - progress * 0.5);
          } else if (r === 'uncommon') {
              weight = 20 + progress * 80;
          } else if (r === 'rare') {
              weight = Math.max(0, (progress - 0.2) * 100);
          }
          return { item, weight };
      });

      const totalWeight = weightedItems.reduce((sum, i) => sum + i.weight, 0);
      let rand = Math.random() * totalWeight;

      for (const entry of weightedItems) {
          if (rand < entry.weight) return entry.item;
          rand -= entry.weight;
      }
      return items[0] || items[Math.floor(Math.random() * items.length)];
  }

  private static getSuccessChance(rarity: string): number {
      switch (rarity) {
          case 'rare': return 0.5;
          case 'uncommon': return 0.7;
          case 'common':
          default: return 0.9;
      }
  }

  private handleAttempt(item: ItemDefinition, chance: number): void {
      const roll = Math.random();
      if (roll < chance) {
          // Success
          this.runManager.addToInventory(item.id);
          const itemLabel = i18n.t(item.label);
          this.showOutcome(i18n.t('event.success_title'), i18n.t('event.success_msg', { item: itemLabel }), true);
      } else {
          // Failure
          const run = this.runManager.getRun();
          const gold = run?.gold || 0;
          let outcomeText = '';

          if (gold >= 50) {
              const lost = 50;
              this.runManager.spendGold(lost);
              outcomeText = i18n.t('event.failure_msg_gold', { amount: lost });
          } else {
              this.runManager.applyModifier({ powerMult: 0.95 }, 'INJURY');
              outcomeText = i18n.t('event.failure_msg_injury');
          }
           this.showOutcome(i18n.t('event.failure_title'), outcomeText, false);
      }
  }

  private showOutcome(title: string, message: string, success: boolean): void {
      // Clear panel content
      this.panelContainer.removeAll(true);

      const w = 500;
      const h = 300;

      // Resize panel and set outcome colors
      this.resizePanel(w, h, 0x0d0d12, success ? THEME.colors.status.ok : THEME.colors.status.err);

      // Add outcome content to panelContainer
      const cx = w / 2;
      const cy = h / 2; // relative to panel center (wait, panelContainer is top-left)

      // panelContainer coordinates are 0,0 to w,h

      const titleText = this.scene.add.text(cx, cy - 80, title, { // approx y
          fontFamily: THEME.fonts.main, fontSize: '32px', color: success ? THEME.colors.text.success : THEME.colors.text.danger, fontStyle: 'bold'
      }).setOrigin(0.5);
      this.panelContainer.add(titleText);

      const msgText = this.scene.add.text(cx, cy, message, {
          fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.large, color: THEME.colors.text.main, wordWrap: { width: 440 }, align: 'center'
      }).setOrigin(0.5);
      this.panelContainer.add(msgText);

      const okBtn = new Button(this.scene, {
          x: cx, y: cy + 90,
          width: 140, height: 46,
          text: i18n.t('event.continue'),
          variant: 'primary',
          onClick: () => {
              this.destroy();
              this.onAction();
              this.onClose?.();
          }
      });
      this.panelContainer.add(okBtn);
  }
}
