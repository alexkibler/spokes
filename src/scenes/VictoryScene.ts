/**
 * VictoryScene.ts
 *
 * A simple celebratory screen shown after completing a Roguelike run.
 * Displays final stats and allows returning to the main menu.
 */

import Phaser from 'phaser';
import { RunManager } from '../core/roguelike/RunManager';
import { SaveManager } from '../services/SaveManager';
import { THEME } from '../theme';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VictoryScene' });
  }

  create(): void {
    // Run is complete — wipe the save so the menu shows a fresh state
    const saveManager = this.registry.get('saveManager') as SaveManager;
    if (saveManager) {
        saveManager.clearSave();
    }

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    this.cameras.main.setBackgroundColor('#1a1a2a');

    // Confetti / Particles (simple colored rects for now)
    // We don't have a 'particle' texture, so let's make a tiny graphics texture
    if (!this.textures.exists('particle')) {
        const g = this.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0xffffff);
        g.fillRect(0, 0, 8, 8);
        g.generateTexture('particle', 8, 8);
        g.destroy();
    }

    this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: w },
      y: -50,
      lifespan: 4000,
      speedY: { min: 100, max: 300 },
      speedX: { min: -50, max: 50 },
      scale: { start: 0.4, end: 0 },
      quantity: 2,
      frequency: 100,
      blendMode: 'ADD',
      emitting: true
    });

    // Title
    this.add.text(cx, cy - 100, 'CONGRATULATIONS!', {
      fontFamily: THEME.fonts.main,
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#ffcc00',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 40, 'RUN COMPLETED', {
      fontFamily: THEME.fonts.main,
      fontSize: '24px',
      color: '#ffffff',
      letterSpacing: 4,
    }).setOrigin(0.5);

    // Stats
    const runManager = this.registry.get('runManager') as RunManager;
    const run = runManager ? runManager.getRun() : null;
    const gold = run ? run.gold : 0;
    const floors = run ? run.runLength : 0;

    this.add.text(cx, cy + 40, `TOTAL GOLD EARNED: ${gold}`, {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      color: '#00f5d4',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 70, `FLOORS CLEARED: ${floors}/${floors}`, {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Return Button
    const btnY = cy + 150;
    const btnW = 200;
    const btnH = 50;

    const btn = this.add.rectangle(cx, btnY, btnW, btnH, THEME.colors.ui.panelBorder)
      .setInteractive({ useHandCursor: true });
    
    this.add.text(cx, btnY, 'MAIN MENU', {
      fontFamily: THEME.fonts.main,
      fontSize: THEME.fonts.sizes.large,
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0xcc8800));
    btn.on('pointerout', () => btn.setFillStyle(THEME.colors.ui.panelBorder));
    btn.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }
}
