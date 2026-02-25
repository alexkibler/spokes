import Phaser from 'phaser';
import { THEME } from '../theme';
import type { EliteChallenge } from '../core/roguelike/EliteChallenge';

export interface ChallengeStats {
  recordCount: number;
  edgeStartRecordCount: number;
  recordedPowerSum: number;
  latestPower: number;
  peakPowerW: number;
  effectiveFtpW: number;
  challengeEverStopped: boolean;
  challengeStartMs: number;
}

export class ChallengePanel {
  private scene: Phaser.Scene;
  private challengePanel!: Phaser.GameObjects.Graphics;
  private challengePanelTitle!: Phaser.GameObjects.Text;
  private challengePanelValue!: Phaser.GameObjects.Text;
  private challengePanelTarget!: Phaser.GameObjects.Text;
  private challengePanelBar!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildChallengePanel();
  }

  private buildChallengePanel(): void {
    const PANEL_Y = 70, depth = 12;
    this.challengePanel = this.scene.add.graphics().setDepth(depth);
    this.challengePanelTitle = this.scene.add.text(10, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.small, color: THEME.colors.text.gold, letterSpacing: 2 }).setDepth(depth + 1);
    this.challengePanelValue = this.scene.add.text(this.scene.scale.width / 2, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(depth + 1);
    this.challengePanelTarget = this.scene.add.text(this.scene.scale.width - 10, PANEL_Y + 5, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.small, color: '#aaaaaa' }).setOrigin(1, 0).setDepth(depth + 1);
    this.challengePanelBar = this.scene.add.graphics().setDepth(depth + 1);

    this.setVisible(false);
  }

  public setVisible(visible: boolean): void {
    this.challengePanel.setVisible(visible);
    this.challengePanelTitle.setVisible(visible);
    this.challengePanelValue.setVisible(visible);
    this.challengePanelTarget.setVisible(visible);
    this.challengePanelBar.setVisible(visible);
  }

  public update(activeChallenge: EliteChallenge | null, stats: ChallengeStats): void {
    if (!activeChallenge) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    const PANEL_Y = 70, PANEL_H = 38, BAR_H = 4, BAR_Y = PANEL_Y + PANEL_H - BAR_H - 2, w = this.scene.scale.width;
    const cond = activeChallenge.condition;
    this.challengePanelTitle.setText(`★ ${activeChallenge.title.toUpperCase()}`);
    let current = 0, target = 0, valueLabel = '', isTimeBased = false;

    if (cond.type === 'avg_power_above_ftp_pct') {
      const liveRecs = stats.recordCount - stats.edgeStartRecordCount;
      current = Math.round(liveRecs > 0 ? stats.recordedPowerSum / liveRecs : stats.latestPower);
      target = Math.round(stats.effectiveFtpW * (cond.ftpMultiplier ?? 1));
      valueLabel = `AVG: ${current} W  →  TARGET: ${target} W`;
    } else if (cond.type === 'peak_power_above_ftp_pct') {
      current = Math.round(stats.peakPowerW);
      target = Math.round(stats.effectiveFtpW * (cond.ftpMultiplier ?? 1));
      valueLabel = `PEAK: ${current} W  →  TARGET: ${target} W`;
    } else if (cond.type === 'complete_no_stop') {
      const clean = !stats.challengeEverStopped;
      this.challengePanelValue.setText(clean ? 'KEEP MOVING' : '✗ STOPPED').setColor(clean ? THEME.colors.text.accent : THEME.colors.text.danger);
      this.challengePanelBar.clear().fillStyle(clean ? 0x00f5d4 : 0xff4455, 0.7).fillRect(0, BAR_Y, clean ? w : w * 0.15, BAR_H);
      return;
    } else if (cond.type === 'time_under_seconds') {
      const elapsedSec = (Date.now() - stats.challengeStartMs) / 1000;
      const limit = cond.timeLimitSeconds ?? 180;
      current = Math.round(elapsedSec); target = limit; isTimeBased = true;
      const remaining = Math.max(0, limit - elapsedSec);
      valueLabel = `TIME LEFT: ${Math.floor(remaining/60)}:${String(Math.floor(remaining%60)).padStart(2,'0')}  →  LIMIT: ${Math.floor(limit/60)}:${String(limit%60).padStart(2,'0')}`;
    }

    this.challengePanelValue.setText(valueLabel).setStyle({ fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main, fontStyle: 'bold' });
    this.challengePanelTarget.setText(activeChallenge.reward.description.toUpperCase());
    const ratio = isTimeBased ? Math.max(0, Math.min(1, 1 - current / target)) : target > 0 ? Math.min(1, current / target) : 0;
    const passing = isTimeBased ? current < target : current >= target;
    this.challengePanelBar.clear().fillStyle(0x333344, 1).fillRect(0, BAR_Y, w, BAR_H).fillStyle(passing ? 0x00f5d4 : 0xffaa00, 0.85).fillRect(0, BAR_Y, Math.round(w * ratio), BAR_H);
    if (!isTimeBased) this.challengePanelBar.fillStyle(0xffffff, 0.6).fillRect(w - 2, BAR_Y, 2, BAR_H);
  }

  public destroy(): void {
    this.challengePanel.destroy();
    this.challengePanelTitle.destroy();
    this.challengePanelValue.destroy();
    this.challengePanelTarget.destroy();
    this.challengePanelBar.destroy();
  }
}
