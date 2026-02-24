import Phaser from 'phaser';
import { type RunData } from '../../roguelike/RunState';
import { THEME } from '../../theme';

export class MapStatsPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public render(run: RunData): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }

    if (!run) return;

    const stats = run.stats;
    const units = run.units; // Assuming run.units exists (it does in RunData)

    const recs = stats?.totalRecordCount ?? 0;
    const avgPowW = recs > 0 ? Math.round(stats!.totalPowerSum / recs) : 0;
    const avgCadRpm = recs > 0 ? Math.round(stats!.totalCadenceSum / recs) : 0;
    const distM = stats?.totalRiddenDistanceM ?? 0;
    const distStr = units === 'imperial'
      ? `${(distM / 1609.344).toFixed(2)} mi`
      : `${(distM / 1000).toFixed(2)} km`;

    const mapDistM = stats?.totalMapDistanceM ?? 0;
    const mapDistStr = units === 'imperial'
      ? `${(mapDistM / 1609.344).toFixed(1)} mi`
      : `${(mapDistM / 1000).toFixed(1)} km`;

    const currentFloor = run.nodes.find(n => n.id === run.currentNodeId)?.floor ?? 0;
    const totalFloors = run.runLength;

    const clearedEdges = run.edges.filter(e => e.isCleared) ?? [];
    const totalElevM = clearedEdges.reduce((sum, edge) =>
      sum + edge.profile.segments.reduce((s, seg) =>
        s + (seg.grade > 0 ? seg.distanceM * seg.grade : 0), 0), 0);
    const elevStr = totalElevM > 0
      ? (units === 'imperial'
        ? `${Math.round(totalElevM * 3.28084)} ft`
        : `${Math.round(totalElevM)} m`)
      : '—';

    const rows: [string, string][] = [
      ['DISTANCE',   distM > 0 ? distStr : '—'],
      ['ELEVATION',  elevStr],
      ['AVG POWER',  avgPowW > 0 ? `${avgPowW} W` : '—'],
      ['AVG CADENCE', avgCadRpm > 0 ? `${avgCadRpm} rpm` : '—'],
      ['FLOOR', totalFloors > 0 ? `${currentFloor} / ${totalFloors}` : '—'],
      ['TOTAL MAP', mapDistM > 0 ? mapDistStr : '—'],
    ];

    const panW = 190;
    const rowH = 26;
    const padV = 12;
    const padH = 10;
    const titleH = 22;
    const panH = padV + titleH + rows.length * rowH + padV;
    const x = 20;
    const y = this.scene.scale.height - panH - 20;

    this.container = this.scene.add.container(x, y).setScrollFactor(0).setDepth(10);

    const bg = this.scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.hudBackground, 0.7);
    bg.fillRoundedRect(0, 0, panW, panH, 8);
    bg.lineStyle(1, 0x2a2018, 1);
    bg.strokeRoundedRect(0, 0, panW, panH, 8);
    this.container.add(bg);

    this.container.add(this.scene.add.text(panW / 2, padV - 2, 'RUN STATS', {
      fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.muted, fontStyle: 'bold',
    }).setOrigin(0.5, 0));

    rows.forEach(([label, value], i) => {
      const ry = padV + titleH + i * rowH;
      this.container!.add(this.scene.add.text(padH, ry, label, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.subtle,
      }).setOrigin(0, 0));
      this.container!.add(this.scene.add.text(panW - padH, ry, value, {
        fontFamily: THEME.fonts.main, fontSize: THEME.fonts.sizes.default, color: THEME.colors.text.main, fontStyle: 'bold',
      }).setOrigin(1, 0));
    });
  }

  public destroy(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
