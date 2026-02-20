/**
 * main.ts – Paper Peloton entry point
 *
 * Bootstraps the Phaser 3 game and registers scenes.
 * The canvas is inserted into #game-container defined in index.html.
 */

import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { MapScene } from './scenes/MapScene';
import { GameScene } from './scenes/GameScene';
import { VictoryScene } from './scenes/VictoryScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#e8dcc8',
  parent: 'game-container',
  scene: [MenuScene, MapScene, GameScene, VictoryScene],  // MenuScene starts first
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
};

new Phaser.Game(config);
