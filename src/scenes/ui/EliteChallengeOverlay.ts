import Phaser from 'phaser';
import { type MapNode, RunManager } from '../../roguelike/RunManager';
import { generateCourseProfile, type CourseProfile } from '../../course/CourseProfile';
import { formatChallengeText, type EliteChallenge } from '../../roguelike/EliteChallenge';
import { THEME } from '../../theme';
import { Button } from '../../ui/Button';
import { BaseOverlay } from './BaseOverlay';

export class EliteChallengeOverlay extends BaseOverlay {
  constructor(
    scene: Phaser.Scene,
    scrollY: number,
    runManager: RunManager,
    node: MapNode,
    ftpW: number,
    onAccept: (course: CourseProfile, challenge: EliteChallenge) => void,
    onClose: () => void
  ) {
    const w = scene.scale.width;

    // Check challenge existence before super?
    // If !node.eliteChallenge, we should probably not even create the overlay.
    // But since we have to call super(), let's just proceed and handle it.
    // MapScene checks node type is 'elite' before calling this.
    // If logic fails, we can destroy self after super.

    const challenge = node.eliteChallenge;

    // Panel layout calculations
    const btnWidth = Math.min(520, w - 80);
    const padH = 40;
    const padV = 32;
    const titleFontSize = 22;
    const flavorFontSize = 15;
    const condFontSize = 15;
    const btnHeight = 54;
    const btnGap = 14;

    let ph = 0;
    let flavorHeight = 0;
    let condHeight = 0;
    let condText = '';

    if (challenge) {
        const charsPerLine = Math.floor(btnWidth / (flavorFontSize * 0.58));
        const flavorLines = Math.ceil(challenge.flavorText.length / charsPerLine) + 1;
        flavorHeight = flavorLines * (flavorFontSize * 1.55);

        condText = formatChallengeText(challenge, ftpW);
        const condLines = Math.ceil(condText.length / charsPerLine) + 1;
        condHeight = condLines * (condFontSize * 1.55);

        const rewardLineH = condFontSize * 1.8;
        ph = padV + titleFontSize + 16 + flavorHeight + 16 + condHeight + rewardLineH + 28 + btnHeight * 2 + btnGap + padV;
    }

    const pw = btnWidth + padH * 2;

    super({
        scene,
        width: pw,
        height: ph,
        scrollY,
        runManager,
        onClose: undefined,
        hasPanelBackground: true
    });

    // Set custom panel style
    this.drawPanelBackground(0x0d0d0a, 0x3a2800);

    if (!challenge) {
      this.destroy();
      return;
    }

    // Gold banner strip
    const bannerH = titleFontSize + 24;
    const banner = scene.add.graphics();
    banner.fillStyle(0x1a1200, 1);
    banner.fillRoundedRect(0, 0, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    // Thin gold top border
    banner.lineStyle(2, 0xcc9900, 0.8);
    banner.strokeRoundedRect(0, 0, pw, bannerH, { tl: 14, tr: 14, bl: 0, br: 0 });
    this.panelContainer.add(banner);

    // ★ ELITE CHALLENGE title
    const title = scene.add.text(pw / 2, bannerH / 2 - 4, `★  ${challenge.title.toUpperCase()}  ★`, {
      fontFamily: THEME.fonts.main,
      fontSize: `${titleFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.panelContainer.add(title);

    let cursorY = bannerH + 16;

    // Flavor text (italic-style, muted)
    const flavor = scene.add.text(padH, cursorY, challenge.flavorText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${flavorFontSize}px`,
      color: '#a09888',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
      fontStyle: 'italic',
    }).setOrigin(0, 0);
    this.panelContainer.add(flavor);
    cursorY += flavorHeight + 16;

    // Divider line
    const divider = scene.add.graphics();
    divider.lineStyle(1, 0x3a2800, 0.8);
    divider.lineBetween(padH, cursorY - 8, pw - padH, cursorY - 8);
    this.panelContainer.add(divider);

    // Condition text (white, clear)
    const cond = scene.add.text(padH, cursorY, condText, {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize}px`,
      color: '#e8e0d0',
      wordWrap: { width: btnWidth },
      lineSpacing: 3,
    }).setOrigin(0, 0);
    this.panelContainer.add(cond);
    cursorY += condHeight + 8;

    // Intensity Warning
    const warn = scene.add.text(padH, cursorY, '⚠ INTENSITY: ZONE 5 / RED ZONE', {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize - 2}px`,
      color: '#ff4444',
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    this.panelContainer.add(warn);
    cursorY += 24;

    // Reward line
    const reward = scene.add.text(padH, cursorY, `Reward: ${challenge.reward.description}`, {
      fontFamily: THEME.fonts.main,
      fontSize: `${condFontSize}px`,
      color: '#f0c030',
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    this.panelContainer.add(reward);
    cursorY += (condFontSize * 1.8) + 18;

    // ── Accept button ──
    const acceptBtn = new Button(scene, {
      x: pw / 2,
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
    this.panelContainer.add(acceptBtn);

    cursorY += btnHeight + btnGap;

    // ── Retreat button ──
    const retreatBtn = new Button(scene, {
      x: pw / 2,
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
    this.panelContainer.add(retreatBtn);
  }
}
