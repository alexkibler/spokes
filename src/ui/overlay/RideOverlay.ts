import Phaser from 'phaser';
import { THEME } from '../../theme';
import { Button } from '../../components/Button';
import { msToKmh, msToMph } from '../../core/physics/CyclistPhysics';
import type { Units } from '../../scenes/MenuScene';

export interface RideStats {
  distanceM: number;
  elapsedMs: number;
  avgPowerW: number;
  avgSpeedMs: number;
  elevGainM: number;
  goldEarned?: number;
  isNewClear?: boolean;
  challengeResult?: {
    success: boolean;
    reward: string;
  };
  bossResult?: {
    playerWon: boolean;
    finishedCount: number;
    totalCount: number;
  };
}

export class RideOverlay extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    stats: RideStats,
    units: Units,
    isRoguelike: boolean,
    isCompleted: boolean,
    isFinishNode: boolean,
    isRealTrainer: boolean,
    onContinue: () => void,
    onDownload: () => void,
    onMenu: () => void
  ) {
    super(scene, 0, 0);
    this.setDepth(50);
    this.setScrollFactor(0);

    const w = scene.scale.width;
    const h = scene.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    // Dim overlay
    const dim = scene.add.graphics();
    dim.fillStyle(THEME.colors.ui.overlayDim, 0.75);
    dim.fillRect(0, 0, w, h);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Panel
    const panW = Math.min(480, w - 40);
    const panH = 220; // Increased slightly for breathing room
    const px = cx - panW / 2;
    const py = cy - panH / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(0x111122, 0.97);
    panel.fillRect(px, py, panW, panH);
    panel.lineStyle(1, 0x3344aa, 1);
    panel.strokeRect(px, py, panW, panH);
    this.add(panel);

    // Title
    const titleText = isCompleted ? 'RIDE COMPLETE' : 'RIDE ENDED';
    const titleColor = isCompleted ? THEME.colors.text.accent : '#aaaacc';
    this.add(scene.add.text(cx, py + 26, titleText, {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.title, fontStyle: 'bold', color: titleColor,
    }).setOrigin(0.5, 0));

    // Stats formatting
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

    const segElevStr = units === 'imperial'
      ? `${Math.round(stats.elevGainM * 3.28084)} ft`
      : `${Math.round(stats.elevGainM)} m`;

    const statsStr = `${distStr}   ·   ${timeStr}   ·   ${stats.avgPowerW}W   ·   ${avgSpdStr}`;
    this.add(scene.add.text(cx, py + 60, statsStr, {
      fontFamily: THEME.fonts.main, fontSize: '12px', color: '#cccccc', letterSpacing: 1,
    }).setOrigin(0.5, 0));

    this.add(scene.add.text(cx, py + 76, `↑ ${segElevStr} gain`, {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: '#99bbcc', letterSpacing: 1,
    }).setOrigin(0.5, 0));

    let cursorY = py + 96;

    // Boss Result
    if (stats.bossResult && isCompleted) {
      const { playerWon, finishedCount, totalCount } = stats.bossResult;
      const bossRes = playerWon
        ? `YOU BEAT THE PELOTON!`
        : `PELOTON WINS  (${finishedCount}/${totalCount} FINISHED)`;
      const bossCol = playerWon ? THEME.colors.text.accent : '#ff6600';
      this.add(scene.add.text(cx, cursorY, bossRes, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.medium, fontStyle: 'bold', color: bossCol, letterSpacing: 2,
      }).setOrigin(0.5, 0));
      cursorY += 20;
    }

    // Roguelike Rewards
    if (isRoguelike && isCompleted) {
      if (stats.isNewClear) {
        this.add(scene.add.text(cx, cursorY, `+ ${stats.goldEarned} GOLD EARNED`, {
          fontFamily: THEME.fonts.main, fontSize: '16px', fontStyle: 'bold', color: THEME.colors.text.gold,
        }).setOrigin(0.5, 0));
        cursorY += 20;

        if (stats.challengeResult) {
          if (stats.challengeResult.success) {
            this.add(scene.add.text(cx, cursorY, `★ CHALLENGE COMPLETE — ${stats.challengeResult.reward}`, {
              fontFamily: THEME.fonts.main, fontSize: '13px', fontStyle: 'bold', color: THEME.colors.text.gold,
            }).setOrigin(0.5, 0));
          } else {
            this.add(scene.add.text(cx, cursorY, `✗ CHALLENGE FAILED`, {
              fontFamily: THEME.fonts.main, fontSize: '13px', color: '#aa6655',
            }).setOrigin(0.5, 0));
          }
          cursorY += 20;
        }
      } else {
        this.add(scene.add.text(cx, cursorY, `(ALREADY CLEARED)`, {
          fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.medium, color: THEME.colors.text.muted,
        }).setOrigin(0.5, 0));
        cursorY += 20;
      }
    } else if (isRealTrainer) {
      // Real trainer ride — offer FIT download
      const div = scene.add.graphics();
      div.lineStyle(1, 0x333355, 1);
      div.lineBetween(px + 20, cursorY, px + panW - 20, cursorY);
      this.add(div);

      this.add(scene.add.text(cx, cursorY + 12, 'Save your ride data?', {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: '#888899', letterSpacing: 2,
      }).setOrigin(0.5, 0));
      cursorY += 28;
    } else {
      // Simulated ride — no FIT prompt
      cursorY += 8;
    }

    // Buttons
    const btnY = py + panH - 38;
    const btnW = 150;
    const btnH = 36;
    const gap = 16;

    if (isRoguelike && isCompleted) {
      const btnText = isFinishNode ? 'VICTORY!' : 'CONTINUE RUN';
      const textColor = isFinishNode ? '#000000' : THEME.colors.text.main;

      const btn = new Button(scene, {
        x: cx,
        y: btnY,
        width: btnW,
        height: btnH,
        text: btnText,
        variant: 'primary', // TODO: Add gold/victory variant
        textColor: textColor,
        onClick: onContinue,
      });
      this.add(btn);

    } else if (isRealTrainer) {
      const dlX = cx - btnW/2 - gap/2;
      const menuX = cx + btnW/2 + gap/2;

      const dlBtn = new Button(scene, {
        x: dlX,
        y: btnY,
        width: btnW,
        height: btnH,
        text: 'DOWNLOAD .FIT',
        variant: 'success',
        textColor: THEME.colors.text.accent,
        onClick: onDownload,
      });
      this.add(dlBtn);

      const menuBtn = new Button(scene, {
        x: menuX,
        y: btnY,
        width: btnW,
        height: btnH,
        text: 'MAIN MENU',
        variant: 'primary',
        onClick: onMenu,
      });
      this.add(menuBtn);
    } else {
      // Simulated ride — no FIT file to download
      const menuBtn = new Button(scene, {
        x: cx,
        y: btnY,
        width: btnW,
        height: btnH,
        text: 'MAIN MENU',
        variant: 'primary',
        onClick: onMenu,
      });
      this.add(menuBtn);
    }

    scene.add.existing(this);
  }
}
