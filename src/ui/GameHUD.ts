import Phaser from 'phaser';
import { THEME } from '../theme';
import { msToKmh, msToMph } from '../core/physics/CyclistPhysics';
import type { Units } from '../scenes/MenuScene';

export class GameHUD extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private separators: Phaser.GameObjects.Graphics[] = [];

  private labels: Phaser.GameObjects.Text[] = [];
  private values: Phaser.GameObjects.Text[] = [];
  private units: Phaser.GameObjects.Text[] = []; // Stores units for non-power columns

  // Specific refs for Power column complexities
  private hudPower!: Phaser.GameObjects.Text;
  private hudPowerUnit!: Phaser.GameObjects.Text;
  private hudRealPower!: Phaser.GameObjects.Text;

  // Specific refs for other columns to update
  private hudSpeed!: Phaser.GameObjects.Text;
  private hudGrade!: Phaser.GameObjects.Text;
  private hudDistance!: Phaser.GameObjects.Text;
  private hudCadence!: Phaser.GameObjects.Text;
  private hudHR!: Phaser.GameObjects.Text;

  private unitPreference: Units;

  constructor(scene: Phaser.Scene, unitPreference: Units) {
    super(scene, 0, 0);
    this.unitPreference = unitPreference;
    this.setDepth(10);

    this.background = scene.add.graphics();
    this.add(this.background);

    // 6 columns → 5 separators
    for (let i = 0; i < 5; i++) {
      const sep = scene.add.graphics();
      this.separators.push(sep);
      this.add(sep);
    }

    const labelsText = ['SPEED', 'GRADE', 'POWER', 'DIST', 'CADENCE', 'HR'];
    const unitsText  = [
      this.unitPreference === 'imperial' ? 'mph' : 'km/h',
      '',
      'W',
      this.unitPreference === 'imperial' ? 'mi' : 'km',
      'rpm',
      'bpm',
    ];

    for (let i = 0; i < 6; i++) {
      const lbl = scene.add.text(0, 7, labelsText[i], {
        fontFamily: THEME.fonts.main,
        fontSize: THEME.fonts.sizes.small,
        color: THEME.colors.text.muted,
        letterSpacing: 3,
      }).setOrigin(0.5, 0);
      this.add(lbl);
      this.labels.push(lbl);

      let val: Phaser.GameObjects.Text;
      if (i === 2) {
        // Power column
        val = scene.add.text(0, 19, '---', {
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizes.hero, // 28px in GameScene, hero in Theme
          color: THEME.colors.text.accent,
          fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        this.hudPower = val;

        this.hudPowerUnit = scene.add.text(0, 64, 'W', {
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizes.small,
          color: THEME.colors.text.muted,
          letterSpacing: 3,
        }).setOrigin(0.5, 1);
        this.add(this.hudPowerUnit);

        this.hudRealPower = scene.add.text(0, 64, '', {
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizes.small,
          color: THEME.colors.text.subtle,
        }).setOrigin(0.5, 1).setAlpha(0);
        this.add(this.hudRealPower);
      } else if (i === 5) {
        // HR column
        val = scene.add.text(0, 19, '---', {
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizes.hudValue,
          color: '#ff88aa', // Pink HR
          fontStyle: 'bold',
        }).setOrigin(0.5, 0);
        this.hudHR = val;
      } else {
        val = scene.add.text(0, 19, '--.-', {
          fontFamily: THEME.fonts.main,
          fontSize: THEME.fonts.sizes.hudValue,
          color: THEME.colors.text.main,
          fontStyle: 'bold',
        }).setOrigin(0.5, 0);

        if (i === 0) this.hudSpeed    = val;
        else if (i === 1) this.hudGrade    = val;
        else if (i === 3) this.hudDistance = val;
        else if (i === 4) this.hudCadence  = val;
      }
      this.add(val);
      this.values.push(val);

      if (unitsText[i]) {
        if (i !== 2) { // Power unit handled separately
          const u = scene.add.text(0, 64, unitsText[i], {
            fontFamily: THEME.fonts.main,
            fontSize: THEME.fonts.sizes.small,
            color: THEME.colors.text.muted,
            letterSpacing: 3,
          }).setOrigin(0.5, 1);
          this.add(u);
          this.units.push(u); // Note: index mismatch now, units[0] corresponds to col 0, units[1] to col 3 (dist)
        } else {
           // Placeholder to keep indexing aligned if we iterate, but we store specific refs
           // Actually, let's just store all unit texts in a sparse way or just access them via specific logic
           // GameScene stored them in an array skipping empty ones.
           // I'll stick to specific updates.
        }
      }
    }

    scene.add.existing(this);
  }

  public onResize(width: number): void {
    this.background.clear();
    this.background.fillStyle(THEME.colors.ui.hudBackground, THEME.colors.ui.hudAlpha);
    this.background.fillRect(0, 0, width, THEME.layout.hudHeight);

    const colW = width / 6;
    const getX = (i: number) => i * colW + colW / 2;
    const sepW = colW;

    this.separators.forEach((sep, i) => {
      sep.clear();
      sep.fillStyle(THEME.colors.ui.separator, 1);
      sep.fillRect((i + 1) * sepW, 8, 1, 54);
    });

    // Update positions
    // Cols: 0=Speed, 1=Grade, 2=Power, 3=Dist, 4=Cadence, 5=HR
    for (let i = 0; i < 6; i++) {
      const x = getX(i);
      this.labels[i].setX(x);
      this.values[i].setX(x);

      // Units
      if (i === 0) { // Speed
         // hudUnits[0] ?
         // I didn't store them well. Let's find them by children? No.
         // Let's iterate children.
      }
    }

    // Speed (0)
    // Find unit text for speed?
    // I pushed to this.units array.
    // units[0] is Speed unit.
    // units[1] is Dist unit.
    // units[2] is Cadence unit.
    // units[3] is HR unit.
    if (this.units[0]) this.units[0].setX(getX(0));
    if (this.units[1]) this.units[1].setX(getX(3));
    if (this.units[2]) this.units[2].setX(getX(4));
    if (this.units[3]) this.units[3].setX(getX(5));

    // Power (2)
    this.hudPowerUnit.setX(getX(2));
    this.hudRealPower.setX(getX(2));
  }

  public updateSpeed(velocityMs: number): void {
    if (this.unitPreference === 'imperial') {
      this.hudSpeed.setText(msToMph(velocityMs).toFixed(1));
    } else {
      this.hudSpeed.setText(msToKmh(velocityMs).toFixed(1));
    }
  }

  public updateGrade(grade: number): void {
    const sign = grade >= 0 ? '+' : '';
    this.hudGrade.setText(`${sign}${(grade * 100).toFixed(1)}%`);
    this.hudGrade.setColor(this.getGradeColor(grade));
  }

  public updateDistance(distanceM: number): void {
    if (this.unitPreference === 'imperial') {
      this.hudDistance.setText((distanceM / 1609.344).toFixed(2));
    } else {
      this.hudDistance.setText((distanceM / 1000).toFixed(2));
    }
  }

  public updateCadence(rpm: number): void {
    this.hudCadence.setText(String(Math.round(rpm)));
  }

  public updateHR(bpm: number): void {
    this.hudHR.setText(String(Math.round(bpm)));
  }

  public updatePower(netWatts: number, rawWatts: number, effectActive: boolean, effectColor?: string): void {
    this.hudPower.setText(String(Math.round(netWatts)));

    if (effectActive && effectColor) {
      this.hudPower.setColor(effectColor);
      this.hudPowerUnit.setAlpha(0);
      this.hudRealPower.setText(`raw: ${Math.round(rawWatts)}W`).setAlpha(1);
    } else {
      this.hudPower.setColor(THEME.colors.text.accent);
      this.hudPowerUnit.setAlpha(1);
      this.hudRealPower.setAlpha(0);
    }
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
