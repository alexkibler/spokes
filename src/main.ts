/**
 * main.ts – Spokes entry point
 *
 * Bootstraps the Phaser 3 game and registers scenes.
 * The canvas is inserted into #game-container defined in index.html.
 */

import Phaser from 'phaser';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { MenuScene } from './scenes/MenuScene';
import { MapScene } from './scenes/MapScene';
import { GameScene } from './scenes/GameScene';
import { VictoryScene } from './scenes/VictoryScene';

import { ContentRegistry } from './roguelike/registry/ContentRegistry';
import { ContentBootstrapper } from './roguelike/content/ContentBootstrapper';
import { SaveManager } from './services/SaveManager';
import { LocalStorageProvider } from './services/storage/LocalStorageProvider';
import { RemoteService } from './services/RemoteService';
import { SessionService } from './services/SessionService';
import { RunManager } from './roguelike/RunManager';
import type { GameServices } from './services/ServiceLocator';

// Initialize Capacitor BLE — must run before any BleClient calls in the services
BleClient.initialize().catch((e) => {
  console.error('[main.ts] BleClient.initialize() failed', e);
});

// Dependency Injection Setup
const contentRegistry = new ContentRegistry();
ContentBootstrapper.bootstrap(contentRegistry);

const saveManager = new SaveManager(new LocalStorageProvider(), contentRegistry);
const remoteService = new RemoteService();
const sessionService = new SessionService();
const runManager = new RunManager(contentRegistry);

const services: GameServices = {
  contentRegistry,
  saveManager,
  remoteService,
  sessionService,
  runManager,
};

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
  callbacks: {
    postBoot: (game) => {
      game.registry.set('services', services);
      console.log('Services injected into registry');
    }
  }
};

new Phaser.Game(config);
