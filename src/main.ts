/**
 * main.ts – Paper Peloton entry point
 *
 * Bootstraps the Phaser 3 game and registers scenes.
 * The canvas is inserted into #game-container defined in index.html.
 */

import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#e8dcc8',
  parent: 'game-container',
  scene: [MenuScene, GameScene],  // MenuScene starts first
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
