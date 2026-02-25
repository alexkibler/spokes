import type { ContentRegistry } from '../core/roguelike/registry/ContentRegistry';
import type { SaveManager } from './SaveManager';
import type { RemoteService } from '../network/RemoteService';
import type { SessionService } from './game/SessionService';
import type { RunManager } from '../core/roguelike/RunManager';

export interface GameServices {
  contentRegistry: ContentRegistry;
  saveManager: SaveManager;
  remoteService: RemoteService;
  sessionService: SessionService;
  runManager: RunManager;
}
