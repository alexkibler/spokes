import Phaser from 'phaser';
import { type MapNode } from '../../roguelike/RunManager';
import { generateCourseProfile, type CourseProfile } from '../../course/CourseProfile';
import { formatChallengeText, type EliteChallenge } from '../../roguelike/EliteChallenge';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';

export class EliteChallengeOverlay extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    scrollY: number,
    node: MapNode,
    ftpW: number,
    onAccept: (course: CourseProfile, challenge: EliteChallenge) => void,
    onClose: () => void
  ) {
    super(scene, 0, scrollY);
    this.setDepth(2000);

    const challenge = node.eliteChallenge;
    if (!challenge) {
      this.destroy();
      return;
    }

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background
    const bg = scene.add.graphics();
    bg.fillStyle(THEME.colors.ui.overlayDim, THEME.colors.ui.overlayDimAlpha);
    bg.fillRect(0, 0, w, h);
    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.add(bg);

    // Panel layout
    const btnWidth = Math.min(520, w - 80);
    const padH = 40;
    const padV = 32;
    const titleFontSize = 22;
    const flavorFontSize = 15;
    const condFontSize = 15;
    const btnHeight = 54;
    const btnGap = 14;

    const charsPerLine = Math.floor(btnWidth / (flavorFontSize * 0.58));
    const flavorLines = Math.ceil(challenge.flavorText.length / charsPerLine) + 1;
    const flavorHeight = flavorLines * (flavorFontSize * 1.55);

    const condText = formatChallengeText(challenge, ftpW);
    const condLines = Math.ceil(condText.length / charsPerLine) + 1;
    const condHeight = condLines * (condFontSize * 1.55);

    const rewardLineH = condFontSize * 1.8;
    const ph = padV + titleFontSize + 16 + flavorHeight + 16 + condHeight + rewardLineH + 28 + btnHeight * 2 + btnGap + padV;
    const pw = btnWidth + padH * 2;
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;

    // Panel background
    const panel = scene.add.graphics();
    panel.fillStyle(0x0d0d0a, 1);
    panel.fillRoundedRect(px, py, pw, ph, 14);
    panel.lineStyle(2, 0x3a2800, 1);
    panel.strokeRoundedRect(px, py, pw, ph, 14);
    this.add(panel);

    // Gold banner strip
    const bannerH = titleFontSize + 24;
    const banner = scene.add.graphics();
    banner.fillStyle(0x1a1200, 1);
    banner.fillRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    // Thin gold top border
    banner.lineStyle(2, 0xcc9900, 0.8);
    banner.strokeRoundedRect(px, py, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.add(banner);

    // ★ ELITE CHALLENGE title
    this.add(scene.add.text(w / 2, py + bannerH / 2 - 4, `★  ${challenge.title.toUpperCase()}  ★`, {
      fontFamily: THEME.fonts.main,
      fontSize: `${titleFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    let cursorY = py + bannerH + 16;

    // Flavor text (italic-style, muted)
    this.add(scene.add.text(px + padH, cursorY, challenge.flavorText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${flavorFontSize}px`,
      color: '#a09888',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
      fontStyle: 'italic',
    }).setOrigin(0, 0));
    cursorY += flavorHeight + 16;

    // Divider line
    const divider = scene.add.graphics();
    divider.lineStyle(1, 0x3a2800, 0.8);
    divider.lineBetween(px + padH, cursorY - 8, px + pw - padH, cursorY - 8);
    this.add(divider);

    // Condition text (white, clear)
    this.add(scene.add.text(px + padH, cursorY, condText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize}px`,
      color: '#e8e0d0',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
    }).setOrigin(0, 0));
    cursorY += condHeight + 8;

    // Intensity Warning
    this.add(scene.add.text(px + padH, cursorY, '⚠ INTENSITY: ZONE 5 / RED ZONE', {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize - 2}px`,
      color: '#ff4444',
      fontStyle: 'bold',
    }).setOrigin(0, 0));
    cursorY += 24;

    // Reward line
    this.add(scene.add.text(px + padH, cursorY, `Reward: ${challenge.reward.description}`, {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0, 0));
    cursorY += rewardLineH + 18;

    // ── Accept button ──
    const acceptBtn = new Button(scene, {
      x: w / 2,
      y: cursorY + btnHeight / 2,
      width: btnWidth,
      height: btnHeight,
      text: 'ACCEPT CHALLENGE',
      color: 0x4a3600,
      hoverColor: 0x6b4e00,
      textColor: '#f0c030',
      onClick: () => {
        // Elite nodes ride their own dedicated course profile (not the edge's profile)
        const course = node.eliteCourseProfile ?? generateCourseProfile(2, 0.06, 'asphalt');

        this.destroy();
        onAccept(course, challenge);
      }
    });
    this.add(acceptBtn);

    cursorY += btnHeight + btnGap;

    // ── Retreat button ──
    const retreatBtn = new Button(scene, {
      x: w / 2,
      y: cursorY + btnHeight / 2,
      width: btnWidth,
      height: btnHeight,
      text: 'RETREAT',
      color: THEME.colors.buttons.secondary,
      hoverColor: THEME.colors.buttons.secondaryHover,
      onClick: () => {
        this.destroy();
        onClose();
      },
    });
    this.add(retreatBtn);

    scene.add.existing(this);
  }
}
