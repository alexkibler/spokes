import Phaser from 'phaser';
import { THEME } from '../../theme';
import type { RacerProfile } from '../../race/RacerProfile';

export interface RaceGapGhost {
  distanceM: number;
  racer: RacerProfile;
}

export class RaceGapPanel {
  private scene: Phaser.Scene;
  private raceGapBg!: Phaser.GameObjects.Graphics;
  private raceGapText!: Phaser.GameObjects.Text;
  private raceGapLabel!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildRaceGapPanel();
  }

  private buildRaceGapPanel(): void {
    this.raceGapBg = this.scene.add.graphics().setDepth(12);
    this.raceGapLabel = this.scene.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.xsmall, color: THEME.colors.text.subtle, letterSpacing: 2 }).setDepth(13).setOrigin(1, 0);
    this.raceGapText = this.scene.add.text(0, 0, '', { fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.medium, fontStyle: 'bold', color: THEME.colors.text.main }).setDepth(13).setOrigin(1, 0);
    this.raceGapBg.setVisible(false); this.raceGapLabel.setVisible(false); this.raceGapText.setVisible(false);
  }

  public update(playerDistM: number, ghosts: RaceGapGhost[]): void {
    if (ghosts.length === 0) {
      this.raceGapBg.setVisible(false);
      this.raceGapLabel.setVisible(false);
      this.raceGapText.setVisible(false);
      return;
    }

    this.raceGapBg.setVisible(true);
    this.raceGapLabel.setVisible(true);
    this.raceGapText.setVisible(true);

    const w = this.scene.scale.width, px = w - 8, py = 75, panW = 160, panH = 36;
    let nearest = ghosts[0], nearestGap = nearest.distanceM - playerDistM;
    for (const gh of ghosts) { const gap = gh.distanceM - playerDistM; if (Math.abs(gap) < Math.abs(nearestGap)) { nearest = gh; nearestGap = gap; } }

    this.raceGapBg.clear().fillStyle(0x0a0a1a, 0.80).fillRect(px - panW, py, panW, panH).lineStyle(1, nearest.racer.accentColor, 0.6).strokeRect(px - panW, py, panW, panH);
    const absGap = Math.abs(nearestGap);
    const distStr = absGap < 1000 ? `${absGap.toFixed(0)} m` : `${(absGap / 1000).toFixed(2)} km`;
    const gapStr = absGap <= 1 ? '─ NECK & NECK' : nearestGap > 0 ? `▲ ${distStr} AHEAD` : `▼ ${distStr} BEHIND`;
    const gapColor = absGap <= 1 ? '#ffffff' : nearestGap > 0 ? nearest.racer.accentHex : THEME.colors.text.accent;
    const ahead = ghosts.filter(gh => gh.distanceM > playerDistM).length;
    this.raceGapLabel.setPosition(px - 6, py + 5).setText(ghosts.length > 1 ? `RIVALS  ${ahead}/${ghosts.length} AHEAD` : nearest.racer.displayName);
    this.raceGapText.setPosition(px - 6, py + 17).setText(gapStr).setColor(gapColor);
  }

  public destroy(): void {
    this.raceGapBg.destroy();
    this.raceGapText.destroy();
    this.raceGapLabel.destroy();
  }
}
