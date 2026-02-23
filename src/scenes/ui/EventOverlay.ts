import Phaser from 'phaser';
import { RunStateManager } from '../../roguelike/RunState';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';
import { ITEM_REGISTRY, type ItemDef } from '../../roguelike/ItemRegistry';
import i18n from '../../i18n';

export class EventOverlay extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, scrollY: number, onAction: () => void, onClose: () => void) {
    super(scene, 0, scrollY);
    this.setDepth(2000);

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    // Panel dimensions
    const btnWidth = Math.min(520, w - 80);
    const btnHeight = 58;
    const btnGap = 14;
    const descWidth = btnWidth;
    const descFontSize = 16;
    const titleFontSize = 24;
    const padV = 36;
    const padH = 40;

    // 1. Generate Event
    const run = RunStateManager.getRun();
    const currentFloor = run ? run.visitedNodeIds.length : 1; // Approx floor
    const totalFloors = run ? run.runLength : 10;

    // Pick Item Logic
    const equipmentItems = Object.values(ITEM_REGISTRY).filter(i => i.slot !== undefined);
    const item = this.pickEventItem(equipmentItems, currentFloor, totalFloors);

    // Calculate Success Chance
    const successChance = this.getSuccessChance(item.rarity || 'common');
    const successPct = Math.round(successChance * 100);

    // Event Text
    const titleText = i18n.t('event.title');
    const itemLabel = i18n.t(item.label);
    const description = i18n.t('event.description', { item: itemLabel });

    // Measure description text height
    const charsPerLine = Math.floor(descWidth / (descFontSize * 0.6));
    const descLines = Math.ceil(description.length / charsPerLine) + 1;
    const descHeight = descLines * (descFontSize * 1.55);

    const numOptions = 2;
    const totalBtnsHeight = numOptions * (btnHeight + btnGap) - btnGap;
    const ph = padV + titleFontSize + 20 + descHeight + 28 + totalBtnsHeight + padV;
    const pw = btnWidth + padH * 2;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    // Panel background
    const panel = scene.add.graphics();
    panel.fillStyle(0x0d0d12, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0x2a1a4a, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);
    this.add(panel);

    // Title banner strip
    const bannerH = titleFontSize + 24;
    const banner = scene.add.graphics();
    banner.fillStyle(0x1a0a2a, 1);
    banner.fillRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.add(banner);

    // Title text
    this.add(scene.add.text(w / 2, py + bannerH / 2, titleText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${titleFontSize}px`,
      color: '#e8c87a',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    // Description text
    const descY = py + bannerH + 20;
    this.add(scene.add.text(px + padH, descY, description, {
      fontFamily: THEME.fonts.main,
      fontSize: `${descFontSize}px`,
      color: '#d0c8b8',
      wordWrap: { width: descWidth },
      lineSpacing: 4,
    }).setOrigin(0, 0));

    // Buttons
    const btnsStartY = descY + descHeight + 18;

    // Attempt Button
    const attemptBtn = new Button(scene, {
        x: w / 2,
        y: btnsStartY + btnHeight / 2,
        width: btnWidth,
        height: btnHeight,
        text: i18n.t('event.attempt', { chance: successPct }),
        color: 0x093d46,
        hoverColor: 0x0e5560,
        onClick: () => {
            this.handleAttempt(item, successChance, onAction, onClose);
        }
    });
    this.add(attemptBtn);

    // Leave Button
    const leaveBtn = new Button(scene, {
        x: w / 2,
        y: btnsStartY + btnHeight + btnGap + btnHeight / 2,
        width: btnWidth,
        height: btnHeight,
        text: i18n.t('event.leave'),
        color: 0x444455,
        hoverColor: 0x555566,
        onClick: () => {
            this.destroy();
            onAction();
            onClose();
        }
    });
    this.add(leaveBtn);

    scene.add.existing(this);
  }

  private pickEventItem(items: ItemDef[], currentFloor: number, totalFloors: number): ItemDef {
      // Weighting: Later events drop rarer items.
      // progress 0..1
      const progress = Math.min(1, currentFloor / Math.max(1, totalFloors));

      // Weights based on rarity and progress
      // Common: starts high, decreases
      // Uncommon: starts low, peaks mid-late
      // Rare: starts 0, increases late

      const weightedItems = items.map(item => {
          let weight = 0;
          const r = item.rarity || 'common';
          if (r === 'common') {
              weight = 100 * (1 - progress * 0.5); // 100 -> 50
          } else if (r === 'uncommon') {
              weight = 20 + progress * 80; // 20 -> 100
          } else if (r === 'rare') {
              weight = Math.max(0, (progress - 0.2) * 100); // 0 -> 80
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

  private getSuccessChance(rarity: string): number {
      switch (rarity) {
          case 'rare': return 0.5;
          case 'uncommon': return 0.7;
          case 'common':
          default: return 0.9;
      }
  }

  private handleAttempt(item: ItemDef, chance: number, onAction: () => void, onClose: () => void): void {
      const roll = Math.random();
      if (roll < chance) {
          // Success
          RunStateManager.addToInventory(item.id);
          const itemLabel = i18n.t(item.label);
          this.showOutcome(i18n.t('event.success_title'), i18n.t('event.success_msg', { item: itemLabel }), true, onAction, onClose);
      } else {
          // Failure
          const run = RunStateManager.getRun();
          const gold = run?.gold || 0;
          let outcomeText = '';

          if (gold >= 50) {
              const lost = 50;
              RunStateManager.spendGold(lost);
              outcomeText = i18n.t('event.failure_msg_gold', { amount: lost });
          } else {
              RunStateManager.applyModifier({ powerMult: 0.95 }, 'INJURY');
              outcomeText = i18n.t('event.failure_msg_injury');
          }
           this.showOutcome(i18n.t('event.failure_title'), outcomeText, false, onAction, onClose);
      }
  }

  private showOutcome(title: string, message: string, success: boolean, onAction: () => void, onClose: () => void): void {
      this.removeAll(true);

      const w = this.scene.scale.width;
      const h = this.scene.scale.height;

      // Dim background again (container cleared)
      const bg = this.scene.add.graphics();
      bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
      bg.fillRect(0, 0, w, h);
      this.add(bg);

      const cx = w / 2;
      const cy = h / 2;

      const panel = this.scene.add.graphics();
      panel.fillStyle(0x0d0d12, 1);
      panel.fillRoundedRect(cx - 250, cy - 150, 500, 300, 14);
      panel.lineStyle(2, success ? 0x00ff88 : 0xff4444, 1);
      panel.strokeRoundedRect(cx - 250, cy - 150, 500, 300, 14);
      this.add(panel);

      const titleText = this.scene.add.text(cx, cy - 80, title, {
          fontFamily: THEME.fonts.main, fontSize: '32px', color: success ? '#00ff88' : '#ff4444', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.add(titleText);

      const msgText = this.scene.add.text(cx, cy, message, {
          fontFamily: THEME.fonts.main, fontSize: '18px', color: '#ffffff', wordWrap: { width: 440 }, align: 'center'
      }).setOrigin(0.5);
      this.add(msgText);

      const okBtn = new Button(this.scene, {
          x: cx, y: cy + 90,
          width: 140, height: 46,
          text: i18n.t('event.continue'),
          color: THEME.colors.buttons.primary,
          hoverColor: THEME.colors.buttons.primaryHover,
          onClick: () => {
              this.destroy();
              onAction();
              onClose();
          }
      });
      this.add(okBtn);
  }
}
