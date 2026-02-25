import type { ContentRegistry } from '../roguelike/registry/ContentRegistry';
import type { SaveManager } from './SaveManager';
import type { RemoteService } from './RemoteService';
import type { SessionService } from './SessionService';
import type { RunManager } from '../roguelike/RunManager';

export interface GameServices {
  contentRegistry: ContentRegistry;
  saveManager: SaveManager;
  remoteService: RemoteService;
  sessionService: SessionService;
  runManager: RunManager;
}
