import { io, Socket } from 'socket.io-client';
import type { RunModifiers, ModifierLogEntry } from '../roguelike/RunState';

export type CursorDirection = 'up' | 'down' | 'left' | 'right';

export interface PauseStateData {
  inventory: string[];
  equipped: Record<string, string>;
  modifiers: RunModifiers;
  modifierLog: ModifierLogEntry[];
  ftpW: number;
  gold: number;
  isRoguelike: boolean;
}

export class RemoteService {
  private static instance: RemoteService;
  private socket: Socket | null = null;
  private roomCode: string | null = null;

  // Event handlers
  private cursorMoveHandlers: ((direction: CursorDirection) => void)[] = [];
  private cursorSelectHandlers: (() => void)[] = [];
  private useItemHandlers: ((itemId: string) => void)[] = [];
  private pauseHandlers: (() => void)[] = [];
  private resumeHandlers: (() => void)[] = [];
  private backToMapHandlers: (() => void)[] = [];
  private saveQuitHandlers: (() => void)[] = [];

  private constructor() {}

  public static getInstance(): RemoteService {
    if (!RemoteService.instance) {
      RemoteService.instance = new RemoteService();
    }
    return RemoteService.instance;
  }

  public async initHost(): Promise<string> {
    if (this.roomCode) return this.roomCode;

    if (!this.socket) {
      this.socket = io();
    }

    return new Promise((resolve, reject) => {
      if (this.socket!.connected) {
        this.doCreateRoom(resolve, reject);
      } else {
        this.socket!.once('connect', () => {
          this.doCreateRoom(resolve, reject);
        });
      }

      this.socket!.once('connect_error', (err) => {
        console.error('Socket connection error:', err);
        reject(err);
      });
    });
  }

  private doCreateRoom(resolve: (code: string) => void, reject: (err: any) => void) {
    this.socket!.emit('HOST_CREATE_ROOM', (response: { roomCode?: string; error?: string }) => {
      if (response.error) {
        reject(response.error);
      } else if (response.roomCode) {
        this.roomCode = response.roomCode;
        console.log('Room created:', this.roomCode);
        this.setupListeners();
        resolve(response.roomCode);
      }
    });
  }

  private setupListeners() {
    if (!this.socket) return;

    // Avoid duplicate listeners if called multiple times
    this.socket.off('CLIENT_INPUT');
    this.socket.off('CLIENT_CONNECTED');

    this.socket.on('CLIENT_INPUT', (payload: any) => {
      console.log('Received input:', payload);
      if (payload.type === 'dpad') {
        this.emitCursorMove(payload.direction);
      } else if (payload.type === 'action' && payload.action === 'select') {
        this.emitCursorSelect();
      } else if (payload.type === 'action' && payload.action === 'pause') {
        this.emitPause();
      } else if (payload.type === 'action' && payload.action === 'resume') {
        this.emitResume();
      } else if (payload.type === 'action' && payload.action === 'backToMap') {
        this.emitBackToMap();
      } else if (payload.type === 'action' && payload.action === 'saveQuit') {
        this.emitSaveQuit();
      } else if (payload.type === 'item') {
        this.emitUseItem(payload.itemId);
      }
    });

    this.socket.on('CLIENT_CONNECTED', (payload: any) => {
        console.log('Client connected:', payload);
    });
  }

  public sendStateUpdate(data: any) {
    if (this.socket && this.roomCode) {
      this.socket.emit('HOST_STATE_UPDATE', data);
    }
  }

  public sendPauseState(data: PauseStateData) {
    if (this.socket && this.roomCode) {
      this.socket.emit('HOST_PAUSE_STATE', data);
    }
  }

  public sendResumeState() {
    if (this.socket && this.roomCode) {
      this.socket.emit('HOST_RESUME_STATE', {});
    }
  }

  // --- Event Subscription ---

  public onCursorMove(handler: (direction: CursorDirection) => void) {
    this.cursorMoveHandlers.push(handler);
  }

  public offCursorMove(handler: (direction: CursorDirection) => void) {
    this.cursorMoveHandlers = this.cursorMoveHandlers.filter(h => h !== handler);
  }

  private emitCursorMove(direction: CursorDirection) {
    this.cursorMoveHandlers.forEach(h => h(direction));
  }

  public onCursorSelect(handler: () => void) {
    this.cursorSelectHandlers.push(handler);
  }

  public offCursorSelect(handler: () => void) {
    this.cursorSelectHandlers = this.cursorSelectHandlers.filter(h => h !== handler);
  }

  private emitCursorSelect() {
    this.cursorSelectHandlers.forEach(h => h());
  }

  public onUseItem(handler: (itemId: string) => void) {
    this.useItemHandlers.push(handler);
  }

  public offUseItem(handler: (itemId: string) => void) {
    this.useItemHandlers = this.useItemHandlers.filter(h => h !== handler);
  }

  private emitUseItem(itemId: string) {
    this.useItemHandlers.forEach(h => h(itemId));
  }

  public onPause(handler: () => void) {
    this.pauseHandlers.push(handler);
  }

  public offPause(handler: () => void) {
    this.pauseHandlers = this.pauseHandlers.filter(h => h !== handler);
  }

  private emitPause() {
    this.pauseHandlers.forEach(h => h());
  }

  public onResume(handler: () => void) { this.resumeHandlers.push(handler); }
  public offResume(handler: () => void) { this.resumeHandlers = this.resumeHandlers.filter(h => h !== handler); }
  private emitResume() { this.resumeHandlers.forEach(h => h()); }

  public onBackToMap(handler: () => void) { this.backToMapHandlers.push(handler); }
  public offBackToMap(handler: () => void) { this.backToMapHandlers = this.backToMapHandlers.filter(h => h !== handler); }
  private emitBackToMap() { this.backToMapHandlers.forEach(h => h()); }

  public onSaveQuit(handler: () => void) { this.saveQuitHandlers.push(handler); }
  public offSaveQuit(handler: () => void) { this.saveQuitHandlers = this.saveQuitHandlers.filter(h => h !== handler); }
  private emitSaveQuit() { this.saveQuitHandlers.forEach(h => h()); }

  public getRoomCode(): string | null {
      return this.roomCode;
  }
}
