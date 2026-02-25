import Phaser from 'phaser';
import { THEME } from '../theme';
import { type CourseProfile, type ElevationSample, buildElevationSamples } from '../core/course/CourseProfile';
import type { Units } from '../scenes/MenuScene';

export class ElevationGraph extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private graphics: Phaser.GameObjects.Graphics;
  private elevLabel: Phaser.GameObjects.Text;
  private gradeLabel: Phaser.GameObjects.Text;
  private distLabel: Phaser.GameObjects.Text;

  private course: CourseProfile;
  private elevationSamples: ElevationSample[] = [];
  private segmentBoundaries: Array<{
    startM: number; endM: number;
    startElevM: number; endElevM: number;
    grade: number;
  }> = [];
  private minElevM = 0;
  private maxElevM = 0;
  private units: Units;
  private isBackwards: boolean;

  constructor(scene: Phaser.Scene, course: CourseProfile, units: Units, isBackwards: boolean) {
    super(scene, 0, 0);
    this.course = course;
    this.units = units;
    this.isBackwards = isBackwards;
    this.setDepth(10);

    // Pre-compute data
    this.elevationSamples = buildElevationSamples(course, 100);

    let _cumDist = 0;
    let _cumElev = 0;
    this.segmentBoundaries = course.segments.map(seg => {
      const startM     = _cumDist;
      const startElevM = _cumElev;
      _cumDist += seg.distanceM;
      _cumElev += seg.distanceM * seg.grade;
      return { startM, endM: _cumDist, startElevM, endElevM: _cumElev, grade: seg.grade };
    });

    const boundaryElevs = this.segmentBoundaries.flatMap(s => [s.startElevM, s.endElevM]);
    const allElevs = [...this.elevationSamples.map(s => s.elevationM), ...boundaryElevs];
    this.minElevM = Math.min(...allElevs);
    this.maxElevM = Math.max(...allElevs);

    // Components
    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    this.elevLabel = scene.add.text(32, 0, 'ELEV', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.small,
      color: THEME.colors.text.subtle,
      letterSpacing: 2,
    });
    this.add(this.elevLabel);

    this.gradeLabel = scene.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.small,
      color: THEME.colors.text.muted,
    }).setOrigin(1, 0);
    this.add(this.gradeLabel);

    this.distLabel = scene.add.text(0, 0, '', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.small,
      color: THEME.colors.text.subtle,
    }).setOrigin(1, 1);
    this.add(this.distLabel);

    scene.add.existing(this);
  }

  public onResize(width: number, height: number): void {
    const ELEV_H = THEME.layout.elevHeight;
    const yPos = height - 125;

    this.setPosition(0, yPos);

    this.bg.clear();
    this.bg.fillStyle(THEME.colors.ui.hudBackground, 0.45);
    this.bg.fillRect(0, 0, width, ELEV_H);

    this.elevLabel.setPosition(32, 5); // Relative to container
    this.gradeLabel.setPosition(width - 32, 5);
    this.distLabel.setPosition(width - 32, ELEV_H - 6);
  }

  public updateGraph(currentDistM: number, smoothGrade: number, ghosts: { distanceM: number; color: number; accentColor: number }[]): void {
    const g = this.graphics;
    g.clear();

    const width = this.scene.scale.width;
    const ELEV_H = THEME.layout.elevHeight;
    const PAD_X = 32;
    const PAD_Y = 8;

    const totalDist = this.course.totalDistanceM;
    const elevRange = (this.maxElevM - this.minElevM) || 1;

    const drawW = width - 2 * PAD_X;
    const drawH = ELEV_H - 2 * PAD_Y;
    const ox = PAD_X;
    const oy = PAD_Y; // Relative to container

    const toX = (d: number) => this.isBackwards
      ? ox + drawW - (d / totalDist) * drawW
      : ox + (d / totalDist) * drawW;

    const toY = (e: number) => oy + drawH - ((e - this.minElevM) / elevRange) * drawH;

    // Segments
    for (const seg of this.segmentBoundaries) {
      const inSeg = this.elevationSamples.filter(s => s.distanceM > seg.startM && s.distanceM < seg.endM);
      const poly: Phaser.Types.Math.Vector2Like[] = [
        { x: toX(seg.startM), y: oy + drawH },
        { x: toX(seg.startM), y: toY(seg.startElevM) },
        ...inSeg.map(s => ({ x: toX(s.distanceM), y: toY(s.elevationM) })),
        { x: toX(seg.endM),   y: toY(seg.endElevM) },
        { x: toX(seg.endM),   y: oy + drawH },
      ];
      g.fillStyle(this.getGradeColorHex(seg.grade), 1.0);
      g.fillPoints(poly, true);
    }

    // Outline
    g.lineStyle(1, 0x7a6858, 0.8);
    g.beginPath();
    this.elevationSamples.forEach((s, i) => {
      const px = toX(s.distanceM);
      const py = toY(s.elevationM);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.strokePath();

    // Completed
    g.fillStyle(0x00f5d4, 0.12);
    const completedPoints: Phaser.Types.Math.Vector2Like[] = [
      { x: toX(0),            y: oy + drawH },
      ...this.elevationSamples
        .filter((s) => s.distanceM <= currentDistM)
        .map((s) => ({ x: toX(s.distanceM), y: toY(s.elevationM) })),
      { x: toX(currentDistM), y: oy + drawH },
    ];
    if (completedPoints.length > 2) {
      g.fillPoints(completedPoints, true);
    }

    // Ghosts
    for (const ghost of ghosts) {
      const ghostDist = ghost.distanceM % totalDist;
      const gx = toX(ghostDist);
      g.lineStyle(1.5, ghost.accentColor, 0.60);
      g.beginPath();
      g.moveTo(gx, oy);
      g.lineTo(gx, oy + drawH);
      g.strokePath();
      g.fillStyle(ghost.color, 0.85);
      g.fillTriangle(gx - 4, oy + drawH + 2, gx + 4, oy + drawH + 2, gx, oy + drawH - 4);
    }

    // Player Marker
    const mx = toX(currentDistM);
    g.lineStyle(2, 0x00f5d4, 1);
    g.beginPath();
    g.moveTo(mx, oy);
    g.lineTo(mx, oy + drawH);
    g.strokePath();
    g.fillStyle(0x00f5d4, 1);
    g.fillTriangle(mx - 4, oy + drawH + 2, mx + 4, oy + drawH + 2, mx, oy + drawH - 4);

    // Labels
    const gradeSign = smoothGrade >= 0 ? '+' : '';
    this.gradeLabel.setText(`${gradeSign}${(smoothGrade * 100).toFixed(1)}%`);
    this.gradeLabel.setColor(this.getGradeColor(smoothGrade));

    let lapLabel: string;
    let totalLabel: string;
    if (this.units === 'imperial') {
      lapLabel   = `${(currentDistM / 1609.344).toFixed(1)} mi`;
      totalLabel = `${(totalDist    / 1609.344).toFixed(1)} mi`;
    } else {
      lapLabel   = `${(currentDistM / 1000).toFixed(1)} km`;
      totalLabel = `${(totalDist    / 1000).toFixed(1)} km`;
    }
    this.distLabel.setText(`${lapLabel} / ${totalLabel}`);
  }

  private getGradeColorHex(grade: number): number {
    if (grade > 0.10) return THEME.colors.grades.steepClimb;
    if (grade > 0.06) return THEME.colors.grades.hardClimb;
    if (grade > 0.03) return THEME.colors.grades.medClimb;
    if (grade > 0.01) return THEME.colors.grades.easyClimb;
    if (grade > -0.01) return THEME.colors.grades.flat;
    if (grade > -0.03) return THEME.colors.grades.easyDescent;
    if (grade > -0.06) return THEME.colors.grades.medDescent;
    return THEME.colors.grades.steepDescent;
  }

  private getGradeColor(grade: number): string {
    if (grade > 0.10) return THEME.colors.gradeHex.steepClimb;
    if (grade > 0.06) return THEME.colors.gradeHex.hardClimb;
    if (grade > 0.03) return THEME.colors.gradeHex.medClimb;
    if (grade > 0.01) return THEME.colors.gradeHex.easyClimb;
    if (grade > -0.01) return THEME.colors.gradeHex.flat;
    if (grade > -0.03) return THEME.colors.gradeHex.easyDescent;
    if (grade > -0.06) return THEME.colors.gradeHex.medDescent;
    return THEME.colors.gradeHex.steepDescent;
  }
}
