import Phaser from 'phaser';
import { THEME } from '../../theme';
import type { RewardDefinition, RewardRarity } from '../../roguelike/RewardPool';
import { RunStateManager } from '../../roguelike/RunState';
import { Button } from '../../ui/Button';
import { msToKmh, msToMph } from '../../physics/CyclistPhysics';
import type { RideStats } from './RideOverlay';
import type { Units } from '../MenuScene';

const RARITY_STYLE: Record<RewardRarity, { border: number; badgeBg: number; badgeText: string }> = {
  common:   { border: 0x445566, badgeBg: 0x2a3a44, badgeText: '#8899aa' },
  uncommon: { border: 0x2255aa, badgeBg: 0x0f2a66, badgeText: '#66aaff' },
  rare:     { border: 0xcc9900, badgeBg: 0x7a5a00, badgeText: '#ffdd44' },
};

export interface RewardOverlayHeader {
  stats: RideStats;
  units: Units;
}

export class RewardOverlay extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    rewards: RewardDefinition[],
    onPick: (reward: RewardDefinition) => void,
    onReroll: (() => void) | null,
    header?: RewardOverlayHeader,
  ) {
    super(scene, 0, 0);
    this.setDepth(200);
    this.setScrollFactor(0);

    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;

    // Dim background
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.88);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

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

    const px = cx - panW / 2;
    const py = (h - panH) / 2;

    // Panel
    const panel = scene.add.graphics();
    panel.fillStyle(0x0d0d14, 1);
    panel.fillRoundedRect(px, py, panW, panH, 12);
    panel.lineStyle(2, 0x3a3a5a, 1);
    panel.strokeRoundedRect(px, py, panW, panH, 12);
    this.add(panel);

    // ── Stats header (when coming from a ride) ────────────────────────────────
    if (header) {
      const { stats, units } = header;

      const statsBg = scene.add.graphics();
      statsBg.fillStyle(0x0a0a1c, 1);
      statsBg.fillRoundedRect(px, py, panW, STATS_H, { tl: 12, tr: 12, bl: 0, br: 0 });
      this.add(statsBg);

      // Title line
      this.add(scene.add.text(cx, py + 12, 'RIDE COMPLETE', {
        fontFamily: THEME.fonts.main, fontSize: '16px', fontStyle: 'bold',
        color: THEME.colors.text.accent, letterSpacing: 3,
      }).setOrigin(0.5, 0));

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

      this.add(scene.add.text(cx, py + 32, `${distStr}   ·   ${timeStr}   ·   ${stats.avgPowerW}W   ·   ${avgSpdStr}`, {
        fontFamily: THEME.fonts.main, fontSize: '11px', color: '#cccccc', letterSpacing: 1,
      }).setOrigin(0.5, 0));

      // Gold + challenge line
      const goldStr = stats.goldEarned !== undefined ? `+${stats.goldEarned} GOLD` : '';
      let challengeStr = '';
      let challengeColor = '#888888';
      if (stats.challengeResult) {
        if (stats.challengeResult.success) {
          challengeStr = `★ CHALLENGE COMPLETE — ${stats.challengeResult.reward}`;
          challengeColor = '#f0c030';
        } else {
          challengeStr = '✗ CHALLENGE FAILED';
          challengeColor = '#aa6655';
        }
      }

      if (goldStr) {
        this.add(scene.add.text(cx, py + 50, goldStr, {
          fontFamily: THEME.fonts.main, fontSize: '14px', fontStyle: 'bold',
          color: THEME.colors.text.gold,
        }).setOrigin(0.5, 0));
      }

      if (challengeStr) {
        const goldOffset = goldStr ? 18 : 0;
        this.add(scene.add.text(cx, py + 50 + goldOffset, challengeStr, {
          fontFamily: THEME.fonts.main, fontSize: '11px', color: challengeColor,
        }).setOrigin(0.5, 0));
      }

      // Divider
      const div = scene.add.graphics();
      div.lineStyle(1, 0x2a2a44, 1);
      div.lineBetween(px + 16, py + STATS_H - 1, px + panW - 16, py + STATS_H - 1);
      this.add(div);
    }

    // ── Banner ────────────────────────────────────────────────────────────────
    const bannerY = py + STATS_H;
    const banner = scene.add.graphics();
    banner.fillStyle(0x0a0a1c, 1);
    if (!header) {
      // Rounded top only when there's no stats header above it
      banner.fillRoundedRect(px, bannerY, panW, BANNER_H, { tl: 12, tr: 12, bl: 0, br: 0 });
    } else {
      banner.fillRect(px, bannerY, panW, BANNER_H);
    }
    this.add(banner);

    this.add(scene.add.text(cx, bannerY + BANNER_H / 2, 'CHOOSE YOUR REWARD', {
      fontFamily: THEME.fonts.main,
      fontSize: '20px',
      color: THEME.colors.text.gold,
      fontStyle: 'bold',
    }).setOrigin(0.5));

    this.add(scene.add.text(cx, bannerY + BANNER_H + 6, 'Select one to keep', {
      fontFamily: THEME.fonts.main,
      fontSize: '11px',
      color: THEME.colors.text.muted,
      letterSpacing: 2,
    }).setOrigin(0.5, 0));

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
      this.add(cardFill);

      const cardBorder = scene.add.graphics();
      cardBorder.lineStyle(2, rs.border, 1);
      cardBorder.strokeRoundedRect(cardL, cardT, cardW, CARD_H, 8);
      this.add(cardBorder);

      const BADGE_H = 22;
      const badge = scene.add.graphics();
      badge.fillStyle(rs.badgeBg, 1);
      badge.fillRoundedRect(cardL, cardT, cardW, BADGE_H, { tl: 8, tr: 8, bl: 0, br: 0 });
      this.add(badge);

      this.add(scene.add.text(cardCx, cardT + BADGE_H / 2, reward.rarity.toUpperCase(), {
        fontFamily: THEME.fonts.main,
        fontSize: '9px',
        color: rs.badgeText,
        fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0.5));

      this.add(scene.add.text(cardCx, cardT + BADGE_H + 16, reward.label, {
        fontFamily: THEME.fonts.main,
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardW - 16 },
      }).setOrigin(0.5, 0));

      this.add(scene.add.text(cardCx, cardT + BADGE_H + 46, reward.description, {
        fontFamily: THEME.fonts.main,
        fontSize: '11px',
        color: '#9999bb',
        align: 'center',
        wordWrap: { width: cardW - 16 },
        lineSpacing: 4,
      }).setOrigin(0.5, 0));

      const hitRect = scene.add.rectangle(cardCx, cardCy, cardW, CARD_H, 0xffffff, 0);
      hitRect.setInteractive({ useHandCursor: true });
      this.add(hitRect);

      hitRect.on('pointerover', () => { cardFill.setFillStyle(0x26263a); });
      hitRect.on('pointerout',  () => { cardFill.setFillStyle(0x1a1a2c); });
      hitRect.on('pointerdown', () => { onPick(reward); });
    });

    // ── Reroll ────────────────────────────────────────────────────────────────
    if (onReroll !== null) {
      const run = RunStateManager.getRun();
      const rerollCount = run?.inventory.filter(i => i === 'reroll_voucher').length ?? 0;
      const rerollBtn = new Button(scene, {
        x: cx,
        y: cardsTop + CARD_H + REROLL_SECTION_H / 2,
        width: 220,
        height: 36,
        text: `REROLL  (${rerollCount} left)`,
        color: 0x2a2a08,
        hoverColor: 0x444410,
        textColor: THEME.colors.text.gold,
        onClick: onReroll,
      });
      this.add(rerollBtn);
    }

    scene.add.existing(this);
  }
}
