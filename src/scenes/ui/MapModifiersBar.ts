import Phaser from 'phaser';
import { type RunData, type ModifierLogEntry } from '../../roguelike/RunState';
import { THEME } from '../../theme';

interface ChipDef {
  text: string;
  bgColor: number;
  textColor: string;
  tooltipLines: string[];
}

export class MapModifiersBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private tooltips: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public render(run: RunData): void {
    this.clear();

    if (!run) return;
    const { modifiers, modifierLog } = run;

    const chips: ChipDef[] = [];

    if (modifiers.powerMult !== 1.0) {
      const pct = Math.round((modifiers.powerMult - 1) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.powerMult !== undefined);
      chips.push({
        text: `+${pct}% POWER`,
        bgColor: 0x0f2a10,
        textColor: '#88ffaa',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: +${Math.round((e.powerMult! - 1) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.dragReduction !== 0.0) {
      const pct = Math.round(modifiers.dragReduction * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.dragReduction !== undefined);
      chips.push({
        text: `${pct}% AERO`,
        bgColor: 0x061828,
        textColor: '#88ddff',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: +${Math.round(e.dragReduction! * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.weightMult !== 1.0) {
      const pct = Math.round((1 - modifiers.weightMult) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.weightMult !== undefined);
      chips.push({
        text: `-${pct}% WEIGHT`,
        bgColor: 0x221400,
        textColor: '#ffcc66',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: -${Math.round((1 - e.weightMult!) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (modifiers.crrMult !== undefined && modifiers.crrMult !== 1.0) {
      const pct = Math.round((1 - modifiers.crrMult) * 100);
      const entries = modifierLog.filter((e: ModifierLogEntry) => e.crrMult !== undefined);
      chips.push({
        text: `-${pct}% ROLL`,
        bgColor: 0x14220a,
        textColor: '#bbff88',
        tooltipLines: entries.length > 0
          ? entries.map((e: ModifierLogEntry) => `${e.label}: -${Math.round((1 - e.crrMult!) * 100)}%`)
          : ['(source unknown)'],
      });
    }

    if (chips.length === 0) return;

    const chipW = 96;
    const chipH = 20;
    const gap = 6;
    const totalW = chips.length * chipW + (chips.length - 1) * gap;
    const startX = this.scene.scale.width / 2 - totalW / 2;
    const barY = 56;

    // Create container for chips? Or just add directly.
    // The original code added directly to scene, but here we want to manage them.
    // I'll use a container if possible, but tooltips need high depth.
    // If I use a container for chips, tooltips should be separate or high depth.

    // I will use a container for chips to easily destroy them.
    this.container = this.scene.add.container(0, 0);

    // Screen-fixed tooltip elements (created once, shared across all chips)
    const tipBg = this.scene.add.graphics().setScrollFactor(0).setDepth(210).setAlpha(0);
    const tipText = this.scene.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main,
      fontSize: '11px',
      color: '#ffffff',
      align: 'left',
    }).setScrollFactor(0).setDepth(211).setAlpha(0);

    this.tooltips.push(tipBg, tipText);

    const showTip = (chipCx: number, lines: string[]) => {
      tipText.setText(lines.join('\n'));
      const tw = Math.max(tipText.width + 16, 80);
      const th = tipText.height + 10;
      const tx = Math.min(Math.max(chipCx - tw / 2, 4), this.scene.scale.width - tw - 4);
      const ty = barY + chipH / 2 + 4;
      tipText.setPosition(tx + 8, ty + 5);
      tipBg.clear()
        .fillStyle(0x000000, 0.92)
        .lineStyle(1, 0x888888, 0.8)
        .fillRoundedRect(tx, ty, tw, th, 4)
        .strokeRoundedRect(tx, ty, tw, th, 4);
      tipBg.setAlpha(1);
      tipText.setAlpha(1);
    };
    const hideTip = () => { tipBg.setAlpha(0); tipText.setAlpha(0); };

    chips.forEach((chip, i) => {
      const cx = startX + i * (chipW + gap) + chipW / 2;

      const rect = this.scene.add.rectangle(cx, barY, chipW, chipH, chip.bgColor)
        .setScrollFactor(0).setDepth(22)
        .setInteractive({ useHandCursor: false })
        .on('pointerover', () => showTip(cx, chip.tooltipLines))
        .on('pointerout', hideTip);

      const text = this.scene.add.text(cx, barY, chip.text, {
        fontFamily: THEME.fonts.main,
        fontSize: '10px',
        color: chip.textColor,
        fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(23);

      this.container!.add([rect, text]);
    });
  }

  public clear(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    this.tooltips.forEach(t => t.destroy());
    this.tooltips = [];
  }

  public destroy(): void {
    this.clear();
  }
}
