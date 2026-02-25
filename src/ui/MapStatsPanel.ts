import Phaser from 'phaser';
import { type RunData } from '../core/roguelike/RunManager';
import { THEME } from '../theme';
import i18next from '../i18n';
import { Panel } from '../components/components/Panel';
import { Typography } from '../components/components/Typography';

export class MapStatsPanel {
  private scene: Phaser.Scene;
  private container: Panel | null = null;

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
    const units = run.units;

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
      [i18next.t('ui.stats.distance'),   distM > 0 ? distStr : '—'],
      [i18next.t('ui.stats.elevation'),  elevStr],
      [i18next.t('ui.stats.avg_power'),  avgPowW > 0 ? `${avgPowW} W` : '—'],
      [i18next.t('ui.stats.avg_cadence'), avgCadRpm > 0 ? `${avgCadRpm} rpm` : '—'],
      [i18next.t('ui.stats.floor'), totalFloors > 0 ? `${currentFloor} / ${totalFloors}` : '—'],
      [i18next.t('ui.stats.total_map'), mapDistM > 0 ? mapDistStr : '—'],
    ];

    const panW = 190;
    const rowH = 26;
    const padV = 12;
    const padH = 10;
    const titleH = 22;
    const panH = padV + titleH + rows.length * rowH + padV;
    const x = 20;
    const y = this.scene.scale.height - panH - 20;

    this.container = new Panel(this.scene, {
        x, y,
        width: panW,
        height: panH,
        depth: THEME.depths.ui,
    });

    const title = new Typography(this.scene, {
        x: panW / 2,
        y: padV - 2,
        text: i18next.t('ui.stats.title'),
        variant: 'label',
        align: 'center'
    }).setOrigin(0.5, 0);
    this.container.add(title);

    rows.forEach(([label, value], i) => {
      const ry = padV + titleH + i * rowH;

      const lbl = new Typography(this.scene, {
          x: padH,
          y: ry,
          text: label,
          variant: 'caption',
          color: THEME.colors.text.subtle
      }).setOrigin(0, 0);
      this.container!.add(lbl);

      const val = new Typography(this.scene, {
          x: panW - padH,
          y: ry,
          text: value,
          variant: 'body',
          fontStyle: 'bold',
          align: 'right'
      }).setOrigin(1, 0);
      this.container!.add(val);
    });
  }

  public destroy(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
