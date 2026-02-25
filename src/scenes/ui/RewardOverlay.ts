import Phaser from 'phaser';
import { THEME } from '../../theme';
import type { RewardDefinition, RewardRarity, EquipmentSlot } from '../../roguelike/registry/types';
import { RunManager } from '../../roguelike/RunManager';
import { formatModifierLines } from '../../roguelike/ModifierUtils';
import { Button } from '../../ui/Button';
import { msToKmh, msToMph } from '../../physics/CyclistPhysics';
import i18n from '../../i18n';
import type { RideStats } from './RideOverlay';
import type { Units } from '../MenuScene';
import { BaseOverlay } from './BaseOverlay';

const RARITY_STYLE: Record<RewardRarity, { border: number; badgeBg: number; badgeText: string }> = {
  common:   { border: 0x445566, badgeBg: 0x2a3a44, badgeText: '#8899aa' },
  uncommon: { border: 0x2255aa, badgeBg: 0x0f2a66, badgeText: '#66aaff' },
  rare:     { border: 0xcc9900, badgeBg: 0x7a5a00, badgeText: '#ffdd44' },
};

export interface RewardOverlayHeader {
  stats: RideStats;
  units: Units;
}

export class RewardOverlay extends BaseOverlay {
  constructor(
    scene: Phaser.Scene,
    rewards: RewardDefinition[],
    onPick: (reward: RewardDefinition) => void,
    onReroll: (() => void) | null,
    runManager: RunManager,
    header?: RewardOverlayHeader,
  ) {
    const w = scene.scale.width;

    // Layout constants
    const CARD_GAP = 14;
    const STATS_H  = header ? 80 : 0;
    const BANNER_H = 46;
    const SUBTITLE_H = 26;
    const CARD_H = 210;
    const BOTTOM_PAD = 20;
    const REROLL_SECTION_H = onReroll !== null ? 56 : 0;

    const cardW = Math.min(170, Math.floor((w - 120) / 3));
    const totalCardsW = cardW * 3 + CARD_GAP * 2;
    const panW = totalCardsW + 80;
    const panH = STATS_H + BANNER_H + SUBTITLE_H + 8 + CARD_H + REROLL_SECTION_H + BOTTOM_PAD;

    super({
        scene,
        width: panW,
        height: panH,
        scrollY: 0,
        runManager,
        onClose: undefined,
        hasPanelBackground: true
    });

    this.setScrollFactor(0);
    this.drawPanelBackground(0x0d0d14, 0x3a3a5a);

    const cx = panW / 2; // relative to panelContainer

    // ── Stats header (when coming from a ride) ────────────────────────────────
    if (header) {
      const { stats, units } = header;

      const statsBg = scene.add.graphics();
      statsBg.fillStyle(0x0a0a1c, 1);
      statsBg.fillRoundedRect(0, 0, panW, STATS_H, { tl: 12, tr: 12, bl: 0, br: 0 });
      this.panelContainer.add(statsBg);

      // Title line
      const title = scene.add.text(cx, 12, i18n.t('reward.ride_complete'), {
        fontFamily: THEME.fonts.main, fontSize: '16px', fontStyle: 'bold',
        color: THEME.colors.text.accent, letterSpacing: 3,
      }).setOrigin(0.5, 0);
      this.panelContainer.add(title);

      // Metrics line
      const elapsedS = Math.floor(stats.elapsedMs / 1000);
      const mm = Math.floor(elapsedS / 60);
      const ss = elapsedS % 60;
      const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;
      const distStr = units === 'imperial'
        ? `${(stats.distanceM / 1609.344).toFixed(2)} mi`
        : `${(stats.distanceM / 1000).toFixed(2)} km`;
      const avgSpdStr = units === 'imperial'
        ? `${msToMph(stats.avgSpeedMs).toFixed(1)} mph`
        : `${msToKmh(stats.avgSpeedMs).toFixed(1)} km/h`;

      const metrics = scene.add.text(cx, 32, `${distStr}   ·   ${timeStr}   ·   ${stats.avgPowerW}W   ·   ${avgSpdStr}`, {
        fontFamily: THEME.fonts.main, fontSize: '11px', color: '#cccccc', letterSpacing: 1,
      }).setOrigin(0.5, 0);
      this.panelContainer.add(metrics);

      // Gold + challenge line
      const goldStr = stats.goldEarned !== undefined ? `+${stats.goldEarned} GOLD` : '';
      let challengeStr = '';
      let challengeColor = '#888888';
      if (stats.challengeResult) {
        if (stats.challengeResult.success) {
          challengeStr = i18n.t('reward.challenge_complete', { reward: stats.challengeResult.reward });
          challengeColor = '#f0c030';
        } else {
          challengeStr = i18n.t('reward.challenge_failed');
          challengeColor = '#aa6655';
        }
      }

      if (goldStr) {
        const goldTxt = scene.add.text(cx, 50, goldStr, {
          fontFamily: THEME.fonts.main, fontSize: '14px', fontStyle: 'bold',
          color: THEME.colors.text.gold,
        }).setOrigin(0.5, 0);
        this.panelContainer.add(goldTxt);
      }

      if (challengeStr) {
        const goldOffset = goldStr ? 18 : 0;
        const challTxt = scene.add.text(cx, 50 + goldOffset, challengeStr, {
          fontFamily: THEME.fonts.main, fontSize: '11px', color: challengeColor,
        }).setOrigin(0.5, 0);
        this.panelContainer.add(challTxt);
      }

      // Divider
      const div = scene.add.graphics();
      div.lineStyle(1, 0x2a2a44, 1);
      div.lineBetween(16, STATS_H - 1, panW - 16, STATS_H - 1);
      this.panelContainer.add(div);
    }

    // ── Banner ────────────────────────────────────────────────────────────────
    const bannerY = STATS_H;
    const banner = scene.add.graphics();
    banner.fillStyle(0x0a0a1c, 1);
    if (!header) {
      // Rounded top only when there's no stats header above it
      banner.fillRoundedRect(0, bannerY, panW, BANNER_H, { tl: 12, tr: 12, bl: 0, br: 0 });
    } else {
      banner.fillRect(0, bannerY, panW, BANNER_H);
    }
    this.panelContainer.add(banner);

    const bannerTitle = scene.add.text(cx, bannerY + BANNER_H / 2, i18n.t('reward.title'), {
      fontFamily: THEME.fonts.main,
      fontSize: '20px',
      color: THEME.colors.text.gold,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.panelContainer.add(bannerTitle);

    const bannerSubtitle = scene.add.text(cx, bannerY + BANNER_H + 6, i18n.t('reward.subtitle'), {
      fontFamily: THEME.fonts.main,
      fontSize: '11px',
      color: THEME.colors.text.muted,
      letterSpacing: 2,
    }).setOrigin(0.5, 0);
    this.panelContainer.add(bannerSubtitle);

    // ── Cards ─────────────────────────────────────────────────────────────────
    const cardsLeft = cx - totalCardsW / 2;
    const cardsTop = bannerY + BANNER_H + SUBTITLE_H + 8;

    rewards.forEach((reward, i) => {
      const cardCx = cardsLeft + i * (cardW + CARD_GAP) + cardW / 2;
      const cardCy = cardsTop + CARD_H / 2;
      const cardL = cardCx - cardW / 2;
      const cardT = cardCy - CARD_H / 2;
      const rs = RARITY_STYLE[reward.rarity];

      const cardFill = scene.add.rectangle(cardCx, cardCy, cardW, CARD_H, 0x1a1a2c);
      this.panelContainer.add(cardFill);

      const cardBorder = scene.add.graphics();
      cardBorder.lineStyle(2, rs.border, 1);
      cardBorder.strokeRoundedRect(cardL, cardT, cardW, CARD_H, 8);
      this.panelContainer.add(cardBorder);

      const BADGE_H = 22;
      const badge = scene.add.graphics();
      badge.fillStyle(rs.badgeBg, 1);
      badge.fillRoundedRect(cardL, cardT, cardW, BADGE_H, { tl: 8, tr: 8, bl: 0, br: 0 });
      this.panelContainer.add(badge);

      const badgeTxt = scene.add.text(cardCx, cardT + BADGE_H / 2, reward.rarity.toUpperCase(), {
        fontFamily: THEME.fonts.main,
        fontSize: '9px',
        color: rs.badgeText,
        fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0.5);
      this.panelContainer.add(badgeTxt);

      const labelTxt = scene.add.text(cardCx, cardT + BADGE_H + 16, i18n.t(reward.label), {
        fontFamily: THEME.fonts.main,
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardW - 16 },
      }).setOrigin(0.5, 0);
      this.panelContainer.add(labelTxt);

      const descTxt = scene.add.text(cardCx, cardT + BADGE_H + 46, i18n.t(reward.description), {
        fontFamily: THEME.fonts.main,
        fontSize: '11px',
        color: '#9999bb',
        align: 'center',
        wordWrap: { width: cardW - 16 },
        lineSpacing: 4,
      }).setOrigin(0.5, 0);
      this.panelContainer.add(descTxt);

      const hitRect = scene.add.rectangle(cardCx, cardCy, cardW, CARD_H, 0xffffff, 0);
      hitRect.setInteractive({ useHandCursor: true });
      this.panelContainer.add(hitRect);

      hitRect.on('pointerover', () => { cardFill.setFillStyle(0x26263a); });
      hitRect.on('pointerout',  () => { cardFill.setFillStyle(0x1a1a2c); });
      hitRect.on('pointerdown', () => {
        if (reward.equipmentSlot) {
          // Apply reward now (adds item to inventory), then let the player
          // decide whether to equip it before leaving.  We pass a shell reward
          // (no-op apply) to onPick so GameScene doesn't double-apply.
          reward.apply(this.runManager);
          const shell: typeof reward = { ...reward, apply: () => {} };
          this.showEquipPrompt(reward.id, reward.label, reward.equipmentSlot, () => onPick(shell));
        } else {
          onPick(reward);
        }
      });
    });

    // ── Reroll ────────────────────────────────────────────────────────────────
    if (onReroll !== null) {
      const run = this.runManager.getRun();
      const rerollCount = run?.inventory.filter(i => i === 'reroll_voucher').length ?? 0;
      const rerollBtn = new Button(scene, {
        x: cx,
        y: cardsTop + CARD_H + REROLL_SECTION_H / 2,
        width: 220,
        height: 36,
        text: i18n.t('reward.reroll', { count: rerollCount }),
        variant: 'secondary',
        textColor: THEME.colors.text.gold,
        onClick: onReroll,
      });
      this.panelContainer.add(rerollBtn);
    }
  }

  // ── Equipment equip-now prompt ──────────────────────────────────────────────

  /**
   * Shows an inline "Equip now?" panel over the reward cards.
   * onDone is called when the player finishes (equip or skip).
   */
  private showEquipPrompt(
    itemId: string,
    itemLabel: string,
    slot: EquipmentSlot,
    onDone: () => void,
  ): void {
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    // We add this prompt to `this` (the overlay container), so it's on top of panelContainer

    const run = this.runManager.getRun();
    const occupantId = run?.equipped[slot];

    const PROMPT_W = 340;
    const PROMPT_H = occupantId ? 190 : 130;
    const px = Math.floor((w - PROMPT_W) / 2); // relative to container (which is at 0,0)
    const py = Math.floor((h - PROMPT_H) / 2);
    const cx = w / 2;

    const layer: Phaser.GameObjects.GameObject[] = [];

    // Block all input underneath the prompt.
    const blocker = scene.add.graphics();
    blocker.fillStyle(0x000000, 0.6);
    blocker.fillRect(0, 0, w, h);
    blocker.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(blocker);
    layer.push(blocker);

    const panel = scene.add.graphics();
    panel.fillStyle(0x0d0d1e, 1);
    panel.fillRoundedRect(px, py, PROMPT_W, PROMPT_H, 10);
    panel.lineStyle(2, 0x3a3a5a, 1);
    panel.strokeRoundedRect(px, py, PROMPT_W, PROMPT_H, 10);
    this.add(panel);
    layer.push(panel);

    const headerTxt = scene.add.text(cx, py + 18, i18n.t('reward.equip_prompt', { item: i18n.t(itemLabel) }), {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: THEME.colors.text.gold, fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add(headerTxt);
    layer.push(headerTxt);

    const slotLabel = i18n.t('slots.' + slot);
    if (occupantId) {
      const occupantDef = this.runManager.registry.getItem(occupantId);
      // occupantDef.label should be a key now, so translate it.
      const occupantName = i18n.t(occupantDef?.label ?? occupantId);
      const warnTxt = scene.add.text(cx, py + 46, [
        i18n.t('reward.slot_label', { slot: slotLabel }),
        i18n.t('reward.currently_equipped', { item: occupantName }),
        i18n.t('reward.unequip_warning'),
      ].join('\n'), {
        fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ffaa44',
        align: 'center', lineSpacing: 3,
      }).setOrigin(0.5, 0);
      this.add(warnTxt);
      layer.push(warnTxt);
    } else {
      const slotTxt = scene.add.text(cx, py + 46, i18n.t('reward.slot_empty', { slot: slotLabel }), {
        fontFamily: THEME.fonts.main, fontSize: '10px', color: '#aaaacc',
      }).setOrigin(0.5, 0);
      this.add(slotTxt);
      layer.push(slotTxt);
    }

    const destroyLayer = () => {
      for (const obj of layer) {
        if (obj && (obj as Phaser.GameObjects.GameObject).active) {
          (obj as Phaser.GameObjects.GameObject).destroy();
        }
      }
    };

    const doEquipAndDone = () => {
      destroyLayer();
      this.runManager.equipItem(itemId);
      onDone();
    };

    // "Equip now" button
    const equipBtnY = py + PROMPT_H - 44;
    const equipBg = scene.add.rectangle(cx - 72, equipBtnY, 130, 30, 0x1a4a1a)
      .setInteractive({ useHandCursor: true });
    const equipLbl = scene.add.text(cx - 72, equipBtnY, i18n.t('reward.equip_now'), {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: '#88ff88', fontStyle: 'bold',
    }).setOrigin(0.5);
    equipBg.on('pointerover', () => equipBg.setFillStyle(0x2a6a2a));
    equipBg.on('pointerout',  () => equipBg.setFillStyle(0x1a4a1a));
    equipBg.on('pointerdown', () => {
      if (occupantId) {
        // Show stat comparison before confirming swap.
        destroyLayer();
        this.showSwapWarning(itemId, slot, occupantId, onDone);
      } else {
        doEquipAndDone();
      }
    });
    this.add(equipBg);
    this.add(equipLbl);
    layer.push(equipBg);
    layer.push(equipLbl);

    // "Skip" button
    const skipBg = scene.add.rectangle(cx + 72, equipBtnY, 130, 30, 0x2a2a3a)
      .setInteractive({ useHandCursor: true });
    const skipLbl = scene.add.text(cx + 72, equipBtnY, i18n.t('reward.equip_later'), {
      fontFamily: THEME.fonts.main, fontSize: '11px', color: '#aaaacc', fontStyle: 'bold',
    }).setOrigin(0.5);
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x3a3a5a));
    skipBg.on('pointerout',  () => skipBg.setFillStyle(0x2a2a3a));
    skipBg.on('pointerdown', () => { destroyLayer(); onDone(); });
    this.add(skipBg);
    this.add(skipLbl);
    layer.push(skipBg);
    layer.push(skipLbl);
  }

  /**
   * Swap-warning modal: shows what will be unequipped and what will be gained,
   * then confirms the swap.
   */
  private showSwapWarning(
    incomingId: string,
    slot: EquipmentSlot,
    currentId: string,
    onDone: () => void,
  ): void {
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;

    const incomingDef = this.runManager.registry.getItem(incomingId);
    const currentDef  = this.runManager.registry.getItem(currentId);

    const MODAL_W = 360;
    const MODAL_H = 220;
    const mx = cx - MODAL_W / 2;
    const my = (h - MODAL_H) / 2;

    const modal: Phaser.GameObjects.GameObject[] = [];

    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, 0.7);
    dim.fillRect(0, 0, w, h);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(dim);
    modal.push(dim);

    const mpanel = scene.add.graphics();
    mpanel.fillStyle(0x0d0d1e, 1);
    mpanel.fillRoundedRect(mx, my, MODAL_W, MODAL_H, 10);
    mpanel.lineStyle(2, 0xcc6600, 1);
    mpanel.strokeRoundedRect(mx, my, MODAL_W, MODAL_H, 10);
    this.add(mpanel);
    modal.push(mpanel);

    const headerTxt = scene.add.text(cx, my + 18, i18n.t('pause.equipment.replace_title', { slot: i18n.t('slots.' + slot) }), {
      fontFamily: THEME.fonts.main, fontSize: '14px', color: '#ffaa44', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add(headerTxt);
    modal.push(headerTxt);

    const curLines = currentDef?.modifier ? formatModifierLines(currentDef.modifier) : [];
    const curBlock = [
      `${i18n.t('pause.equipment.unequipping')} ${i18n.t(currentDef?.label ?? currentId)}`,
      ...curLines.map(l => `  − ${l}`),
    ].join('\n');
    const curTxt = scene.add.text(cx - 80, my + 50, curBlock, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ff8888', lineSpacing: 3,
    }).setOrigin(0, 0);
    this.add(curTxt);
    modal.push(curTxt);

    const incLines = incomingDef?.modifier ? formatModifierLines(incomingDef.modifier) : [];
    const incBlock = [
      `${i18n.t('pause.equipment.equipping')} ${i18n.t(incomingDef?.label ?? incomingId)}`,
      ...incLines.map(l => `  + ${l}`),
    ].join('\n');
    const incTxt = scene.add.text(cx - 80, my + 50 + 16 + curLines.length * 14, incBlock, {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#88ff88', lineSpacing: 3,
    }).setOrigin(0, 0);
    this.add(incTxt);
    modal.push(incTxt);

    const destroyModal = () => {
      for (const obj of modal) {
        if (obj && (obj as Phaser.GameObjects.GameObject).active) {
          (obj as Phaser.GameObjects.GameObject).destroy();
        }
      }
    };

    const confirmBg = scene.add.rectangle(cx - 70, my + MODAL_H - 28, 130, 30, 0x1a4a1a)
      .setInteractive({ useHandCursor: true });
    const confirmLbl = scene.add.text(cx - 70, my + MODAL_H - 28, i18n.t('pause.equipment.confirm_swap'), {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#88ff88', fontStyle: 'bold',
    }).setOrigin(0.5);
    confirmBg.on('pointerover', () => confirmBg.setFillStyle(0x2a6a2a));
    confirmBg.on('pointerout',  () => confirmBg.setFillStyle(0x1a4a1a));
    confirmBg.on('pointerdown', () => {
      destroyModal();
      this.runManager.equipItem(incomingId);
      onDone();
    });
    this.add(confirmBg);
    this.add(confirmLbl);
    modal.push(confirmBg);
    modal.push(confirmLbl);

    const cancelBg = scene.add.rectangle(cx + 70, my + MODAL_H - 28, 100, 30, 0x3a2a2a)
      .setInteractive({ useHandCursor: true });
    const cancelLbl = scene.add.text(cx + 70, my + MODAL_H - 28, i18n.t('pause.equipment.cancel'), {
      fontFamily: THEME.fonts.main, fontSize: '10px', color: '#ff8888', fontStyle: 'bold',
    }).setOrigin(0.5);
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x5a3a3a));
    cancelBg.on('pointerout',  () => cancelBg.setFillStyle(0x3a2a2a));
    cancelBg.on('pointerdown', () => { destroyModal(); onDone(); });
    this.add(cancelBg);
    this.add(cancelLbl);
    modal.push(cancelBg);
    modal.push(cancelLbl);
  }
}
